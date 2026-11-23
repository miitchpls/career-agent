"""AI engines: the coding CLIs already installed and signed in on this computer.

The app never asks for an API key. Like career-ops, it runs the user's own CLI headless
(`claude -p`, `codex exec`), so the user's subscription pays for the call and the login
stays the CLI's business. Only used to turn a CV into a profile draft.

Each run is locked down: no tools at all (so a CV can't make the model run commands or
read files), an empty temporary directory, no session left behind, and the user's hooks,
plugins and MCP servers left out.
"""

import json
import os
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path

from . import db
from .i18n import t

TIMEOUT_S = 600

# Where installers put CLIs that a server started outside a login shell may not see.
_EXTRA_DIRS = (
    "~/.local/bin",
    "~/.npm-global/bin",
    "~/.bun/bin",
    "~/.volta/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
)


class AiError(Exception):
    """A run that didn't produce usable output; the message is for the user."""


@dataclass
class Model:
    id: str
    label: str


@dataclass
class Provider:
    """What the settings show for one engine."""

    id: str
    name: str
    command: str
    install_url: str
    login: str
    installed: bool = False
    connected: bool = False
    # How the CLI is signed in ("Pro", "ChatGPT", "API key"); never the account's email.
    plan: str | None = None
    path: str | None = None
    models: list[Model] = field(default_factory=list)


def _which(binary: str) -> str | None:
    dirs = os.environ.get("PATH", "").split(os.pathsep)
    dirs += [os.path.expanduser(d) for d in _EXTRA_DIRS]
    return shutil.which(
        binary, path=os.pathsep.join(dict.fromkeys(d for d in dirs if d))
    )


def _quick(args: list[str]) -> subprocess.CompletedProcess | None:
    try:
        return subprocess.run(
            args,
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
            stdin=subprocess.DEVNULL,
        )
    except (OSError, subprocess.SubprocessError):
        return None


Runner = Callable[[subprocess.Popen], None]


def _communicate(
    args: list[str], stdin: str, cwd: str, on_start: Runner | None, name: str
) -> tuple[int, str, str]:
    try:
        proc = subprocess.Popen(
            args,
            cwd=cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
    except OSError as e:
        raise AiError(t("ai_failed", name=name, why=str(e))) from e
    if on_start:
        on_start(proc)
    try:
        out, err = proc.communicate(stdin, timeout=TIMEOUT_S)
    except subprocess.TimeoutExpired as e:
        proc.kill()
        proc.communicate()
        raise AiError(t("ai_timeout", name=name, minutes=TIMEOUT_S // 60)) from e
    return proc.returncode, out, err


def _last_line(text: str) -> str:
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    return lines[-1] if lines else ""


# --- Claude Code --------------------------------------------------------------------------

CLAUDE_MODELS = [
    Model("opus", "Opus"),
    Model("sonnet", "Sonnet"),
    Model("haiku", "Haiku"),
    Model("fable", "Fable"),
]


def _claude(p: Provider) -> None:
    p.models = list(CLAUDE_MODELS)
    res = _quick([p.path, "auth", "status"])
    if not res or res.returncode != 0:
        return
    try:
        status = json.loads(res.stdout)
    except ValueError:
        return
    p.connected = bool(status.get("loggedIn"))
    if p.connected:
        tier = status.get("planTier") or status.get("subscriptionType")
        p.plan = str(tier).capitalize() if tier else "API key"


def _run_claude(
    path: str, system: str, prompt: str, schema: dict, model: str | None, on_start
) -> dict:
    args = [
        path,
        "-p",
        "--safe-mode",  # no CLAUDE.md, hooks, plugins or MCP servers: auth works as usual
        "--output-format",
        "json",
        "--json-schema",
        json.dumps(schema),
        "--tools",
        "",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--system-prompt",
        system,
    ]
    if model:
        args += ["--model", model]
    with tempfile.TemporaryDirectory(prefix="career-agent-") as cwd:
        code, out, err = _communicate(args, prompt, cwd, on_start, "Claude Code")
    try:
        result = json.loads(out)
    except ValueError:
        try:
            result = json.loads(_last_line(out))
        except ValueError:
            why = _last_line(err) or _last_line(out) or f"exit {code}"
            raise AiError(t("ai_failed", name="Claude Code", why=why)) from None
    if result.get("is_error"):
        why = str(result.get("result") or result.get("subtype") or f"exit {code}")
        raise AiError(t("ai_failed", name="Claude Code", why=why))
    data = result.get("structured_output")
    if not isinstance(data, dict):
        raise AiError(t("ai_invalid", name="Claude Code"))
    return data


# --- Codex --------------------------------------------------------------------------------


# Every Codex feature that runs commands or code, or reaches outside the prompt.
_CODEX_NO_TOOLS = (
    "shell_tool",
    "unified_exec",
    "code_mode_host",
    "apps",
    "plugins",
    "browser_use",
    "in_app_browser",
    "computer_use",
    "image_generation",
    "view_image",
)


def _codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")


def _codex_models() -> list[Model]:
    """The models Codex itself lists, from its own cache."""
    try:
        cache = json.loads((_codex_home() / "models_cache.json").read_text())
        listed = [m for m in cache.get("models", []) if m.get("visibility") == "list"]
    except (OSError, ValueError, AttributeError):
        return []
    listed.sort(key=lambda m: m.get("priority", 99))
    return [
        Model(m["slug"], m.get("display_name") or m["slug"])
        for m in listed
        if m.get("slug")
    ]


def _codex(p: Provider) -> None:
    p.models = _codex_models()
    res = _quick([p.path, "login", "status"])
    if not res or res.returncode != 0:
        return
    said = (res.stdout + res.stderr).lower()
    p.connected = "logged in" in said
    if p.connected:
        p.plan = "ChatGPT" if "chatgpt" in said else "API key"


def _run_codex(
    path: str, system: str, prompt: str, schema: dict, model: str | None, on_start
) -> dict:
    with tempfile.TemporaryDirectory(prefix="career-agent-") as cwd:
        schema_file = Path(cwd, "schema.json")
        schema_file.write_text(json.dumps(schema))
        out_file = Path(cwd, "out.json")
        args = [
            path,
            "exec",
            "--skip-git-repo-check",
            "--ephemeral",
            "--ignore-user-config",  # no user MCP servers or profiles; auth still applies
            "--ignore-rules",
            # The sandbox stops writes, not reads: without these the CV could ask Codex to
            # read ~/.ssh and copy it into the answer. With them it has no tools at all.
            *(f"--disable={f}" for f in _CODEX_NO_TOOLS),
            "-c",
            'web_search="disabled"',
            "-s",
            "read-only",
            "--color",
            "never",
            "--output-schema",
            str(schema_file),
            "-o",
            str(out_file),
        ]
        if model:
            args += ["-m", model]
        args.append("-")  # prompt from stdin
        code, _, err = _communicate(
            args, f"{system}\n\n{prompt}", cwd, on_start, "Codex"
        )
        if code != 0:
            errors = [x for x in err.splitlines() if x.startswith("ERROR")]
            why = (
                errors[-1].removeprefix("ERROR:").strip()
                if errors
                else _last_line(err) or f"exit {code}"
            )
            raise AiError(t("ai_failed", name="Codex", why=why))
        try:
            data = json.loads(out_file.read_text())
        except (OSError, ValueError):
            raise AiError(t("ai_invalid", name="Codex")) from None
    if not isinstance(data, dict):
        raise AiError(t("ai_invalid", name="Codex"))
    return data


# --- Registry -----------------------------------------------------------------------------

_SPECS = {
    "claude": (
        {
            "name": "Claude Code",
            "command": "claude",
            "install_url": "https://claude.ai/code",
            "login": "claude",
        },
        _claude,
        _run_claude,
    ),
    "codex": (
        {
            "name": "Codex",
            "command": "codex",
            "install_url": "https://github.com/openai/codex",
            "login": "codex login",
        },
        _codex,
        _run_codex,
    ),
}


def detect() -> list[Provider]:
    """Every supported engine, with whether it's installed and signed in."""
    found = []
    for pid, (info, check, _) in _SPECS.items():
        p = Provider(id=pid, **info)
        p.path = _which(info["command"])
        p.installed = p.path is not None
        if p.installed:
            check(p)
        found.append(p)
    return found


_SETTINGS_KEY = "ai"


def saved_choice() -> dict:
    """{"provider": id | None, "model": id | None} as the user last picked them."""
    raw = db.get_setting(_SETTINGS_KEY)
    try:
        value = json.loads(raw) if raw else {}
    except ValueError:
        value = {}
    return {"provider": value.get("provider"), "model": value.get("model")}


def choose(provider: str, model: str | None, providers: list[Provider]) -> None:
    """Save the default engine. Raises ValueError (user message) for unknown ids."""
    p = next((x for x in providers if x.id == provider), None)
    if p is None:
        raise ValueError(t("ai_unknown"))
    if model and p.models and model not in {m.id for m in p.models}:
        raise ValueError(t("ai_model_unknown", name=p.name))
    db.set_setting(_SETTINGS_KEY, json.dumps({"provider": provider, "model": model}))


def resolve(providers: list[Provider] | None = None) -> tuple[Provider, str | None]:
    """The engine a run will use: the saved one while it's connected, otherwise the first
    connected engine. Model None means the CLI's own default."""
    providers = providers if providers is not None else detect()
    choice = saved_choice()
    saved = next((p for p in providers if p.id == choice["provider"]), None)
    if saved and saved.connected:
        return saved, choice["model"]
    if saved and saved.installed and not saved.connected:
        # The user picked it: say what's wrong rather than silently using another one.
        raise AiError(t("ai_not_connected", name=saved.name, login=saved.login))
    connected = next((p for p in providers if p.connected), None)
    if not connected:
        raise AiError(t("ai_none"))
    return connected, None


def run(
    provider: Provider,
    model: str | None,
    system: str,
    prompt: str,
    schema: dict,
    on_start: Runner | None = None,
) -> dict:
    """One structured completion: returns the JSON object matching `schema`."""
    _, _, runner = _SPECS[provider.id]
    assert provider.path
    return runner(provider.path, system, prompt, schema, model, on_start)


def describe(providers: list[Provider]) -> dict:
    """The settings payload: engines, the saved choice and what a run would use now."""
    try:
        active, model = resolve(providers)
        current = {"provider": active.id, "model": model}
    except AiError:
        current = None
    return {
        # Not the binary's path: the app may be reachable on the LAN.
        "providers": [
            {k: v for k, v in asdict(p).items() if k != "path"} for p in providers
        ],
        "saved": saved_choice(),
        "active": current,
    }
