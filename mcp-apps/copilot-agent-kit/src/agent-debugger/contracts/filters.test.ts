import assert from "node:assert/strict";
import test from "node:test";
import { conversationDateRange, customRangeError, EMPTY_CONVERSATION_FILTERS } from "./filters.js";

test("relative date presets use fixed inclusive server bounds", () => {
  const now = Date.parse("2026-10-07T12:00:00.000Z");
  for (const [timeRange, minutes] of [["30m", 30], ["1h", 60], ["4h", 240], ["24h", 1440], ["7d", 10080]] as const) {
    assert.deepEqual(conversationDateRange({ ...EMPTY_CONVERSATION_FILTERS, timeRange }, now), {
      startedAfter: new Date(now - minutes * 60000).toISOString(),
      startedBefore: new Date(now).toISOString(),
    });
  }
  assert.deepEqual(conversationDateRange(EMPTY_CONVERSATION_FILTERS, now), {});
  assert.throws(() => conversationDateRange({ ...EMPTY_CONVERSATION_FILTERS, timeRange: "unsupported" }), /not supported/);
});

test("custom dates preserve local-time conversion and open-ended ranges", () => {
  const filters = { timeRange: "custom", customFrom: "2026-10-06T10:30", customTo: "" };
  assert.deepEqual(conversationDateRange(filters), {
    startedAfter: new Date(filters.customFrom).toISOString(), startedBefore: undefined,
  });
  assert.deepEqual(conversationDateRange({ ...filters, customTo: filters.customFrom }), {
    startedAfter: new Date(filters.customFrom).toISOString(), startedBefore: new Date(filters.customFrom).toISOString(),
  });
});

test("custom dates reject missing, reversed, malformed, and normalized calendar dates", () => {
  assert.match(customRangeError({ ...EMPTY_CONVERSATION_FILTERS, timeRange: "custom" }) ?? "", /at least/);
  assert.match(customRangeError({ timeRange: "custom", customFrom: "2026-10-07T12:00", customTo: "2026-10-06T12:00" }) ?? "", /not be after/);
  for (const customFrom of ["invalid", "2026-02-30T12:00", "2026-02-29T12:00", "2026-13-01T12:00", "2026-01-01T24:00"]) {
    assert.match(customRangeError({ timeRange: "custom", customFrom, customTo: "" }) ?? "", /invalid/);
    assert.throws(() => conversationDateRange({ timeRange: "custom", customFrom, customTo: "" }), /invalid/);
  }
  assert.equal(customRangeError({ timeRange: "custom", customFrom: "2024-02-29T12:00", customTo: "" }), undefined);
});
