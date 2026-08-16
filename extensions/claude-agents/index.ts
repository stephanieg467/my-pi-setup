/** Namespaced Pi bridge for long-lived Claude Agent SDK sessions. */

import * as fs from "node:fs";
import * as path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  getAgentDir,
  getMarkdownTheme,
  ProjectTrustStore,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { Markdown, Text } from "@earendil-works/pi-tui";
import { registerBackgroundWorkProvider } from "pi-subagents/background-work";
import { Type } from "typebox";
import {
  formatElapsed,
  latestText,
  REASONING_EFFORTS,
  type SubagentSnapshot,
} from "./src/domain.ts";
import {
  formatActivityStatus,
  formatContextUtilization,
} from "./src/format.ts";
import { SubagentManager, type SubagentManagerShape } from "./src/manager.ts";
import {
  buildSubagentResultMessage,
  buildSubagentSpawnResult,
  SUBAGENT_CANCEL_PARAMETER_DESCRIPTIONS,
  SUBAGENT_CANCEL_TOOL_DESCRIPTION,
  SUBAGENT_CHECK_PARAMETER_DESCRIPTIONS,
  SUBAGENT_CHECK_TOOL_DESCRIPTION,
  SUBAGENT_LIST_TOOL_DESCRIPTION,
  SUBAGENT_SPAWN_PARAMETER_DESCRIPTIONS,
  SUBAGENT_SPAWN_PROMPT_GUIDELINES,
  SUBAGENT_SPAWN_PROMPT_SNIPPET,
  SUBAGENT_SPAWN_TOOL_DESCRIPTION,
  SUBAGENT_WAIT_PARAMETER_DESCRIPTIONS,
  SUBAGENT_WAIT_TOOL_DESCRIPTION,
} from "./src/prompt.ts";
import { createDeferredResultDelivery } from "./src/result-delivery.ts";
import {
  createSubagentRuntime,
  runTool,
  type SubagentRuntime,
} from "./src/runtime.ts";
import { openSubagentPicker } from "./src/ui/takeover.ts";

const SUBAGENT_OUTPUT_MAX_BYTES = 24 * 1024;
const WAIT_OUTPUT_MAX_BYTES = 48 * 1024;
const WAIT_PER_AGENT_MAX_BYTES = 16 * 1024;
const STATUS_KEY = "claude-agents";
const RESULT_MESSAGE_TYPE = "claude-agent-result";
const BACKGROUND_PROVIDER_NAME = "claude-agent-sdk";

/** Format one Claude agent snapshot for check/list output. */
function describeSubagent(snap: SubagentSnapshot) {
  const details = [
    snap.meta.modelLabel ?? "?",
    formatContextUtilization(snap.usage),
    formatElapsed(snap),
    snap.cwd,
  ].filter(Boolean);
  const transcript = snap.meta.sessionFilePath
    ? `\nTranscript: ${snap.meta.sessionFilePath}`
    : "";
  return `${snap.id} [${snap.status}] "${snap.title}" (${details.join(", ")})${transcript}`;
}

/** Append the native transcript path when Claude has reported one. */
function withTranscriptPath(text: string, snap: SubagentSnapshot): string {
  return snap.meta.sessionFilePath
    ? `${text}\n\n[Transcript: ${snap.meta.sessionFilePath}]`
    : text;
}

/** Truncate model-facing output while retaining its transcript location. */
function truncatedOutput(
  snap: SubagentSnapshot,
  maxBytes = SUBAGENT_OUTPUT_MAX_BYTES,
): string {
  const output = snap.finalText || "(no output)";
  const truncation = truncateHead(output, {
    maxBytes: Math.min(maxBytes, DEFAULT_MAX_BYTES),
    maxLines: Math.min(600, DEFAULT_MAX_LINES),
  });
  if (!truncation.truncated) {
    return withTranscriptPath(truncation.content, snap);
  }
  const notice = `[Output truncated: ${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)} shown.]`;
  return withTranscriptPath(`${truncation.content}\n\n${notice}`, snap);
}

/**
 * Resolve Pi trust for a child directory, inheriting the live decision only
 * when it is the current project directory.
 */
function resolveChildProjectTrust(options: {
  parentCwd: string;
  childCwd: string;
  parentTrusted: boolean;
}) {
  if (path.resolve(options.childCwd) === path.resolve(options.parentCwd)) {
    return options.parentTrusted;
  }
  try {
    return new ProjectTrustStore(getAgentDir()).get(options.childCwd) === true;
  } catch {
    return false;
  }
}

export default function (pi: ExtensionAPI) {
  let runtime: SubagentRuntime | undefined;
  let managerPromise: Promise<SubagentManagerShape> | undefined;
  let managerView: SubagentManagerShape["view"] | undefined;
  let sessionContext: ExtensionContext | undefined;
  let ui: ExtensionUIContext | undefined;
  let parentSessionId: string | undefined;
  let unregisterBackgroundProvider: (() => void) | undefined;
  let unsubscribeStatus: (() => void) | undefined;
  const resultDelivery = createDeferredResultDelivery<SubagentSnapshot>();

  /** Return this session's lazily created Effect runtime. */
  const getRuntime = () => (runtime ??= createSubagentRuntime());

  /** Resolve and wire the single manager instance for this Pi session. */
  const getManager = () => {
    managerPromise ??= getRuntime()
      .runPromise(SubagentManager)
      .then((manager) => {
        managerView = manager.view;
        manager.view.setOnSettled(onSettled);
        unsubscribeStatus?.();
        unsubscribeStatus = manager.view.subscribe(() => updateStatus(manager));
        updateStatus(manager);
        return manager;
      });
    return managerPromise;
  };

  /** Update the namespaced footer status from normalized snapshots. */
  const updateStatus = (manager: SubagentManagerShape) => {
    if (!ui) return;
    const agents = manager.view.list();
    if (agents.length === 0) {
      ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const running = agents.filter((snap) => snap.status === "running").length;
    const failed = agents.filter((snap) => snap.status === "error").length;
    ui.setStatus(
      STATUS_KEY,
      formatActivityStatus(ui.theme, {
        running,
        failed,
        done: agents.length - running - failed,
      }),
    );
  };

  /** Inject one settled Claude result as a retractable Pi follow-up. */
  const deliverResult = (snap: SubagentSnapshot) => {
    pi.sendMessage(
      {
        customType: RESULT_MESSAGE_TYPE,
        content: buildSubagentResultMessage({
          id: snap.id,
          title: snap.title,
          status: snap.status,
          errorText: snap.errorText,
          output: truncatedOutput(snap),
        }),
        display: true,
        details: {
          id: snap.id,
          title: snap.title,
          status: snap.status,
          sessionFilePath: snap.meta.sessionFilePath,
        },
      },
      { deliverAs: "followUp", triggerTurn: true },
    );
  };

  /** Flush every deferred result exactly once. */
  const flushResults = () => {
    for (const snap of resultDelivery.drain()) deliverResult(snap);
  };

  /** Defer unconsumed settlements until the parent is idle. */
  const onSettled = (snap: SubagentSnapshot, consumed: boolean) => {
    if (!sessionContext) return;
    if (consumed) {
      resultDelivery.consume([snap.id]);
      return;
    }
    resultDelivery.defer({ ...snap, meta: { ...snap.meta } });
    if (sessionContext.isIdle()) flushResults();
  };

  /** Register lifecycle-only visibility with pi-subagents' public protocol. */
  const registerBackgroundProvider = () => {
    unregisterBackgroundProvider?.();
    unregisterBackgroundProvider = undefined;
    if (!parentSessionId) return;
    unregisterBackgroundProvider = registerBackgroundWorkProvider({
      name: BACKGROUND_PROVIDER_NAME,
      listActiveWork: () =>
        (managerView?.list() ?? [])
          .filter((snap) => snap.status === "running")
          .map((snap) => ({ id: snap.id, sessionId: parentSessionId! })),
    });
  };

  pi.on("session_start", (_event, ctx) => {
    sessionContext = ctx;
    ui = ctx.hasUI ? ctx.ui : undefined;
    parentSessionId = ctx.sessionManager.getSessionId() ?? undefined;
    registerBackgroundProvider();
  });

  pi.on("agent_settled", flushResults);

  pi.on("session_shutdown", async () => {
    sessionContext = undefined;
    unregisterBackgroundProvider?.();
    unregisterBackgroundProvider = undefined;
    parentSessionId = undefined;
    resultDelivery.clear();
    unsubscribeStatus?.();
    unsubscribeStatus = undefined;
    managerView = undefined;
    ui?.setStatus(STATUS_KEY, undefined);
    ui = undefined;
    const closing = runtime;
    runtime = undefined;
    managerPromise = undefined;
    await closing?.dispose();
  });

  pi.registerTool({
    name: "claude_agent_spawn",
    label: "Spawn Claude Agent",
    description: SUBAGENT_SPAWN_TOOL_DESCRIPTION,
    promptSnippet: SUBAGENT_SPAWN_PROMPT_SNIPPET,
    promptGuidelines: SUBAGENT_SPAWN_PROMPT_GUIDELINES,
    parameters: Type.Object({
      prompt: Type.String({
        description: SUBAGENT_SPAWN_PARAMETER_DESCRIPTIONS.prompt,
      }),
      name: Type.String({
        description: SUBAGENT_SPAWN_PARAMETER_DESCRIPTIONS.name,
      }),
      working_dir: Type.Optional(
        Type.String({
          description: SUBAGENT_SPAWN_PARAMETER_DESCRIPTIONS.workingDir,
        }),
      ),
      model: Type.Optional(
        Type.String({ description: SUBAGENT_SPAWN_PARAMETER_DESCRIPTIONS.model }),
      ),
      reasoning_effort: Type.Optional(
        StringEnum(REASONING_EFFORTS, {
          description: SUBAGENT_SPAWN_PARAMETER_DESCRIPTIONS.reasoningEffort,
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = path.resolve(ctx.cwd, params.working_dir ?? ".");
      if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
        throw new Error(`working_dir is not a directory: ${cwd}`);
      }
      const trusted = resolveChildProjectTrust({
        parentCwd: ctx.cwd,
        childCwd: cwd,
        parentTrusted: ctx.isProjectTrusted(),
      });
      if (!trusted) {
        throw new Error(
          `Refusing to start a permission-bypassing Claude agent in untrusted directory: ${cwd}`,
        );
      }

      const manager = await getManager();
      const title = params.name.trim().slice(0, 160) || "Claude agent";
      const snap = await runTool(
        getRuntime(),
        manager.spawn("claude", {
          prompt: params.prompt,
          title,
          cwd,
          model: params.model,
          reasoningEffort: params.reasoning_effort,
          parent: { parentCwd: ctx.cwd, projectTrusted: true },
        }),
        { signal, interruptMessage: "Claude agent spawn aborted." },
      );

      return {
        content: [
          {
            type: "text",
            text: withTranscriptPath(
              buildSubagentSpawnResult({
                id: snap.id,
                title: snap.title,
                modelLabel: snap.meta.modelLabel ?? "Claude Code default",
                cwd,
              }),
              snap,
            ),
          },
        ],
        details: {
          id: snap.id,
          title: snap.title,
          cwd,
          model: snap.meta.modelLabel,
          sessionFilePath: snap.meta.sessionFilePath,
        },
      };
    },
  });

  pi.registerTool({
    name: "claude_agent_wait",
    label: "Wait for Claude Agents",
    description: SUBAGENT_WAIT_TOOL_DESCRIPTION,
    parameters: Type.Object({
      ids: Type.Array(Type.String(), {
        maxItems: 64,
        description: SUBAGENT_WAIT_PARAMETER_DESCRIPTIONS.ids,
      }),
    }),
    async execute(_toolCallId, params, signal, onUpdate) {
      const manager = await getManager();
      const ids = [...new Set(params.ids)];
      if (ids.length === 0) throw new Error("Provide at least one Claude agent id.");
      const known = manager.view.list().map((snap) => snap.id);
      const unknown = ids.filter((id) => !manager.view.get(id));
      if (unknown.length > 0) {
        throw new Error(
          `Unknown Claude agent id(s): ${unknown.join(", ")}. Known: ${known.join(", ") || "none"}.`,
        );
      }

      await runTool(
        getRuntime(),
        manager.waitFor(ids, (pending) => {
          onUpdate?.({
            content: [{ type: "text", text: `Waiting for ${pending.join(", ")}...` }],
            details: { pending },
          });
        }),
        {
          signal,
          interruptMessage: "Wait aborted. Claude agents keep running.",
        },
      );
      resultDelivery.consume(ids);

      const sections: string[] = [];
      let remainingBytes = WAIT_OUTPUT_MAX_BYTES;
      for (const id of ids) {
        const snap = manager.view.get(id);
        if (!snap) {
          sections.push(`## ${id}\n\n(no longer tracked)`);
          continue;
        }
        const verb = snap.status === "error" ? "failed" : "finished";
        let section = `## ${snap.id} "${snap.title}" ${verb}`;
        if (snap.errorText) section += `\nError: ${snap.errorText}`;
        const headerBytes = Buffer.byteLength(section, "utf8") + 2;
        const outputBudget = Math.max(
          512,
          Math.min(WAIT_PER_AGENT_MAX_BYTES, remainingBytes - headerBytes),
        );
        section += `\n\n${truncatedOutput(snap, outputBudget)}`;
        const sectionBytes = Buffer.byteLength(section, "utf8");
        if (sectionBytes > remainingBytes) {
          sections.push(
            `## ${snap.id} "${snap.title}"\n\n[omitted: total wait output limit reached]`,
          );
          break;
        }
        sections.push(section);
        remainingBytes -= sectionBytes;
      }

      const bounded = truncateHead(sections.join("\n\n---\n\n"), {
        maxBytes: WAIT_OUTPUT_MAX_BYTES - 128,
        maxLines: DEFAULT_MAX_LINES,
      });
      return {
        content: [
          {
            type: "text",
            text: bounded.truncated
              ? `${bounded.content}\n\n[wait output truncated at the total output limit]`
              : bounded.content,
          },
        ],
        details: {
          results: ids.map((id) => {
            const snap = manager.view.get(id);
            return {
              id,
              title: snap?.title,
              status: snap?.status,
              sessionFilePath: snap?.meta.sessionFilePath,
            };
          }),
        },
      };
    },
  });

  pi.registerTool({
    name: "claude_agent_cancel",
    label: "Cancel Claude Agents",
    description: SUBAGENT_CANCEL_TOOL_DESCRIPTION,
    parameters: Type.Object({
      ids: Type.Array(Type.String(), {
        description: SUBAGENT_CANCEL_PARAMETER_DESCRIPTIONS.ids,
      }),
    }),
    async execute(_toolCallId, params, signal) {
      const manager = await getManager();
      const ids = [...new Set(params.ids)];
      if (ids.length === 0) throw new Error("Provide at least one Claude agent id.");
      const known = manager.view.list().map((snap) => snap.id);
      const unknown = ids.filter((id) => !manager.view.get(id));
      if (unknown.length > 0) {
        throw new Error(
          `Unknown Claude agent id(s): ${unknown.join(", ")}. Known: ${known.join(", ") || "none"}.`,
        );
      }
      const report = await runTool(getRuntime(), manager.cancel(ids), {
        signal,
        interruptMessage: "Claude agent cancellation aborted.",
      });
      return {
        content: [
          {
            type: "text",
            text: report
              .map((entry) => {
                const message = entry.cancelled
                  ? `Cancelled ${entry.id} "${entry.title}".`
                  : `${entry.id} "${entry.title}" was already ${entry.status}.`;
                const snap = manager.view.get(entry.id);
                return snap ? withTranscriptPath(message, snap) : message;
              })
              .join("\n"),
          },
        ],
        details: {
          results: report.map((entry) => ({
            id: entry.id,
            title: entry.title,
            status: entry.status,
            sessionFilePath: manager.view.get(entry.id)?.meta.sessionFilePath,
          })),
        },
      };
    },
  });

  pi.registerTool({
    name: "claude_agent_check",
    label: "Check Claude Agent",
    description: SUBAGENT_CHECK_TOOL_DESCRIPTION,
    parameters: Type.Object({
      id: Type.String({ description: SUBAGENT_CHECK_PARAMETER_DESCRIPTIONS.id }),
    }),
    async execute(_toolCallId, params) {
      const manager = await getManager();
      const snap = manager.view.get(params.id);
      if (!snap) {
        const known = manager.view.list().map((item) => item.id);
        throw new Error(
          `Unknown Claude agent id "${params.id}". Known: ${known.join(", ") || "none"}.`,
        );
      }
      let text = `${describeSubagent(snap)}\nTurns: ${snap.turns}`;
      if (snap.errorText) text += `\nError: ${snap.errorText}`;
      const output = latestText(snap);
      if (output) {
        const preview = truncateHead(output, { maxBytes: 2048, maxLines: 20 });
        text += `\n\nLatest output:\n${preview.content}`;
        if (preview.truncated) text += "\n[...]";
      } else if (snap.status === "running") {
        text += "\n\n(no text output yet)";
      }
      return {
        content: [{ type: "text", text }],
        details: {
          id: snap.id,
          status: snap.status,
          turns: snap.turns,
          sessionFilePath: snap.meta.sessionFilePath,
        },
      };
    },
  });

  pi.registerTool({
    name: "claude_agent_list",
    label: "List Claude Agents",
    description: SUBAGENT_LIST_TOOL_DESCRIPTION,
    parameters: Type.Object({}),
    async execute() {
      const manager = await getManager();
      const agents = manager.view.list();
      return {
        content: [
          {
            type: "text",
            text:
              agents.length === 0
                ? "No Claude agents."
                : agents.map(describeSubagent).join("\n"),
          },
        ],
        details: {
          agents: agents.map((snap) => ({
            id: snap.id,
            title: snap.title,
            status: snap.status,
            sessionFilePath: snap.meta.sessionFilePath,
          })),
        },
      };
    },
  });

  pi.registerMessageRenderer(
    RESULT_MESSAGE_TYPE,
    (message, { expanded }, theme) => {
      const details = (message.details ?? {}) as {
        id?: string;
        title?: string;
        status?: string;
      };
      const failed = details.status === "error";
      const icon = failed ? theme.fg("error", "x") : theme.fg("success", "■");
      const header =
        `${icon} ` +
        theme.fg("accent", theme.bold(`Claude agent ${details.id ?? "?"}`)) +
        theme.fg(
          "muted",
          ` · ${details.title ?? ""} · ${failed ? "failed" : "finished"}`,
        );
      const content = typeof message.content === "string" ? message.content : "";
      const body = content.split("\n").slice(1).join("\n").trim();
      if (expanded) {
        const markdown = new Markdown(body, 0, 0, getMarkdownTheme());
        const heading = new Text(header, 0, 0);
        return {
          render: (width: number) => [
            ...heading.render(width),
            ...markdown.render(width),
          ],
          invalidate: () => {
            heading.invalidate();
            markdown.invalidate();
          },
        };
      }
      const lines = body.split("\n");
      let text = header;
      for (const line of lines.slice(0, 8)) {
        text += `\n${theme.fg("toolOutput", line)}`;
      }
      if (lines.length > 8) {
        text += `\n${theme.fg("dim", "... (ctrl+o to expand)")}`;
      }
      return new Text(text, 0, 0);
    },
  );

  pi.registerCommand("claude-agents", {
    description: "List, inspect, and take over Claude Agent SDK sessions",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        if (ctx.hasUI) {
          ctx.ui.notify("Claude agent takeover is only available in the TUI", "error");
        }
        return;
      }
      const manager = await getManager();
      if (manager.view.size() === 0) {
        ctx.ui.notify(
          "No Claude agents yet. Use claude_agent_spawn to start one.",
          "info",
        );
        return;
      }
      await openSubagentPicker(ctx, manager.view);
    },
  });
}
