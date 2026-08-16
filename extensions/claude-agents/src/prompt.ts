/** Model-facing strings for the namespaced Claude agent tools. */

export const SUBAGENT_SPAWN_TOOL_DESCRIPTION =
  "Spawn one autonomous, headless Claude Code agent through the Claude Agent SDK in a trusted working directory. Fire-and-forget: the tool returns an id immediately, then delivers the result automatically or through claude_agent_wait. The child cannot ask the user or launch Agent/Task children, cannot see this conversation, and runs with permission checks bypassed, so provide a complete self-contained prompt. At most four Claude agents run concurrently.";

export const SUBAGENT_SPAWN_PROMPT_SNIPPET =
  "Spawn a headless Claude Code agent for a complete, self-contained background task";

export const SUBAGENT_SPAWN_PROMPT_GUIDELINES = [
  "Use claude_agent_spawn only when the user asks for Claude, Claude Code, or Claude Agent SDK execution, or when Claude-native execution is materially useful.",
  "Give claude_agent_spawn a complete standalone prompt with all required context and paths; the Claude agent cannot see this conversation or ask the user questions.",
  "After claude_agent_spawn, keep working when possible; results arrive automatically. Use claude_agent_wait only when progress depends on the result.",
];

export const SUBAGENT_SPAWN_PARAMETER_DESCRIPTIONS = {
  prompt:
    "Complete standalone task for the Claude agent, including required context, paths, constraints, and expected report",
  name: "Short human-readable name shown in Claude agent listings and the UI",
  workingDir:
    "Trusted working directory for permission-bypassing Claude execution (default: current working directory)",
  model:
    "Claude model alias. Omit for the Claude Code default unless the user requested a model or the alias is locally verified.",
  reasoningEffort:
    "Claude thinking effort. Omit to use the Claude Code default.",
};

/** Build the spawn acknowledgement and namespaced follow-up guidance. */
export function buildSubagentSpawnResult(options: {
  id: string;
  title: string;
  modelLabel: string;
  cwd: string;
}) {
  return (
    `Spawned Claude agent ${options.id} "${options.title}" (${options.modelLabel}, ${options.cwd}).\n` +
    "It runs in the background and its result will be delivered when it finishes. " +
    `Use claude_agent_wait(ids: ["${options.id}"]) to block, claude_agent_cancel to stop it, claude_agent_check to inspect it, or claude_agent_list to list all Claude agents.`
  );
}

export const SUBAGENT_WAIT_TOOL_DESCRIPTION =
  "Block until all listed Claude agents settle, then return their final outputs. Prefer automatic result delivery unless work cannot continue without the result.";
export const SUBAGENT_WAIT_PARAMETER_DESCRIPTIONS = {
  ids: 'Claude agent ids to wait for, for example ["claude-1", "claude-2"]',
};

export const SUBAGENT_CANCEL_TOOL_DESCRIPTION =
  "Cancel one or more running Claude agents while preserving their partial transcript metadata.";
export const SUBAGENT_CANCEL_PARAMETER_DESCRIPTIONS = {
  ids: 'Claude agent ids to cancel, for example ["claude-1"]',
};

export const SUBAGENT_CHECK_TOOL_DESCRIPTION =
  "Inspect one Claude agent's status and recent activity without blocking or consuming its result.";
export const SUBAGENT_CHECK_PARAMETER_DESCRIPTIONS = {
  id: "Claude agent id",
};

export const SUBAGENT_LIST_TOOL_DESCRIPTION =
  "List all tracked Claude agents, including running and settled sessions.";

/** Build the Claude result wrapper injected into the parent model context. */
export function buildSubagentResultMessage(options: {
  id: string;
  title: string;
  status: "running" | "done" | "error";
  errorText?: string;
  output: string;
}) {
  const verb = options.status === "error" ? "failed" : "finished";
  let text = `Claude agent ${options.id} "${options.title}" ${verb}.`;
  if (options.errorText) text += `\nError: ${options.errorText}`;
  return `${text}\n\n${options.output}`;
}
