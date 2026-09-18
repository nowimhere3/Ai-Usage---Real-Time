// Provider-neutral normalized usage snapshot shared by both adapters.
"use strict";

/**
 * @typedef {Object} UsageWindow
 * @property {number} usedPercent
 * @property {number} remainingPercent
 * @property {string} [resetAt] ISO timestamp, only when confidently known
 * @property {string} [resetDisplay] human-readable reset text, only when confidently known
 */

/**
 * Builds a usage window from a used-percent value and an optional unix-seconds reset time.
 * Never invents a reset time: if resetAtSeconds is not a finite number, resetAt/resetDisplay are omitted.
 * @param {number} usedPercent
 * @param {number | undefined | null} resetAtSeconds
 * @returns {UsageWindow}
 */
function makeWindow(usedPercent, resetAtSeconds) {
  const used = Number(usedPercent);
  const window = {
    usedPercent: used,
    remainingPercent: Math.round((100 - used) * 100) / 100,
  };
  if (Number.isFinite(resetAtSeconds)) {
    const date = new Date(resetAtSeconds * 1000);
    window.resetAt = date.toISOString();
    window.resetDisplay = date.toLocaleString();
  }
  return window;
}

/**
 * @param {"codex"|"claude"} provider
 * @param {string} source short description of the acquisition mechanism
 * @param {UsageWindow|null} fiveHour
 * @param {UsageWindow|null} weekly
 */
function okSnapshot(provider, source, fiveHour, weekly) {
  return {
    provider,
    status: "ok",
    source,
    collectedAt: new Date().toISOString(),
    fiveHour: fiveHour ?? null,
    weekly: weekly ?? null,
  };
}

/**
 * @param {"codex"|"claude"} provider
 * @param {string} source
 * @param {string} reason human-readable, non-technical-enough-to-show reason
 */
function unavailableSnapshot(provider, source, reason) {
  return {
    provider,
    status: "unavailable",
    source,
    reason,
    collectedAt: new Date().toISOString(),
    fiveHour: null,
    weekly: null,
  };
}

module.exports = { makeWindow, okSnapshot, unavailableSnapshot };
