import { describe, expect, it } from "vitest";
import { parseTranscriptJson } from "../snapshot-service";

const activities = [
  { type: "message", timestamp: 1784799249, from: { id: "user-1", role: 1 }, text: "hi" },
  {
    type: "message",
    timestamp: 1784799250,
    from: { id: "bot-1", name: "Support agent", role: 0 },
    conversation: { id: "conv-1" },
    text: "hello",
  },
];

describe("parseTranscriptJson", () => {
  it("reads an activities object", () => {
    const result = parseTranscriptJson(JSON.stringify({ activities }));
    expect(result).toMatchObject({
      botName: "Support agent",
      botId: "bot-1",
      conversationId: "conv-1",
      startTime: "1784799249",
      componentNames: {},
    });
    expect(result.activities).toHaveLength(2);
  });

  it("reads a bare activity array", () => {
    expect(parseTranscriptJson(JSON.stringify(activities)).activities).toHaveLength(2);
  });

  it("unwraps a transcript record whose content is a JSON string", () => {
    const record = {
      name: "record-conv",
      content: JSON.stringify({ activities: [activities[0]] }),
    };
    expect(parseTranscriptJson(JSON.stringify(record))).toMatchObject({
      conversationId: "record-conv",
      botName: "Agent",
    });
  });

  it("rejects invalid JSON and JSON without activities", () => {
    expect(() => parseTranscriptJson("{ not json")).toThrow(/valid transcript JSON/);
    expect(() => parseTranscriptJson(JSON.stringify({ activities: [] }))).toThrow(/No activities/);
    expect(() => parseTranscriptJson(JSON.stringify({ foo: 1 }))).toThrow(/No activities/);
  });
});
