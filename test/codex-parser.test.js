"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCodexRateLimits } = require("../src/providers/codex");

const normal = require("./fixtures/codex-normal.json");
const weeklyOnly = require("./fixtures/codex-weekly-only.json");
const missingPercent = require("./fixtures/codex-missing-percent.json");
const noDurationHints = require("./fixtures/codex-no-duration-hints.json");

test("codex: maps primary/secondary to fiveHour/weekly using windowDurationMins", () => {
  const { fiveHour, weekly } = normalizeCodexRateLimits(normal);
  assert.equal(fiveHour.usedPercent, 0);
  assert.equal(fiveHour.remainingPercent, 100);
  assert.equal(fiveHour.resetAt, new Date(1789760869 * 1000).toISOString());
  assert.equal(weekly.usedPercent, 51);
  assert.equal(weekly.remainingPercent, 49);
  assert.equal(weekly.resetAt, new Date(1790118301 * 1000).toISOString());
});

test("codex: missing five-hour window stays null, does not guess", () => {
  const { fiveHour, weekly } = normalizeCodexRateLimits(weeklyOnly);
  assert.equal(fiveHour, null);
  assert.equal(weekly.usedPercent, 20);
});

test("codex: window with no usedPercent stays null, does not manufacture a value", () => {
  const { fiveHour, weekly } = normalizeCodexRateLimits(missingPercent);
  assert.equal(fiveHour, null);
  assert.equal(weekly.usedPercent, 51);
});

test("codex: falls back to primary=5h/secondary=weekly when windowDurationMins is absent", () => {
  const { fiveHour, weekly } = normalizeCodexRateLimits(noDurationHints);
  assert.equal(fiveHour.usedPercent, 10);
  assert.equal(weekly.usedPercent, 51);
});

test("codex: absent rateLimits object yields both windows null", () => {
  const { fiveHour, weekly } = normalizeCodexRateLimits(undefined);
  assert.equal(fiveHour, null);
  assert.equal(weekly, null);
});
