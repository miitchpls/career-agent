"""Background AI runs: one at a time per kind (a CV import, a profile review), or one per
posting (a fit score, a tailored CV).

An AI CLI takes a minute or two, so a run goes to a thread and the request returns at once.
Cancelling frees the slot immediately: the run's process is killed as soon as it exists (even
if it starts after the cancel), and the run's result is thrown away by its owner, which checks
`cancelled()` and writes with a status guard.
"""

import contextvars
import json
import subprocess
import threading
from collections.abc import Callable

from pydantic import ValidationError

from . import ai
from .i18n import t


class _Run:
    def __init__(self) -> None:
        self.proc: subprocess.Popen | None = None
        self.cancelled = False


class Slot:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._runs: dict[
            int, _Run
        ] = {}  # run id -> run; cancelled ones until they exit

    def running(self) -> bool:
        with self._lock:
            return any(not r.cancelled for r in self._runs.values())

    def idle(self) -> bool:
        """No run at all, not even a cancelled one still exiting (tests wait for this)."""
        with self._lock:
            return not self._runs

    def claim(self, create: Callable[[], int], busy: str) -> int:
        """Record a new run (`create` returns its id) unless one is going: RuntimeError(busy)."""
        with self._lock:
            if any(not r.cancelled for r in self._runs.values()):
                raise RuntimeError(busy)
            run_id = create()
            self._runs[run_id] = _Run()
        return run_id

    def spawn(self, target: Callable[..., None], *args) -> None:
        """Run `target` in a thread that keeps the request's context (its language)."""
        ctx = contextvars.copy_context()
        threading.Thread(target=ctx.run, args=(target, *args), daemon=True).start()

    def cancel(self, on_cancel: Callable[[int], None]) -> None:
        """Cancel every live run: `on_cancel(id)` records it, then its process is killed."""
        with self._lock:
            runs = [(i, r) for i, r in self._runs.items() if not r.cancelled]
            for _, r in runs:
                r.cancelled = True
        for run_id, r in runs:
            on_cancel(run_id)
            if r.proc and r.proc.poll() is None:
                r.proc.terminate()

    def started(self, run_id: int) -> Callable[[subprocess.Popen], None]:
        """The `on_start` callback for ai.run: keeps the process, or kills it if cancelled."""

        def register(proc: subprocess.Popen) -> None:
            with self._lock:
                run = self._runs.get(run_id)
                if run:
                    run.proc = proc
                kill = run is None or run.cancelled
            if kill:  # cancelled before the process existed
                proc.terminate()

        return register

    def cancelled(self, run_id: int) -> bool:
        with self._lock:
            run = self._runs.get(run_id)
            return run is None or run.cancelled

    def done(self, run_id: int) -> None:
        with self._lock:
            self._runs.pop(run_id, None)


class Pool:
    """Runs keyed by posting: one at a time per posting, at most `cap` live at once.

    Cancelled runs count against the cap until their process has exited, so cancelling and
    restarting can't pile up processes."""

    def __init__(self, cap: int) -> None:
        self.cap = cap
        self._lock = threading.Lock()
        self._slots: dict[str, Slot] = {}

    def running(self, key: str) -> bool:
        with self._lock:
            slot = self._slots.get(key)
        return bool(slot and slot.running())

    def idle(self) -> bool:
        with self._lock:
            return all(s.idle() for s in self._slots.values())

    def claim(
        self, key: str, create: Callable[[], int], busy: str, busy_many: str
    ) -> tuple[Slot, int]:
        """Record a new run for `key`: RuntimeError(busy) when one is going for it,
        RuntimeError(busy_many) when the pool is full. One lock for the cap and the claim:
        two requests can't both take the last place."""
        with self._lock:
            live = sum(not s.idle() for s in self._slots.values())
            slot = self._slots.setdefault(key, Slot())
            if live >= self.cap and not slot.running():
                self._prune(key)
                raise RuntimeError(busy_many)
            try:
                return slot, slot.claim(create, busy)
            except RuntimeError:
                self._prune(key)
                raise

    def cancel(self, key: str, on_cancel: Callable[[int], None]) -> None:
        with self._lock:
            slot = self._slots.get(key)
        if slot:
            slot.cancel(on_cancel)

    def done(self, key: str, slot: Slot, run_id: int) -> None:
        slot.done(run_id)
        with self._lock:
            self._prune(key)

    def _prune(self, key: str) -> None:
        """Forget a key's slot once nothing runs in it (call with the lock held)."""
        slot = self._slots.get(key)
        if slot and slot.idle():
            del self._slots[key]


class PostingRuns:
    """AI runs about one posting each (a fit score, a tailored CV), sharing one lifecycle:
    a row is recorded as running, the AI CLI runs in a thread, its answer is checked and
    stored as ready, or the run is failed with a message for the user. At most `cap` run at
    once, one per posting; cancelling marks the row and kills the process.

    `update(run_id, when_status=..., **fields)` writes the run's row (db.update_score,
    db.update_cv)."""

    def __init__(self, update: Callable[..., bool], cap: int = 3) -> None:
        self._update = update
        self._pool = Pool(cap)

    def running(self, url: str) -> bool:
        return self._pool.running(url)

    def idle(self) -> bool:
        return self._pool.idle()

    def launch(
        self,
        url: str,
        create: Callable[[], int],
        busy: str,
        busy_many: str,
        provider: ai.Provider,
        call: Callable[[Callable], dict],
        check: Callable[[dict], dict],
    ) -> None:
        """Record a run with `create` and start it: `call(on_start)` asks the AI and returns
        its answer, `check(answer)` returns the columns to store as ready (raising
        TypeError/ValueError/KeyError/AttributeError/ValidationError on a wrong shape).
        RuntimeError(busy or busy_many) when it can't start."""
        slot, run_id = self._pool.claim(url, create, busy, busy_many)
        slot.spawn(self._run, url, slot, run_id, provider, call, check)

    def cancel(self, url: str) -> None:
        self._pool.cancel(
            url,
            lambda run_id: self._update(
                run_id, when_status="running", status="cancelled"
            ),
        )

    def _run(self, url, slot: Slot, run_id: int, provider, call, check) -> None:
        def fail(**fields) -> None:
            self._update(run_id, when_status="running", status="failed", **fields)

        try:
            if slot.cancelled(run_id):
                return
            try:
                raw = call(slot.started(run_id))
            except ai.AiError as e:
                fail(error=str(e))
                return
            raw_json = json.dumps(raw, ensure_ascii=False)
            try:
                fields = check(raw)
            except (ValidationError, TypeError, ValueError, KeyError, AttributeError):
                fail(error=t("ai_invalid", name=provider.name), raw=raw_json)
                return
            self._update(
                run_id, when_status="running", status="ready", raw=raw_json, **fields
            )
        except Exception as e:  # never leave a run "running" forever
            fail(error=t("ai_failed", name=provider.name, why=type(e).__name__))
            raise
        finally:
            self._pool.done(url, slot, run_id)
