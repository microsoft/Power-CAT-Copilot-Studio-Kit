import { describe, expect, it, vi } from "vitest";

// Mock the generated Dataverse service (value import in AIService.ts) so the
// module graph resolves in the vitest environment without the Power Apps SDK.
vi.mock("../../../../generated/services/MicrosoftDataverseService", () => ({
  MicrosoftDataverseService: { PerformBoundActionWithOrganization: vi.fn() },
}));

import { extractStructuredOutput } from "../../services/AIService";

describe("extractStructuredOutput", () => {
  it("extracts AI Builder structuredOutput", () => {
    expect(extractStructuredOutput({
      responsev2: { predictionOutput: { structuredOutput: { elements: [] } } },
    })).toEqual({ elements: [] });
  });

  it("unwraps AI Builder primitive-array item objects recursively", () => {
    expect(extractStructuredOutput({
      responsev2: {
        predictionOutput: {
          structuredOutput: {
            referenceIds: [{ item: "cwe-78" }, { item: "owasp-command-injection" }],
            findings: [{
              id: "finding-1",
              referenceIds: [{ item: "cwe-78" }],
            }],
          },
        },
      },
    })).toEqual({
      referenceIds: ["cwe-78", "owasp-command-injection"],
      findings: [{ id: "finding-1", referenceIds: ["cwe-78"] }],
    });
  });

  it("extracts JSON string from predictionOutput.text", () => {
    expect(extractStructuredOutput({
      responsev2: { predictionOutput: { text: '{"score":42}' } },
    })).toEqual({ score: 42 });
  });

  it("throws when responsev2 is absent", () => {
    expect(() => extractStructuredOutput({})).toThrow("No prediction output");
  });

  it("throws when predictionOutput is absent", () => {
    expect(() => extractStructuredOutput({ responsev2: {} })).toThrow("No prediction output");
  });

  it("throws on malformed JSON in text field", () => {
    expect(() => extractStructuredOutput({
      responsev2: { predictionOutput: { text: "not json{" } },
    })).toThrow();
  });

  it("returns full predictionOutput object when no structuredOutput or text", () => {
    const obj = { customKey: "value", another: 1 };
    expect(extractStructuredOutput({
      responsev2: { predictionOutput: obj },
    })).toEqual(obj);
  });

  it("parses legacy string predictionOutput", () => {
    expect(extractStructuredOutput({
      responsev2: { predictionOutput: '{"legacy":true}' },
    })).toEqual({ legacy: true });
  });
});
