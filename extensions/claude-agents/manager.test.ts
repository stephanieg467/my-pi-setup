import assert from "node:assert/strict";
import test from "node:test";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { BackendRegistry, type SubagentBackend } from "./src/backend.ts";
import type { ParentContext, SpawnTask } from "./src/domain.ts";
import { SubagentManager, SubagentManagerLive } from "./src/manager.ts";
import { createDeferredResultDelivery } from "./src/result-delivery.ts";

const scriptedClaudeBackend: SubagentBackend = {
  name: "claude",
  capabilities: {
    steering: true,
    modelSelection: true,
    reasoningEffort: true,
  },
  available: Effect.succeed(true),
  spawn: () =>
    Effect.succeed({
      meta: Effect.succeed({
        backend: "claude" as const,
        modelLabel: "claude/test",
        contextWindow: 200_000,
      }),
      events: Stream.make(
        { _tag: "RunStarted" as const },
        {
          _tag: "AssistantMessage" as const,
          parts: [{ type: "text" as const, text: "scripted response" }],
        },
        {
          _tag: "UsageChanged" as const,
          tokens: 48_712,
          contextWindow: 200_000,
        },
        {
          _tag: "RunSettled" as const,
          outcome: {
            _tag: "Completed" as const,
            finalText: "scripted response",
          },
        },
      ),
      send: () => Effect.void,
      interrupt: Effect.void,
    }),
};

const TestRegistryLive = Layer.succeed(
  BackendRegistry,
  new Map([["claude", scriptedClaudeBackend]]),
);

const parent: ParentContext = {
  parentCwd: process.cwd(),
  projectTrusted: false,
};

function task(): SpawnTask {
  return {
    prompt: "exercise deterministic manager folding",
    title: "manager test",
    cwd: process.cwd(),
    parent,
  };
}

test("waitFor consumes a settlement before automatic result delivery", async () => {
  let releaseSettlement!: () => void;
  const settlementGate = new Promise<void>((resolve) => {
    releaseSettlement = resolve;
  });
  const gatedBackend: SubagentBackend = {
    ...scriptedClaudeBackend,
    spawn: () =>
      scriptedClaudeBackend.spawn(task()).pipe(
        Effect.map((session) => ({
          ...session,
          events: Stream.concat(
            Stream.make(
              { _tag: "RunStarted" as const },
              {
                _tag: "AssistantMessage" as const,
                parts: [{ type: "text" as const, text: "scripted response" }],
              },
            ),
            Stream.fromEffect(
              Effect.promise(async () => {
                await settlementGate;
                return {
                  _tag: "RunSettled" as const,
                  outcome: {
                    _tag: "Completed" as const,
                    finalText: "scripted response",
                  },
                };
              }),
            ),
          ),
        })),
      ),
  };
  const runtime = ManagedRuntime.make(
    SubagentManagerLive.pipe(
      Layer.provide(
        Layer.succeed(BackendRegistry, new Map([["claude", gatedBackend]])),
      ),
    ),
  );
  const delivery = createDeferredResultDelivery<{ id: string }>();
  const settlements: Array<{ id: string; consumed: boolean }> = [];

  try {
    const manager = await runtime.runPromise(SubagentManager);
    manager.view.setOnSettled((snapshot, consumed) => {
      settlements.push({ id: snapshot.id, consumed });
      if (consumed) delivery.consume([snapshot.id]);
      else delivery.defer({ id: snapshot.id });
    });

    const spawned = await runtime.runPromise(manager.spawn("claude", task()));
    await runtime.runPromise(
      manager.waitFor([spawned.id], () => releaseSettlement()),
    );

    assert.deepEqual(settlements, [{ id: spawned.id, consumed: true }]);
    assert.equal(manager.view.get(spawned.id)?.status, "done");
    assert.deepEqual(delivery.drain(), []);
  } finally {
    await runtime.dispose();
  }
});

test("manager folds a completed Claude run into its public snapshot", async () => {
  const runtime = ManagedRuntime.make(
    SubagentManagerLive.pipe(Layer.provide(TestRegistryLive)),
  );

  try {
    const manager = await runtime.runPromise(SubagentManager);
    const spawned = await runtime.runPromise(manager.spawn("claude", task()));
    await runtime.runPromise(manager.waitFor([spawned.id]));

    const completed = manager.view.get(spawned.id);
    assert.equal(completed?.status, "done");
    assert.equal(completed?.finalText, "scripted response");
    assert.equal(completed?.turns, 1);
    assert.deepEqual(completed?.usage, {
      tokens: 48_712,
      contextWindow: 200_000,
    });
    assert.deepEqual(completed?.transcript, [
      {
        kind: "assistant",
        parts: [{ type: "text", text: "scripted response" }],
      },
    ]);
  } finally {
    await runtime.dispose();
  }
});
