import { describe, expect, it } from "vitest";
import {
  validateInstructionCoverage,
  INSTRUCTION_RULE_IDS,
} from "../services/skill/InstructionCoverageValidator";

describe("INSTRUCTION_RULE_IDS", () => {
  it("maps all five keys to numbered IDs", () => {
    expect(INSTRUCTION_RULE_IDS).toEqual({
      role: "INS-02",
      tone: "INS-03",
      boundaries: "INS-04",
      ambiguity: "INS-05",
      escalation: "INS-06",
    });
  });
});

describe("validateInstructionCoverage", () => {
  it("accepts only the five unique P1 keys and exact citation", () => {
    const result = validateInstructionCoverage({
      elements: [
        { key: "role", present: true, evidence: "You are concise." },
        { key: "tone", present: false, evidence: "" },
        { key: "boundaries", present: false, evidence: "" },
        { key: "ambiguity", present: false, evidence: "" },
        { key: "escalation", present: false, evidence: "" },
      ],
      citationIds: [{ id: "ms-authoring-instructions" }],
    }, "You are concise.");
    expect(result.elements.map((item) => item.key)).toEqual([
      "role", "tone", "boundaries", "ambiguity", "escalation",
    ]);
    expect(result.citationIds).toEqual([{ id: "ms-authoring-instructions" }]);
  });

  it("rejects duplicate keys", () => {
    expect(() => validateInstructionCoverage({
      elements: [
        { key: "role", present: true, evidence: "You are helpful." },
        { key: "role", present: false, evidence: "" },
        { key: "tone", present: false, evidence: "" },
        { key: "boundaries", present: false, evidence: "" },
        { key: "ambiguity", present: false, evidence: "" },
      ],
      citationIds: [{ id: "ms-authoring-instructions" }],
    }, "You are helpful.")).toThrow("Duplicate");
  });

  it("rejects unknown keys", () => {
    expect(() => validateInstructionCoverage({
      elements: [
        { key: "role", present: false, evidence: "" },
        { key: "tone", present: false, evidence: "" },
        { key: "boundaries", present: false, evidence: "" },
        { key: "ambiguity", present: false, evidence: "" },
        { key: "unknown" as never, present: false, evidence: "" },
      ],
      citationIds: [{ id: "ms-authoring-instructions" }],
    }, "")).toThrow("Unknown key");
  });

  it("rejects when fewer than five elements", () => {
    expect(() => validateInstructionCoverage({
      elements: [
        { key: "role", present: false, evidence: "" },
        { key: "tone", present: false, evidence: "" },
      ],
      citationIds: [{ id: "ms-authoring-instructions" }],
    }, "")).toThrow("exactly 5");
  });

  it("rejects extra elements beyond five", () => {
    expect(() => validateInstructionCoverage({
      elements: [
        { key: "role", present: false, evidence: "" },
        { key: "tone", present: false, evidence: "" },
        { key: "boundaries", present: false, evidence: "" },
        { key: "ambiguity", present: false, evidence: "" },
        { key: "escalation", present: false, evidence: "" },
        { key: "role", present: false, evidence: "" },
      ],
      citationIds: [{ id: "ms-authoring-instructions" }],
    }, "")).toThrow();
  });

  it("rejects wrong citation id", () => {
    expect(() => validateInstructionCoverage({
      elements: [
        { key: "role", present: false, evidence: "" },
        { key: "tone", present: false, evidence: "" },
        { key: "boundaries", present: false, evidence: "" },
        { key: "ambiguity", present: false, evidence: "" },
        { key: "escalation", present: false, evidence: "" },
      ],
      citationIds: [{ id: "wrong-citation" }],
    }, "")).toThrow("citation");
  });

  it("rejects present:true with fabricated evidence", () => {
    expect(() => validateInstructionCoverage({
      elements: [
        { key: "role", present: true, evidence: "not in instructions" },
        { key: "tone", present: false, evidence: "" },
        { key: "boundaries", present: false, evidence: "" },
        { key: "ambiguity", present: false, evidence: "" },
        { key: "escalation", present: false, evidence: "" },
      ],
      citationIds: [{ id: "ms-authoring-instructions" }],
    }, "The real instructions text.")).toThrow("evidence");
  });

  it("rejects present:false with non-empty evidence", () => {
    expect(() => validateInstructionCoverage({
      elements: [
        { key: "role", present: false, evidence: "should be empty" },
        { key: "tone", present: false, evidence: "" },
        { key: "boundaries", present: false, evidence: "" },
        { key: "ambiguity", present: false, evidence: "" },
        { key: "escalation", present: false, evidence: "" },
      ],
      citationIds: [{ id: "ms-authoring-instructions" }],
    }, "")).toThrow("evidence");
  });

  it("normalizes whitespace when checking evidence grounding", () => {
    const instructions = "You\n  are\t concise   and helpful.";
    const result = validateInstructionCoverage({
      elements: [
        { key: "role", present: true, evidence: "you are concise and helpful." },
        { key: "tone", present: false, evidence: "" },
        { key: "boundaries", present: false, evidence: "" },
        { key: "ambiguity", present: false, evidence: "" },
        { key: "escalation", present: false, evidence: "" },
      ],
      citationIds: [{ id: "ms-authoring-instructions" }],
    }, instructions);
    expect(result.elements[0].present).toBe(true);
  });
});
