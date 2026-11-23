"""Background AI runs, one at a time per kind (a CV import, a profile review).

An AI CLI takes a minute or two, so a run goes to a thread and the request returns at once.
Cancelling frees the slot immediately: the run's process is killed as soon as it exists (even
if it starts after the cancel), and the run's result is thrown away by its owner, which checks
`cancelled()` and writes with a status guard.
"""

import contextvars
import subprocess
import threading
from collections.abc import Callable


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
