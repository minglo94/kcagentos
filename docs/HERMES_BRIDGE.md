# Hermes planning bridge

The first integration proposes plans only. It cannot dispatch jobs, use shell or browser tools, write files through model tools, or approve work. Steps default to `executor: "manual"`; only development `archie` and `reviewer` can propose `codex.readonly` inspection. Worker approval remains authoritative.

## Configuration

The parent launches `scripts/hermes_planner.py` with the installed Hermes virtual-environment Python, Hermes source directory on `PYTHONPATH`, and an explicit `HERMES_HOME` whose directory name is `agentos-planner`. Never point this at an existing personal profile. Parent settings are `HERMES_PYTHON`, `HERMES_SOURCE_DIR`, and `AGENTOS_HERMES_HOME`.

Create a dedicated directory containing only this credential-free `config.yaml`:

```yaml
model:
  provider: custom
  default: your-installed-local-model
  base_url: http://127.0.0.1:11434/v1
```

Only loopback HTTP endpoints are supported in this slice. No credentials are copied or resolved from global Hermes authentication. Profiles containing auth, dotenv, skills, plugins, hooks, memory or session databases are rejected. Config keys other than the displayed model fields are rejected.

## Protocol and checks

The parent sends one UTF-8 JSON stdin object `{ "goal": "…", "team": "school" }` (or `development`), then closes stdin. Maximum input is 16 KiB. Stdout contains exactly one JSON plan with `summary`, `steps`, `acceptance`, or a sanitized `{ "error": "code" }` and nonzero exit. Each step contains `id`, `title`, `agent`, `executor`, `dependsOn`, `instructions`; dependencies must refer to earlier steps. Output is capped at 64 KiB, 12 steps and 12 acceptance items. Text is untrusted proposed content, never executed as commands.

`--check` constructs the restricted agent and verifies no tools, with socket connections blocked. It reports `liveModelChecked: false`; successful dependency checks do not prove inference availability. During normal planning, socket connections are limited to loopback destinations. Unit tests run with `python -m unittest discover -s tests -p hermes_planner_test.py` using an interpreter with PyYAML installed.

The bridge explicitly supplies an empty toolset (Hermes distinguishes `[]` from `None`), verifies tool definitions and valid names are empty, and replaces all tool-execution entrypoints with a fail-closed denial. Memory, context files, identity, trajectories, checkpoints, fallback providers and session persistence are disabled. Plugin discovery and lifecycle hooks are suppressed before Hermes agent import. Config loads use sanitized in-memory defaults, preventing default profile seeding; Hermes may create only its dedicated logs/sessions directories. Changed upstream APIs fail closed; re-run checks after Hermes updates.

Hermes currently imposes a 64K context metadata floor even for no-tools planning. The bridge sets that internal metadata floor to avoid network model discovery; it does not claim to verify the actual model context window. Input is limited to 4,000 goal characters and output to 4,096 generated tokens. A real model request is still required to verify inference and effective context limits.

The parent must bound process duration, collect stdout/stderr within size limits, cancel by terminating the child, and pass a minimal environment without provider credentials, proxy variables or unrelated Hermes settings. Parent cancellation is process termination, not a live ACP session. This adapter does not sandbox a malicious Python installation or protect against other local users modifying its config; it restricts model actions in the trusted installed runtime. No live inference was exercised by unit tests.
