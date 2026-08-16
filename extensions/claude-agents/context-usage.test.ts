import assert from "node:assert/strict";
import test from "node:test";
import { contextOccupancyTokens } from "./src/backends/claude.ts";

test("Claude occupancy sums one request's input, cache, and output tokens", () => {
  assert.equal(
    contextOccupancyTokens({
      input_tokens: 12,
      cache_read_input_tokens: 45_000,
      cache_creation_input_tokens: 3_000,
      output_tokens: 700,
    }),
    48_712,
  );
});

test("Claude occupancy treats absent optional counts as zero", () => {
  assert.equal(
    contextOccupancyTokens({
      input_tokens: 9_000,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      output_tokens: 250,
    }),
    9_250,
  );
});

test("Claude occupancy is unknown without per-request input usage", () => {
  assert.equal(contextOccupancyTokens(undefined), undefined);
  assert.equal(contextOccupancyTokens(null), undefined);
  assert.equal(
    contextOccupancyTokens({ input_tokens: null, output_tokens: 5 }),
    undefined,
  );
});
