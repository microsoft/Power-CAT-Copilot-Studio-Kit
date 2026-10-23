/**
 * P1 Instruction Coverage Validator (spec 013 §4).
 *
 * Validates the AI-returned InstructionCoverageResult against the strict
 * contract: exactly five unique keys, correct citation object, evidence
 * grounding in normalized source instructions, and present/absent evidence
 * consistency. Throws on any violation so calling code can surface the
 * failure explicitly rather than displaying invalid AI output.
 */
import type {
  InstructionCoverageElement,
  InstructionCoverageResult,
} from "../../contracts/AiCoverage.js";

// ---------------------------------------------------------------------------
// Rule IDs — map each P1 coverage key to its numbered rule ID
// ---------------------------------------------------------------------------

/**
 * Maps each instruction coverage key to its permanent finding ID.
 * Used by the orchestrator to emit INS-xx findings for absent elements.
 */
export const INSTRUCTION_RULE_IDS = {
  role: "INS-02",
  tone: "INS-03",
  boundaries: "INS-04",
  ambiguity: "INS-05",
  escalation: "INS-06",
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_KEYS: ReadonlySet<InstructionCoverageElement["key"]> = new Set([
  "role",
  "tone",
  "boundaries",
  "ambiguity",
  "escalation",
]);

const REQUIRED_CITATION_ID = "ms-authoring-instructions";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes whitespace in text for case-insensitive evidence matching.
 * Collapses all whitespace sequences into a single space and lowercases.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates an InstructionCoverageResult from the AI model.
 *
 * Throws on:
 * - Not exactly 5 elements
 * - Duplicate keys
 * - Unknown keys
 * - Wrong citation (must be exactly `{ id: "ms-authoring-instructions" }`)
 * - `present: false` with non-empty evidence
 * - `present: true` with evidence not found (normalized) in source instructions
 *
 * @param raw - The AI-returned coverage result.
 * @param sourceInstructions - The original agent instructions submitted to the model.
 * @returns The validated result (same shape, guaranteed correct).
 */
export function validateInstructionCoverage(
  raw: InstructionCoverageResult,
  sourceInstructions: string,
): InstructionCoverageResult {
  // Validate element count
  if (!raw.elements || raw.elements.length !== 5) {
    throw new Error(
      `Instruction coverage must contain exactly 5 elements, got ${raw.elements?.length ?? 0}.`,
    );
  }

  // Validate no duplicates and all keys are known
  const seenKeys = new Set<string>();
  for (const el of raw.elements) {
    if (seenKeys.has(el.key)) {
      throw new Error(
        `Duplicate instruction coverage key "${el.key}".`,
      );
    }
    if (!REQUIRED_KEYS.has(el.key as InstructionCoverageElement["key"])) {
      throw new Error(
        `Unknown key "${el.key}" in instruction coverage. Expected: ${[...REQUIRED_KEYS].join(", ")}.`,
      );
    }
    seenKeys.add(el.key);
  }

  // Validate all required keys present (after dedup/unknown check, this ensures completeness)
  for (const requiredKey of REQUIRED_KEYS) {
    if (!seenKeys.has(requiredKey)) {
      throw new Error(
        `Missing required key "${requiredKey}" in instruction coverage.`,
      );
    }
  }

  // Validate citation
  if (
    !raw.citationIds ||
    raw.citationIds.length !== 1 ||
    raw.citationIds[0].id !== REQUIRED_CITATION_ID
  ) {
    throw new Error(
      `Instruction coverage citation must be exactly [{ id: "${REQUIRED_CITATION_ID}" }]. ` +
      `Got: ${JSON.stringify(raw.citationIds)}.`,
    );
  }

  // Validate evidence per element
  const normalizedInstructions = normalize(sourceInstructions);

  for (const el of raw.elements) {
    if (!el.present) {
      // present:false → evidence must be empty
      if (el.evidence && el.evidence.trim().length > 0) {
        throw new Error(
          `Element "${el.key}" is marked absent but has non-empty evidence: "${el.evidence}".`,
        );
      }
    } else {
      // present:true → evidence must be grounded in normalized instructions
      if (!el.evidence || el.evidence.trim().length === 0) {
        throw new Error(
          `Element "${el.key}" is marked present but has empty evidence.`,
        );
      }
      const normalizedEvidence = normalize(el.evidence);
      if (!normalizedInstructions.includes(normalizedEvidence)) {
        throw new Error(
          `Element "${el.key}" evidence not found in source instructions (fabricated evidence).`,
        );
      }
    }
  }

  return raw;
}
