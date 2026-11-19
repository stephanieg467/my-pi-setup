---
name: port-hooks-to-pi
description: Adapts existing Claude Code command hooks for Pi through @hsingjui/pi-hooks while preserving Claude compatibility. Use when adapting, converting, migrating, or troubleshooting Claude Code hooks for Pi, including missing lint feedback, skipped Stop verification, and session-marker failures.
---

# Port hooks to Pi

Accept a project path after `/skill:port-hooks-to-pi`; default to the current working directory. Resolve the path without rewriting the project's roots or changing branches. Read applicable `AGENTS.md` files and preserve existing work.

## Workflow

1. **Inventory before editing.** Inspect `.claude/settings.json`, `.claude/settings.local.json`, relevant user Claude settings, plugin hook declarations, and `.claude/hooks/`. Follow command references outside that directory when present. Inspect project `.pi/settings.json` and global Pi settings. Record each event, matcher, handler, timeout, prerequisite, and marker producer/consumer. Check executability, shell, `jq`, project verification commands, and installed project tools; do not let `npx` download missing dependencies. Do not blindly merge Claude settings files: determine which handlers are actually enabled.

2. **Verify the extension.** Run `pi --version` and `pi list`; resolve the installed Pi package from the actual executable/package manager and read its `docs/skills.md`, `docs/settings.md`, `docs/extensions.md`, and `docs/packages.md`. Resolve `@hsingjui/pi-hooks` from the configured package location, read its `package.json` and README, then inspect `src/config.ts`, `src/hook-context.ts`, `src/executor.ts`, `src/hooks/shared.ts`, and relevant event implementations. Confirm it is enabled, not merely present on disk. Read [references/compatibility.md](references/compatibility.md) for the examined version's behavior and shared-script fixes; recheck that behavior against the installed version. If absent, explain `pi install npm:@hsingjui/pi-hooks` (personal scope), or `pi install --local npm:@hsingjui/pi-hooks` from the project for project scope, and request approval before installing. Do not substitute native Pi event support for extension support.

3. **Merge supported handlers.** Summarize the proposed mapping and unsupported behaviors before writing. Add only supported command handlers under `hooks` in project `.pi/settings.json`. Preserve unrelated keys, existing events, handler order, and user changes. Keep Claude tool matchers intact; translate only the Pi copy to tools actually exposed by the target runtime, such as `Edit|Write|MultiEdit` → `^(edit|write)$` when `edit` and `write` are available. Do not invent `multiedit`. Compare handlers individually by event, effective matcher, resolved command, condition, timeout, and relevant options, including global handlers and event aliases. Treat equivalent command spellings or overlapping matchers as possible duplicate execution; inspect rather than blindly appending or deleting. Reuse or minimally adjust existing equivalent Pi entries. A second run must add nothing. Report unsupported events, hook types, fields, or semantics; leave their Claude configuration intact.

4. **Adapt shared scripts only where needed.** Prefer the same scripts for both agents. Trace every caller and both sides of marker state before editing. Apply the compatibility fixes in the linked reference without changing verification policy, lint rules, or project-root assumptions unrelated to the port. Change only the Pi command wrapper when Claude-specific environment expansion is the issue. Do not generate parallel Pi-specific scripts or a conversion framework.

5. **Validate, exercise, fix, repeat.** Parse the updated settings with `jq -e .`, inspect their hook structure against the installed implementation, and run `bash -n` on changed shell scripts. Review the diff for lost settings and duplicate execution, then recompute the mapping to confirm a rerun is a no-op. Exercise the real scripts in an isolated temporary project with realistic Claude and Pi payloads, capturing exit status, stdout JSON, stderr, and marker state. Run the bundled marker check as described below when the target uses the example layout. If its layout differs, adapt the check to the real producer and consumer rather than testing an invented implementation. Fix failures and rerun before claiming success. Do not run full audits or test suites merely to demonstrate the port.

6. **Report evidence and live checks.** Use the compact report below. Explain `/reload` after settings or script changes in Pi; confirm the extension loads and the project is trusted. In fresh Claude Code and Pi sessions, request a small edit through their actual edit/write tools and verify lint feedback, marker creation, Stop verification, one bounded retry, and cleanup. Observe actual verification evidence rather than inferring it from silence. Distinguish these manual live checks from direct script execution.

## Small before/after

Claude configuration stays unchanged:

```json
{"hooks":{"PostToolUse":[{"matcher":"Edit|Write|MultiEdit","hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/lint-edited-file.sh"}]}]}}
```

Merge this hook into Pi settings (not a replacement for the whole file):

```json
{"hooks":{"PostToolUse":[{"matcher":"^(edit|write)$","hooks":[{"type":"command","command":".claude/hooks/lint-edited-file.sh"}]}]}}
```

This assumes Pi starts in the project directory and the script is executable. Use a quoted absolute script path if the session working directory differs; do not rewrite the project root automatically.

## Gotchas

- Fix marker producers and consumers together. A raw Pi session-file path caused `touch` to fail and Stop to silently skip verification; the linked reference contains the minimal paired fix and its uniqueness limits.
- Preserve markers through the first failed verification, and remove them on success or after the bounded retry. Use `stop_hook_active` to avoid an infinite Stop loop.
- Resolve relative edited-file paths against payload `cwd`, accept the runtime's path fields, quote paths, and retain outside-project safeguards. Pi does not supply `CLAUDE_PROJECT_DIR` automatically.
- Account for global handlers: this extension concatenates global and project event arrays, so project overrides do not suppress global hooks.
- Do not promise coverage of every file change. A successful `bash` call that changes a file does not match an `edit|write` hook; failed tools use `PostToolUseFailure` instead of `PostToolUse`.
- Do not describe PostToolUse blocking as rollback. It gives feedback after the edit; Stop continuation is best-effort.
- Keep stdout valid JSON when emitting structured feedback, using `jq` for escaping. Preserve useful diagnostics and exit semantics; silent success alone proves nothing.
- Do not commit, force-add ignored files, install dependencies without approval, or modify unrelated configuration.

## Runnable marker regression

Run `python3 scripts/check-session-markers.py /path/to/project` relative to this skill directory. It copies the project's real `.claude/hooks/lint-edited-file.sh` and `verify-on-stop.sh` unchanged into a temporary Git project. It tests both session formats, relative payload paths, first-failure feedback and retention, bounded-retry reporting and cleanup, and successful cleanup. It replaces `npm` and `npx` only at the verification boundary; it neither runs project suites nor tests extension dispatch or live agents. Review the scripts first: a temporary directory is not an OS sandbox, and unexpected absolute commands may escape it.

Requirements: Python 3, Bash, Git, and `jq`; no Python packages. If missing, report them and ask before installation (on Debian/Ubuntu: `sudo apt-get install python3 bash git jq`).

## Report

```text
Changed: <settings and shared scripts, or already converted>
Unsupported: <events/types/semantics, or none found>
Checked: <commands actually run and results; script-level versus live>
Manual: <remaining fresh-session checks for Claude and Pi>
```

## Load and invoke this skill

If the containing Pi package or skill directory is already configured, run `/reload`, then `/skill:port-hooks-to-pi /path/to/project`. With no path, it targets the session working directory.

For a one-session load without changing settings, start `pi --skill /absolute/path/to/port-hooks-to-pi`, then invoke the same slash command. A directory outside Pi's discovered/configured skill locations is not enabled by `/reload` alone.
