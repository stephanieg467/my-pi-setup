---
name: claude-agent-sdk
description: Runs and manages headless Claude Code sessions through the Claude Agent SDK. Use when the user explicitly asks for Claude, Claude Code, or Claude SDK execution, or when Claude-native execution is materially desired.
compatibility: Requires an installed, authenticated Claude Code CLI and the claude-agents Pi extension.
---

# Claude Agent SDK

Use this capability deliberately. Prefer the existing `subagent` tool for ordinary delegation. Claude jobs are separate from `pi-subagents` chains, acceptance gates, worktrees, budgets, and intercom.

## Start a Claude job

Call `claude_agent_spawn` with:

- `prompt`: a complete standalone task. Include paths, context, constraints, and the expected report because the child cannot see this conversation or ask the user questions.
- `name`: a short descriptive label.
- `working_dir`: optional trusted directory, resolved from the current directory.
- `model`: omit unless the user requests a Claude model or a locally verified Claude Code alias.
- `reasoning_effort`: optional `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.

After spawning, continue other work when possible. At most four Claude agents run concurrently.

## Manage jobs

- `claude_agent_check`: nonblocking status and recent output for one id.
- `claude_agent_list`: all tracked Claude jobs.
- `claude_agent_wait`: block for one or more results only when progress depends on them. Explicit waits consume pending automatic delivery.
- `claude_agent_cancel`: stop active jobs while retaining partial activity.
- `/claude-agents`: open the TUI picker, transcript, and steering view.

## Security and runtime behavior

Claude jobs are autonomous and headless. They run with Claude Code permission checks bypassed, so the extension rejects untrusted working directories before starting the SDK query. Claude's native `Agent` and `Task` tools are disabled. Authentication and model access come from the installed Claude Code CLI; install and authenticate `claude` before use.

The background-work registration lets `pi-subagents` observe active lifecycle work only. It does not make Claude jobs members of normal chains or grant other `pi-subagents` orchestration features.
