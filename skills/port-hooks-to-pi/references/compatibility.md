# Compatibility notes

Grounded in installed `@hsingjui/pi-hooks` **0.0.2** and Pi **1.0.1**. These are observations, not promises about other versions. Resolve sources through `pi list` and the actual Pi executable rather than pinning these machines' installation paths.

## Extension behavior to verify

| Source | Observed behavior |
| --- | --- |
| `README.md`, `src/types.ts`, `src/pi-hooks.ts` | Command hooks for SessionStart, SessionEnd, PreCompact, PostCompact, PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit, and Stop; no supported HTTP, prompt, or agent handlers. |
| `src/config.ts` | Reads `~/.pi/agent/settings.json` and `<session cwd>/.pi/settings.json` directly; concatenates arrays globally then locally. CamelCase events and snake_case aliases both execute. Invalid settings JSON is silently ignored. |
| `src/config.ts` | Matchers are case-sensitive regex strings; missing, empty, or `*` matches everything. Invalid regex falls back to exact matching. |
| `src/hook-context.ts` | `session_id` is `getSessionFile()`, a full path, or `ephemeral`. |
| `src/executor.ts`, `src/hooks/shared.ts` | Runs `bash -c` in session `cwd` with JSON stdin and inherited environment, without setting `CLAUDE_PROJECT_DIR`. `timeout` is seconds; default is 60 seconds. `async` is declared but not implemented: execution is awaited. |
| `src/hooks/shared.ts` | Handler `if` works only for tool events; on other events it prevents execution. Tool comparison is case-insensitive; the input pattern is a simple `*` wildcard. Do not treat it as a shell glob or full Claude permission syntax. |
| `src/hooks/tool-hooks.ts` | Raw tool names and inputs are forwarded unchanged. Successful tool results fire PostToolUse; failed results fire PostToolUseFailure. |
| `src/hooks/stop-hooks.ts` | Stop maps to `agent_end`; JSON `decision: "block"` injects hidden feedback and requests another turn. Follow-up Stop receives `stop_hook_active: true`; nonblocking completion resets it. |
| `src/hooks/session-hooks.ts` | SessionStart sources are startup, resume, compact; SessionEnd reason is always other. Other Claude shutdown reasons cannot be preserved automatically. |
| `src/hooks/compact-hooks.ts` | PreCompact and PostCompact currently label the trigger manual even for automatic compaction. Do not claim auto-matcher parity. |
| `src/hooks/prompt-hooks.ts`, `src/hooks/stop-hooks.ts` | UserPromptSubmit and Stop ignore group matchers. Their blocking behavior uses successful JSON output, not exit code 2. |

The hook loader's global path is hard-coded to `~/.pi/agent` in this version, even if Pi uses a custom agent directory. Inspect that file as well as Pi's effective resource settings. The README mentions `/pi-hooks` commands, but the inspected entry point does not register them; do not depend on them for validation.

Exit code 2 denies PreToolUse, but only notifies for PostToolUse and PostToolUseFailure. Other nonzero exits produce error notifications. For shared PostToolUse/Stop feedback, prefer exit 0 with `jq`-built JSON. PreToolUse `permissionDecision: "ask"` does not open a permission UI. Verify each event's consumer before translating exit-based behavior. Do not blindly copy handler fields just because the types declare them.

## Shared-script compatibility

For scripts under `<project>/.claude/hooks/`, retain Claude's environment override and use a layout-specific fallback:

```bash
project_dir=${CLAUDE_PROJECT_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)}
cd -- "$project_dir" || exit 1
project_dir=$(pwd -P)
```

Adapt the fallback depth only to the actual script location. For edited paths, the examples use:

```bash
file=$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<< "$input")
[ -n "$file" ] || exit 0
cwd=$(jq -r '.cwd // empty' <<< "$input")
case "$file" in /*) ;; *) file="${cwd:-$project_dir}/$file" ;; esac
[ -f "$file" ] || exit 0
file=$(realpath -- "$file") || exit 1
case "$file" in "$project_dir"/*) ;; *) exit 0 ;; esac
```

Keep existing normalization or exclusions that the target requires. This is a compatibility excerpt, not a replacement script or new verification policy.

### Marker fix: both sides

With JSON in `$input`, use the same suffix in the marker producer and Stop consumer:

```bash
session=$(jq -r '.session_id | split("/")[-1]' <<< "$input")
marker="$project_dir/.claude/.edited-$session"
```

Producer: `touch "$marker" || exit 1`. Do not hide its stderr. Stop: check that marker before verification, retain it after the first failure, and remove it after success or the one bounded retry. On first failure, emit `jq -n --arg reason "$message" '{decision: "block", reason: $reason}'`. If `stop_hook_active` is true and verification still fails, emit `jq -n --arg message "$message" '{systemMessage: $message}'` with the retry-limit diagnostic, remove the marker, and finish without another block.

Basenames work for the observed plain Claude IDs and Pi session-file paths. They do not guarantee uniqueness for arbitrary IDs sharing a basename, or multiple `ephemeral` sessions in one project. If the workflow uses those cases, assess session identity and agree on a shared collision-safe scheme instead of claiming this fix suffices. Keep state project-local and session-specific.

## Read-only examples inspected

Both `/home/sgalata/Projects/pProjects/cc/cc-ecomm` and `/home/sgalata/Projects/pProjects/cc/boundless-checkout-react-cp` currently have Pi PostToolUse matcher `^(edit|write)$` plus Stop, reuse their Claude scripts, accept `file_path` and `path`, and normalize session IDs in **both** marker scripts. Claude settings retain `Edit|Write|MultiEdit` and `$CLAUDE_PROJECT_DIR` commands. The checkout project also normalizes `@` and `~` file prefixes. It is no longer an unfixed-marker example.

Their verification commands and changed-file selection differ and are project-specific. Neither is universally correct: for example, some Stop command argument expansion is unquoted and cannot safely handle all filenames with spaces. Preserve safeguards, inspect the target's actual code, and report unresolved limitations rather than copying the examples wholesale.
