"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeClaudeRateLimits } = require("../src/providers/claude");

const normal = require("./fixtures/claude-normal.json");
const missingWeekly = require("./fixtures/claude-missing-weekly.json");
const absent = require("./fixtures/claude-absent.json");
const missingPercent = require("./fixtures/claude-missing-percent.json");

test("claude: maps five_hour/seven_day to fiveHour/weekly", () => {
  const { fiveHour, weekly } = normalizeClaudeRateLimits(normal);
  assert.equal(fiveHour.usedPercent, 0);
  assert.equal(fiveHour.remainingPercent, 100);
  assert.equal(fiveHour.resetAt, new Date(1789761600 * 1000).toISOString());
  assert.equal(weekly.usedPercent, 92);
  assert.equal(weekly.remainingPercent, 8);
  assert.equal(weekly.resetAt, new Date(1789819200 * 1000).toISOString());
});

test("claude: missing seven_day window stays null, does not guess", () => {
  const { fiveHour, weekly } = normalizeClaudeRateLimits(missingWeekly);
  assert.equal(fiveHour.usedPercent, 12.5);
  assert.equal(weekly, null);
});

test("claude: absent rate_limits object (e.g. non-subscriber) yields both windows null", () => {
  const { fiveHour, weekly } = normalizeClaudeRateLimits(absent);
  assert.equal(fiveHour, null);
  assert.equal(weekly, null);
});

test("claude: window with no used_percentage stays null, does not manufacture a value", () => {
  const { fiveHour, weekly } = normalizeClaudeRateLimits(missingPercent);
  assert.equal(fiveHour, null);
  assert.equal(weekly.usedPercent, 92);
});
