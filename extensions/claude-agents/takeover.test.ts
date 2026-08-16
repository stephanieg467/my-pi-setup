import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileDashboardSelection,
  type DashboardSelection,
} from "./src/ui/takeover.ts";

test("dashboard selection follows its agent id and falls back by row", () => {
  const selection: DashboardSelection = { id: "claude-7", index: 6 };

  reconcileDashboardSelection(selection, [
    { id: "claude-new" },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `claude-${index + 1}`,
    })),
  ]);
  assert.deepEqual(selection, { id: "claude-7", index: 7 });

  reconcileDashboardSelection(selection, [
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `claude-${index + 1}`,
    })),
    { id: "claude-8" },
    { id: "claude-9" },
  ]);
  assert.deepEqual(selection, { id: "claude-9", index: 7 });

  reconcileDashboardSelection(selection, [
    { id: "claude-1" },
    { id: "claude-2" },
  ]);
  assert.deepEqual(selection, { id: "claude-2", index: 1 });

  reconcileDashboardSelection(selection, []);
  assert.deepEqual(selection, { id: undefined, index: 0 });
});
