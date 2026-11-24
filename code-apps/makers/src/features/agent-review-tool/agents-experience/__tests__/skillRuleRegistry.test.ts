import { describe, expect, it } from "vitest";
import { REFERENCES } from "../contracts/references";
import {
  createRegisteredFinding,
  getRule,
  validateRuleReferences,
} from "../services/skill/skillRuleRegistry";

const ALL_SCANNER_RULE_IDS = [
  "SCR-CMD-01",
  "SCR-CODE-01",
  "SCR-DESTR-01",
  "SCR-NET-01",
  "SCR-SEC-01",
  "SCR-DESER-01",
  "SCR-TRAV-01",
  "HTML-SCRIPT-01",
  "HTML-HANDLER-01",
  "HTML-JSCHEM-01",
  "HTML-REMOTE-01",
  "HTML-FORM-01",
  "HTML-FRAME-01",
  "HTML-EGRESS-01",
  "HTML-STORE-01",
  "HTML-SINK-01",
  "MD-ROLEOVR-01",
  "MD-COMMENT-01",
  "MD-EXFIL-01",
  "MD-EXEC-01",
  "MD-SPOOF-01",
];

/**
 * Composition rules the AI stage cites. They have no scanner, so they are not
 * in ALL_SCANNER_RULE_IDS, but an unregistered id is dropped by
 * `validateSingleFinding` — which is exactly how these findings were being lost.
 */
const AI_COMPOSITION_RULE_IDS = ["SKL-09", "SKL-10", "INS-07"];

describe("skillRuleRegistry - getRule", () => {
  it("returns a defined rule for every scanner rule ID", () => {
    for (const ruleId of ALL_SCANNER_RULE_IDS) {
      const rule = getRule(ruleId);
      expect(rule, `Rule ${ruleId} must be registered`).toBeDefined();
      expect(rule!.fixSteps.length).toBeGreaterThan(0);
      expect(rule!.referenceIds.length).toBeGreaterThan(0);
    }
  });

  it("returns undefined for an unregistered rule ID", () => {
    expect(getRule("NOT-A-RULE")).toBeUndefined();
  });

  it("registers every composition rule the AI stage is allowed to cite", () => {
    // These have no scanner. Before they were registered the agent detected
    // these defects, quoted the evidence, and had every finding dropped.
    for (const ruleId of AI_COMPOSITION_RULE_IDS) {
      const rule = getRule(ruleId);
      expect(rule, `Rule ${ruleId} must be registered`).toBeDefined();
      expect(rule!.fixSteps.length).toBeGreaterThan(0);
      expect(rule!.referenceIds.length).toBeGreaterThan(0);
      // Judgement calls, not pattern matches — must not claim high confidence.
      expect(rule!.confidence).not.toBe("high");
    }
  });

  it("hydrates a composition finding end to end", () => {
    const finding = createRegisteredFinding("SKL-09", {
      resourcePath: "skill_markdown",
      evidence: "Use `Find ZAVA account context` for relevant meetings",
      fact: "referenced but not configured: Find ZAVA account context",
    });
    expect(finding.ruleId).toBe("SKL-09");
    expect(finding.title).toBeTruthy();
    expect(finding.fixSteps.length).toBeGreaterThan(0);
    expect(finding.referenceIds.length).toBeGreaterThan(0);
  });

  it("every registered rule has required fields", () => {
    for (const ruleId of ALL_SCANNER_RULE_IDS) {
      const rule = getRule(ruleId)!;
      expect(rule.ruleId).toBe(ruleId);
      expect(rule.title).toBeTruthy();
      expect(rule.why).toBeTruthy();
      expect(rule.recommendation).toBeTruthy();
      expect(rule.family).toBe("Skills");
      expect(["critical", "high", "medium", "low", "info"]).toContain(rule.severity);
      expect(["high", "medium", "low"]).toContain(rule.confidence);
    }
  });

  it("every rule has fixSteps in ascending order starting at 1", () => {
    for (const ruleId of ALL_SCANNER_RULE_IDS) {
      const rule = getRule(ruleId)!;
      rule.fixSteps.forEach((step, idx) => {
        expect(step.order, `${ruleId} step ${idx} must have order ${idx + 1}`).toBe(idx + 1);
        expect(step.action).toBeTruthy();
      });
    }
  });
});

describe("skillRuleRegistry - validateRuleReferences", () => {
  it("rejects a finding whose reference is not allowed for its rule", () => {
    expect(validateRuleReferences("SCR-CMD-01", ["ms-skills-create"])).toBe(false);
  });

  it("accepts all approved references for SCR-CMD-01", () => {
    const rule = getRule("SCR-CMD-01")!;
    expect(validateRuleReferences("SCR-CMD-01", rule.referenceIds)).toBe(true);
  });

  it("accepts an empty candidate list as vacuously valid", () => {
    expect(validateRuleReferences("SCR-CMD-01", [])).toBe(true); // vacuously true
  });

  it("returns false for an unknown rule ID", () => {
    expect(validateRuleReferences("UNKNOWN-RULE", ["cwe-78"])).toBe(false);
  });

  it("rejects when any candidate ID is not in the approved set", () => {
    expect(validateRuleReferences("SCR-CMD-01", ["cwe-78", "ms-skills-create"])).toBe(false);
  });
});

describe("skillRuleRegistry - createRegisteredFinding", () => {
  it("injects rule fields deterministically for SCR-CMD-01", () => {
    const finding = createRegisteredFinding("SCR-CMD-01", {
      resourcePath: "scripts/run.py",
      evidence: 'os.system("cmd")',
      fact: 'os.system("cmd")',
    });

    expect(finding.ruleId).toBe("SCR-CMD-01");
    expect(finding.referenceIds).toContain("cwe-78");
    expect(finding.referenceIds).toContain("owasp-command-injection");
    expect(finding.fixSteps[0]).toMatchObject({ order: 1 });
    expect(finding.confidence).toBe("high");
    expect(finding.ai).toBe(false);
    expect(finding.family).toBe("Skills");
    expect(finding.severity).toBe("critical");
    expect(finding.resourcePath).toBe("scripts/run.py");
    expect(finding.referenceId).toBe("cwe-78"); // primary compat field = referenceIds[0]
    expect(finding.safetyDisposition).toBe("blocking");
    expect(finding.platformOverlap).toBe("unverified");
  });

  it("mirrors evidence and fact from the supplied options", () => {
    const finding = createRegisteredFinding("HTML-SCRIPT-01", {
      evidence: "<script>alert(1)</script>",
      fact: "<script>alert(1)</script>",
    });
    expect(finding.evidence).toBe("<script>alert(1)</script>");
    expect(finding.fact).toBe("<script>alert(1)</script>");
    expect(finding.recommendation).toBeTruthy();
    expect(finding.fix).toBe(finding.recommendation);
  });

  it("throws for an unregistered rule ID", () => {
    expect(() =>
      createRegisteredFinding("NOT-REAL", { evidence: "x", fact: "x" }),
    ).toThrow(/NOT-REAL/);
  });

  it("uses rule confidence level rather than a hardcoded value", () => {
    // Precise deterministic rules → high
    const highFinding = createRegisteredFinding("SCR-CMD-01", { evidence: "x", fact: "x" });
    expect(highFinding.confidence).toBe("high");

    // Heuristic rules → medium
    const exfilFinding = createRegisteredFinding("MD-EXFIL-01", { evidence: "x", fact: "x" });
    expect(exfilFinding.confidence).toBe("medium");

    const commentFinding = createRegisteredFinding("MD-COMMENT-01", { evidence: "x", fact: "x" });
    expect(commentFinding.confidence).toBe("medium");
  });
});

describe("skillRuleRegistry - reference integrity", () => {
  it("every rule referenceId resolves in the REFERENCES registry", () => {
    const refs = REFERENCES as Record<string, unknown>;
    for (const ruleId of ALL_SCANNER_RULE_IDS) {
      const rule = getRule(ruleId)!;
      for (const refId of rule.referenceIds) {
        expect(
          refs[refId],
          `Reference "${refId}" for rule "${ruleId}" must exist in REFERENCES`,
        ).toBeDefined();
      }
    }
  });

  it("SCR-CMD-01 references include owasp-command-injection and cwe-78", () => {
    const rule = getRule("SCR-CMD-01")!;
    expect(rule.referenceIds).toContain("cwe-78");
    expect(rule.referenceIds).toContain("owasp-command-injection");
  });

  it("does not map advisory inline script detection to CWE-79", () => {
    const rule = getRule("HTML-SCRIPT-01")!;
    expect(rule.referenceIds).not.toContain("cwe-79");
    expect(rule.referenceIds).toContain("owasp-xss-prevention");
  });

  it.each([
    ["HTML-FORM-01", "cwe-918"],
    ["HTML-EGRESS-01", "cwe-918"],
    ["HTML-STORE-01", "cwe-79"],
    ["HTML-FRAME-01", "cwe-79"],
    ["SEC-PATH", "cwe-22"],
    ["SEC-HOST", "cwe-918"],
  ])("removes inaccurate %s mapping to %s", (ruleId, referenceId) => {
    expect(getRule(ruleId)?.referenceIds).not.toContain(referenceId);
  });

  it("uses information-exposure CWEs only where the scanner observes exposure", () => {
    expect(getRule("SEC-PATH")?.referenceIds).toContain("cwe-497");
    expect(getRule("SEC-HOST")?.referenceIds).toContain("cwe-200");
  });

  it("grounds payment-card detection in the PCI DSS standard", () => {
    expect(getRule("SEC-PII")?.referenceIds).toContain("pci-dss");
  });

  it.each([
    "SCR-GEN-01",
    "LIM-DEPTH",
    "SHP-DESCLEN",
    "AUTO-INTERVAL",
    "AUTO-MONTHLY",
    "AUTO-CRON",
    "AUTO-DESC",
    "INST-README",
    "INST-JSON",
    "INST-SKILLMD",
    "PKG-META",
  ])("does not register disabled rule %s", (ruleId) => {
    expect(getRule(ruleId)).toBeUndefined();
  });

  it.each(["PKG-NOISE", "PKG-ORPHAN", "SHP-BODYLEN", "SHP-HEADINGS", "SHP-STEPS", "RT-BUILTIN"])(
    "keeps advisory rule %s below blocking severity",
    (ruleId) => {
      expect(["info", "low", "medium"]).toContain(getRule(ruleId)?.severity);
    },
  );

  it("MD-ROLEOVR-01 references include owasp-llm01", () => {
    const rule = getRule("MD-ROLEOVR-01")!;
    expect(rule.referenceIds).toContain("owasp-llm01");
  });

  // A finding tells the reader their artifact breaks a rule, so the citation
  // beside it has to be the page that states the rule. These once pointed at
  // the cat-agent-skills and skill-recorder sample repositories, which state
  // no rules, carry no commitment and can be restructured without notice.
  describe("citation provenance", () => {
    const DOMAIN_BY_SOURCE: Record<string, string> = {
      "Agent Skills": "agentskills.io",
      "Microsoft Learn": "learn.microsoft.com",
      OWASP: "owasp.org",
      "MITRE CWE": "cwe.mitre.org",
      "PCI SSC": "pcisecuritystandards.org",
      Anthropic: "anthropic.com",
    };

    const entries = Object.entries(REFERENCES) as [
      string,
      { title: string; url: string; source: string },
    ][];

    it("cites no sample repository", () => {
      for (const [id, entry] of entries) {
        expect(entry.url, `Reference "${id}" must not cite a sample repository`).not.toContain(
          "github.com",
        );
      }
    });

    it("serves every entry over https from the domain its source names", () => {
      for (const [id, entry] of entries) {
        const domain = DOMAIN_BY_SOURCE[entry.source];
        expect(domain, `Reference "${id}" declares an unknown source`).toBeDefined();
        expect(entry.url, `Reference "${id}" must be https`).toMatch(/^https:\/\//);
        expect(
          new URL(entry.url).hostname.endsWith(domain),
          `Reference "${id}" is labelled ${entry.source} but points at ${entry.url}`,
        ).toBe(true);
      }
    });

    it("grounds uploaded-artifact review in first-party Microsoft guidance", () => {
      const artifactKeys = [
        "ms-skill-authoring-rubric",
        "ms-skill-design-checklist",
        "ms-scout-automation-schema",
        "ms-cowork-platform",
        "ms-scout-platform",
        "ms-scout-custom-skill",
      ] as const;

      for (const key of artifactKeys) {
        const entry = (REFERENCES as Record<string, { url: string; source: string }>)[key];
        expect(entry, `Reference "${key}" must exist`).toBeDefined();
        expect(entry.source).toBe("Microsoft Learn");
      }
    });

    it("grounds shared naming constraints in the authoritative Agent Skills contract", () => {
      const entry = (REFERENCES as Record<string, { url: string; source: string }>)["agent-skills-spec"];
      expect(entry).toBeDefined();
      expect(entry.source).toBe("Agent Skills");
      expect(entry.url).toBe("https://agentskills.io/specification");
    });

    it("anchors the deep links so the reader lands on the rule, not the article", () => {
      // A reader sent to a long article to find one validation rule will not
      // find it. These three are cited by rules that name a specific threshold.
      const anchored = [
        "ms-skill-authoring-rubric",
        "ms-skill-design-checklist",
        "ms-scout-automation-schema",
      ] as const;

      for (const key of anchored) {
        const entry = (REFERENCES as Record<string, { url: string }>)[key];
        expect(entry.url, `Reference "${key}" must deep-link to its section`).toContain("#");
      }
    });
  });
});
