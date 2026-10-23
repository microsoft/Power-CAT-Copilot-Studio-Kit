/**
 * Central rule registry for deterministic skill-resource findings (Task-4).
 *
 * Every rule that a scanner emits MUST be registered here. The registry is the
 * single source of truth for titles, why-explanations, ordered fix steps, and
 * approved reference IDs. Scanners call {@link createRegisteredFinding} so that
 * all client-visible content comes from this file — never from raw source bytes.
 */
import type { GroundedSkillFinding, SkillFindingSeverity, SkillRubricDimension } from "../../contracts/Findings.js";
import type { ReferenceId } from "../../contracts/references.js";

/** Typed definition for a single deterministic scanner rule. */
export interface SkillRuleDefinition {
  ruleId: string;
  title: string;
  why: string;
  recommendation: string;
  /** Ordered steps; first element is always { order: 1, action: "..." }. */
  fixSteps: Array<{ order: number; action: string }>;
  /** Approved reference IDs for this rule. First element is the primary compat ID. */
  referenceIds: ReferenceId[];
  severity: SkillFindingSeverity;
  /**
   * Confidence level for findings produced by this rule.
   * Use "high" for precise, deterministic patterns; "medium" for broad heuristics.
   */
  confidence: "high" | "medium" | "low";
  family: string;
  /** Rubric dimension this rule's findings roll up into for grouped display. */
  dimension: SkillRubricDimension;
}

/**
 * Every rule the review engine can raise.
 *
 * Exported so tests can assert invariants across the whole set — that each rule
 * cites at least one source, and that every source resolves in the reference
 * catalogue. Read through `getRule` in application code.
 */
export const RULE_REGISTRY: Record<string, SkillRuleDefinition> = {
  // ── Python scanner rules ─────────────────────────────────────────────────

  "SCR-CMD-01": {
    ruleId: "SCR-CMD-01",
    title: "OS Command Injection in Python Script",
    why: "Unsandboxed shell commands in a skill script can be weaponised to run arbitrary host commands.",
    recommendation:
      "Replace os.system / subprocess shell=True with parameterised APIs; never interpolate user input into shell strings.",
    fixSteps: [
      {
        order: 1,
        action:
          "Replace os.system/subprocess calls with subprocess.run using a list of arguments, not a shell string.",
      },
      {
        order: 2,
        action: "Validate and sanitize all inputs before passing them to any system call.",
      },
      {
        order: 3,
        action:
          "Apply least-privilege constraints so the process cannot execute unexpected commands.",
      },
    ],
    referenceIds: ["cwe-78", "owasp-command-injection"],
    severity: "critical",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "SCR-CODE-01": {
    ruleId: "SCR-CODE-01",
    title: "Dynamic Code Execution (eval/exec) in Python Script",
    why: "eval/exec on untrusted strings executes arbitrary code in the same process.",
    recommendation: "Remove eval/exec calls; use a parser or explicit dispatch mapping instead.",
    fixSteps: [
      {
        order: 1,
        action:
          "Replace eval/exec with safe alternatives such as ast.literal_eval for data or explicit dispatch logic.",
      },
      {
        order: 2,
        action:
          "If dynamic evaluation is truly required, run it in a fully-isolated sandbox with no access to sensitive state.",
      },
    ],
    referenceIds: ["cwe-94", "owasp-input-validation"],
    severity: "critical",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "SCR-DESTR-01": {
    ruleId: "SCR-DESTR-01",
    title: "Potentially Destructive File Operation in Python Script",
    why: "A delete operation can damage the host file system when its target is recursive, user-controlled, or outside a known working directory.",
    recommendation: "Restrict the delete target to a validated working directory or temporary file.",
    fixSteps: [
      {
        order: 1,
        action:
          "Audit every file open/delete call and confirm it operates only within expected, scoped paths.",
      },
      {
        order: 2,
        action: "Replace direct FS operations with scoped storage APIs that enforce path boundaries.",
      },
      {
        order: 3,
        action: "Require explicit runtime consent before any write or delete action.",
      },
    ],
    referenceIds: ["owasp-llm06"],
    severity: "high",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "SCR-NET-01": {
    ruleId: "SCR-NET-01",
    title: "Outbound Network Call in Python Script",
    why: "A network call needs review when its destination is dynamic or it transmits data. Fixed read-only probes to known services are advisory.",
    recommendation:
      "Use a fixed, approved endpoint and avoid transmitting credentials or user data.",
    fixSteps: [
      {
        order: 1,
        action: "Confirm the HTTP method, destination and transmitted fields are all required.",
      },
      { order: 2, action: "Verify the target endpoint is in the approved allowlist." },
      {
        order: 3,
        action: "Add observability (logging, alerting) for any approved network egress.",
      },
    ],
    referenceIds: ["cwe-918", "owasp-llm02"],
    severity: "high",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "SCR-SEC-01": {
    ruleId: "SCR-SEC-01",
    title: "Hardcoded Secret in Python Script",
    why: "Secrets embedded in source files are exposed to everyone who reads the bundle.",
    recommendation:
      "Remove all hardcoded credentials and use a secrets manager or environment variable injection.",
    fixSteps: [
      { order: 1, action: "Delete the hardcoded secret from the file immediately." },
      { order: 2, action: "Rotate the affected credential." },
      {
        order: 3,
        action:
          "Inject secrets at runtime via environment variables or a managed secrets store.",
      },
    ],
    referenceIds: ["cwe-798", "owasp-secrets-management"],
    severity: "critical",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "SCR-DESER-01": {
    ruleId: "SCR-DESER-01",
    title: "Unsafe Deserialization in Python Script",
    why: "Deserializing untrusted data with pickle/marshal/yaml.load can execute arbitrary code.",
    recommendation:
      "Replace unsafe deserialization with safe alternatives (e.g., json.loads, yaml.safe_load).",
    fixSteps: [
      {
        order: 1,
        action:
          "Replace pickle.loads / marshal.loads with json.loads or a schema-validated parser.",
      },
      { order: 2, action: "Replace yaml.load with yaml.safe_load." },
      { order: 3, action: "Never deserialize data received from an untrusted source." },
    ],
    referenceIds: ["cwe-502", "owasp-input-validation"],
    severity: "critical",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "SCR-TRAV-01": {
    ruleId: "SCR-TRAV-01",
    title: "Path Traversal in Python Script",
    why: "Constructing file paths from user input without validation allows access outside the intended directory.",
    recommendation:
      "Validate and canonicalize all file paths; reject any path that escapes the allowed root.",
    fixSteps: [
      { order: 1, action: "Resolve the file path to a canonical absolute path before opening it." },
      { order: 2, action: "Assert the resolved path is inside the expected root directory." },
      {
        order: 3,
        action:
          "Reject or sanitize any input containing '..' or absolute path segments.",
      },
    ],
    referenceIds: ["cwe-22", "owasp-input-validation"],
    severity: "high",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  // ── HTML scanner rules ────────────────────────────────────────────────────

  "HTML-SCRIPT-01": {
    ruleId: "HTML-SCRIPT-01",
    title: "Inline Script Requires Review",
    why: "An inline script is executable when the HTML is opened, but its presence alone does not establish XSS or data theft.",
    recommendation:
      "Review the script for untrusted inputs, unsafe DOM sinks and network egress; move executable code to a controlled file where practical.",
    fixSteps: [
      { order: 1, action: "Remove the inline <script> block from the HTML." },
      {
        order: 2,
        action:
          "Serve scripts from a trusted, versioned external source with Subresource Integrity.",
      },
      {
        order: 3,
        action: "Apply a Content Security Policy header that blocks 'unsafe-inline'.",
      },
    ],
    referenceIds: ["owasp-xss-prevention"],
    severity: "medium",
    confidence: "medium",
    family: "Skills",
    dimension: "safety",
  },

  "HTML-HANDLER-01": {
    ruleId: "HTML-HANDLER-01",
    title: "Inline Event Handler in HTML Resource",
    why: "Inline event handlers (onclick, onload, etc.) are an XSS vector.",
    recommendation:
      "Remove all inline event handlers and attach listeners programmatically from a safe script.",
    fixSteps: [
      { order: 1, action: "Remove the inline event handler attribute." },
      {
        order: 2,
        action: "Attach event listeners programmatically from a controlled, external script file.",
      },
      {
        order: 3,
        action: "Enforce a Content Security Policy that disallows 'unsafe-inline'.",
      },
    ],
    referenceIds: ["cwe-79", "owasp-xss-prevention"],
    severity: "medium",
    confidence: "medium",
    family: "Skills",
    dimension: "safety",
  },

  "HTML-JSCHEM-01": {
    ruleId: "HTML-JSCHEM-01",
    title: "javascript: URL Scheme in HTML Resource",
    why: "javascript: href/src values execute code when the link or resource is activated.",
    recommendation:
      "Replace all javascript: URLs with safe href values or button/click actions.",
    fixSteps: [
      {
        order: 1,
        action:
          "Replace the javascript: URL with a safe href (e.g., '#' with a delegated event listener).",
      },
      {
        order: 2,
        action: "Sanitize all user-supplied URL values to reject the javascript: scheme.",
      },
    ],
    referenceIds: ["cwe-79", "owasp-xss-prevention"],
    severity: "high",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "HTML-REMOTE-01": {
    ruleId: "HTML-REMOTE-01",
    title: "Remote External Resource in HTML",
    why: "Loading resources from external domains exposes users to third-party script injection and tracking.",
    recommendation: "Remove or allowlist every external resource reference.",
    fixSteps: [
      {
        order: 1,
        action: "Replace the external resource URL with a locally hosted or allowlisted source.",
      },
      {
        order: 2,
        action:
          "If an external source is required, add Subresource Integrity (integrity attribute).",
      },
      { order: 3, action: "Restrict permitted origins via Content Security Policy." },
    ],
    referenceIds: ["owasp-third-party-javascript", "cwe-79"],
    severity: "high",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "HTML-FORM-01": {
    ruleId: "HTML-FORM-01",
    title: "HTML Form with External Action",
    why: "Forms posting data to external URLs can silently exfiltrate user input.",
    recommendation:
      "Remove the form's external action attribute and route submissions through an approved API.",
    fixSteps: [
      { order: 1, action: "Remove the external action URL from the form element." },
      {
        order: 2,
        action: "Route form submissions through a controlled, allowlisted API endpoint.",
      },
    ],
    referenceIds: ["owasp-llm02"],
    severity: "high",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "HTML-FRAME-01": {
    ruleId: "HTML-FRAME-01",
    title: "Embedded Frame Requires Review",
    why: "A frame can embed another origin and needs an explicit framing policy. Its presence alone does not prove cross-site scripting or clickjacking.",
    recommendation:
      "Remove all iframe/frame elements; apply X-Frame-Options or CSP frame-ancestors.",
    fixSteps: [
      { order: 1, action: "Remove the iframe or frame element from the HTML." },
      {
        order: 2,
        action: "If embedding is required, allow only explicitly approved, same-origin content.",
      },
      {
        order: 3,
        action:
          "Add X-Frame-Options DENY or Content Security Policy frame-ancestors 'none' to response headers.",
      },
    ],
    referenceIds: ["owasp-clickjacking"],
    severity: "medium",
    confidence: "medium",
    family: "Skills",
    dimension: "safety",
  },

  "HTML-EGRESS-01": {
    ruleId: "HTML-EGRESS-01",
    title: "JavaScript Network Egress in HTML Resource",
    why: "JavaScript network calls in HTML can exfiltrate data to attacker-controlled endpoints.",
    recommendation:
      "Remove all fetch/XHR/WebSocket/beacon calls; route data through approved connectors only.",
    fixSteps: [
      {
        order: 1,
        action:
          "Remove the fetch/XMLHttpRequest/WebSocket/beacon call from the inline script.",
      },
      {
        order: 2,
        action: "If network access is needed, route it through an approved Power Platform connector.",
      },
      {
        order: 3,
        action:
          "Apply a Content Security Policy connect-src directive to restrict allowed origins.",
      },
    ],
    referenceIds: ["owasp-llm02"],
    severity: "critical",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "HTML-STORE-01": {
    ruleId: "HTML-STORE-01",
    title: "Client-Side Storage Access in HTML Resource",
    why: "Client-side storage access requires review when sensitive values are read or written; access alone does not establish a leak.",
    recommendation:
      "Remove all client-side storage access; use server-side session management.",
    fixSteps: [
      { order: 1, action: "Remove the storage access call from the script." },
      {
        order: 2,
        action: "Use server-side session management instead of client-side storage.",
      },
    ],
    referenceIds: ["owasp-llm02"],
    severity: "medium",
    confidence: "medium",
    family: "Skills",
    dimension: "safety",
  },

  "HTML-SINK-01": {
    ruleId: "HTML-SINK-01",
    title: "Unsafe DOM Sink in HTML Resource",
    why: "Assigning to innerHTML/outerHTML/document.write/eval with user input causes DOM XSS.",
    recommendation:
      "Replace unsafe DOM sinks with safe text-only alternatives (textContent, createElement).",
    fixSteps: [
      {
        order: 1,
        action: "Replace innerHTML/outerHTML assignments with textContent or safe DOM APIs.",
      },
      { order: 2, action: "Replace document.write with safe DOM insertion methods." },
      {
        order: 3,
        action: "Apply DOMPurify or equivalent sanitization before inserting any HTML.",
      },
    ],
    referenceIds: ["cwe-79", "owasp-xss-prevention"],
    severity: "high",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  // ── Markdown / text scanner rules ────────────────────────────────────────

  "MD-ROLEOVR-01": {
    ruleId: "MD-ROLEOVR-01",
    title: "Role or System Override Attempt in Markdown Resource",
    why: "Skill resources must not contain instructions that override the agent's operating guidelines.",
    recommendation:
      "Remove all instructions that attempt to override, reset, or redefine the agent's role or system prompt.",
    fixSteps: [
      { order: 1, action: "Remove the role/system override directive from the resource." },
      {
        order: 2,
        action:
          "Review the resource author's intent and restrict any instruction that controls agent behavior.",
      },
    ],
    referenceIds: ["owasp-llm01"],
    severity: "critical",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "MD-COMMENT-01": {
    ruleId: "MD-COMMENT-01",
    title: "Hidden Instruction in Markdown Comment",
    why: "A comment containing an active instruction is invisible when rendered but can still be parsed by an LLM.",
    recommendation: "Remove hidden behavioral instructions from Markdown comments.",
    fixSteps: [
      { order: 1, action: "Delete the hidden instruction from the comment block." },
      {
        order: 2,
        action: "Move any necessary context into visible, attributable prose.",
      },
    ],
    referenceIds: ["owasp-llm01"],
    severity: "high",
    confidence: "medium",
    family: "Skills",
    dimension: "safety",
  },

  "MD-EXFIL-01": {
    ruleId: "MD-EXFIL-01",
    title: "Exfiltration or Beacon URL in Markdown Resource",
    why: "URLs embedded in skill resources can be used as beacons to exfiltrate data when the agent renders or retrieves the resource.",
    recommendation:
      "Remove all outbound URLs from skill resources; use relative links or reference IDs only.",
    fixSteps: [
      { order: 1, action: "Remove the outbound URL from the resource." },
      {
        order: 2,
        action:
          "If a reference is necessary, cite a local resource path or approved knowledge source.",
      },
    ],
    referenceIds: ["owasp-llm01", "owasp-llm02"],
    severity: "high",
    confidence: "medium",
    family: "Skills",
    dimension: "safety",
  },

  "MD-EXEC-01": {
    ruleId: "MD-EXEC-01",
    title: "Unsafe Execution Instruction in Markdown Resource",
    why: "Instructions telling the agent to execute shell commands or run code are an excessive agency risk.",
    recommendation:
      "Remove all directives instructing the agent to run commands or execute code.",
    fixSteps: [
      { order: 1, action: "Delete the execution directive from the resource." },
      {
        order: 2,
        action:
          "If automation is needed, implement it as an approved connector action, not a text directive.",
      },
    ],
    referenceIds: ["owasp-llm06"],
    severity: "high",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  "MD-SPOOF-01": {
    ruleId: "MD-SPOOF-01",
    title: "Authority Spoofing in Markdown Resource",
    why: "Claims of official authorship or platform authorization in a skill resource attempt to manufacture false trust.",
    recommendation:
      "Remove all authority claims from the resource; legitimate platform instructions are never embedded in skill files.",
    fixSteps: [
      { order: 1, action: "Delete the authority claim from the resource." },
      {
        order: 2,
        action:
          "Remind users that official platform instructions never appear inside uploaded skill files.",
      },
    ],
    referenceIds: ["owasp-llm01"],
    severity: "high",
    confidence: "high",
    family: "Skills",
    dimension: "safety",
  },

  // ── Agent-level composition rules (AI-emitted) ───────────────────────────
  //
  // These have no scanner. They are registered so the AI stage can cite them:
  // `validateSingleFinding` resolves every ruleId against this registry, so an
  // unregistered id means the finding is dropped no matter how well evidenced.
  //
  // SKL-09 and INS-07 also exist as deterministic rules in `services/rules/`,
  // but those are deliberately conservative — SKL-09 only fires when a skill
  // references at least one capability that *does* exist, to avoid mistaking
  // prose for a tool name, and INS-07 needs the literal form "use X tool". A
  // skill whose referenced tools are *all* missing therefore passes the scanner
  // silently. Observed in production (job 969ddf01, 2026-07-29): the agent
  // identified exactly that case, quoted the evidence and scored Actionability
  // 25/100, but could emit no finding.
  //
  // INS-07 is registered for the agent-level stage only. The per-component
  // stage must not emit it: every component receives the same
  // `agent_instructions`, so it would report one duplicate per skill.

  "SKL-09": {
    ruleId: "SKL-09",
    title: "Skill References a Capability the Agent Does Not Have",
    why: "A skill step that invokes a tool, knowledge source, or connected agent missing from the agent's configuration cannot execute. The step fails at runtime, or the model silently improvises an answer instead.",
    recommendation:
      "Add the referenced capability to the agent, or rewrite the step to use a capability the agent actually has.",
    fixSteps: [
      {
        order: 1,
        action:
          "Compare each capability named in the skill against the agent's configured tools, knowledge sources, and connected agents.",
      },
      {
        order: 2,
        action:
          "For each name with no match, either add that capability to the agent or remove the reference from the skill.",
      },
      {
        order: 3,
        action:
          "Where the step is essential, state the fallback behaviour explicitly so the model does not invent one.",
      },
    ],
    referenceIds: ["ms-tools-skills", "ms-skills-create"],
    severity: "high",
    confidence: "medium",
    family: "Skills",
    dimension: "readiness",
  },

  "INS-07": {
    ruleId: "INS-07",
    title: "Agent Instructions Name a Capability the Agent Does Not Have",
    why: "Instructions that direct the agent to use a tool or knowledge source it was never given set an expectation the runtime cannot meet.",
    recommendation:
      "Align the instructions with the agent's actual configuration: add the capability, or stop referring to it.",
    fixSteps: [
      {
        order: 1,
        action:
          "List every capability named in the agent instructions and check each against the configured capability list.",
      },
      {
        order: 2,
        action:
          "Add the missing capability to the agent, or remove the instruction that depends on it.",
      },
    ],
    referenceIds: ["ms-authoring-instructions", "ms-tools-skills"],
    severity: "high",
    confidence: "medium",
    family: "Instructions",
    dimension: "readiness",
  },
  "SKL-10": {
    ruleId: "SKL-10",
    title: "Skill Step Contradicts Its Own Bundled Resource",
    why: "When a skill's instructions and its bundled policy or reference file disagree, behaviour depends on which the model weights more heavily — so it is unpredictable and cannot be tested reliably.",
    recommendation:
      "Make the skill and its resources agree, and keep each rule stated in exactly one place.",
    fixSteps: [
      {
        order: 1,
        action:
          "Identify the two statements that conflict and decide which one is correct.",
      },
      {
        order: 2,
        action:
          "Correct the wrong one, then remove the duplicate so the rule is stated once.",
      },
      {
        order: 3,
        action:
          "Where both must remain, have the skill reference the resource rather than restating its content.",
      },
    ],
    referenceIds: ["ms-skills-create", "ms-skills-overview"],
    severity: "medium",
    confidence: "medium",
    family: "Skills",
    dimension: "quality",
  },

  // ── Uploaded-artifact rules (spec 018) ───────────────────────────────────
  // These run against a skill or Scout automation a user uploads, rather than
  // against a component read from Dataverse. They are registered here, with
  // every other rule, so an uploaded artifact and an authored skill are judged
  // by one set of definitions rather than two that drift apart.

  // Group A — packaging.

  "PKG-FM": {
    ruleId: "PKG-FM",
    title: "SKILL.md Has No Readable YAML Frontmatter",
    why: "The runtime reads the skill's name and trigger description from the frontmatter block. Without a readable block there is nothing to register, so the skill never loads.",
    recommendation:
      "Add a YAML frontmatter block delimited by --- as the very first lines of SKILL.md.",
    fixSteps: [
      { order: 1, action: "Put a line containing only --- as the first line of the file." },
      { order: 2, action: "Add the name and description keys, then close the block with another --- line." },
      { order: 3, action: "Use spaces for indentation. A tab anywhere in the block makes the YAML unparseable." },
    ],
    referenceIds: ["ms-skill-design-checklist", "ms-skills-create"],
    severity: "critical",
    confidence: "high",
    family: "Packaging",
    dimension: "integrity",
  },

  "PKG-REQ": {
    ruleId: "PKG-REQ",
    title: "Required Frontmatter Field Is Missing",
    why: "Name and description are both required. The name is how the skill is addressed, and the description is the only text the model sees when deciding whether to invoke it — a missing description means the skill is installed but never chosen.",
    recommendation: "Add every required frontmatter field.",
    fixSteps: [
      { order: 1, action: "Add a name field holding the skill's identifier." },
      { order: 2, action: "Add a description field that states what the skill does and when it should be used." },
    ],
    referenceIds: ["ms-skill-design-checklist", "ms-skills-create"],
    severity: "critical",
    confidence: "high",
    family: "Packaging",
    dimension: "integrity",
  },

  "PKG-NAME": {
    ruleId: "PKG-NAME",
    title: "Frontmatter Name Does Not Match the Folder Name",
    why: "The loader resolves a skill's bundled files relative to its folder. When the declared name and the folder disagree, the skill loads but its scripts and references resolve to nothing.",
    recommendation: "Make the frontmatter name and the containing folder name identical.",
    fixSteps: [
      { order: 1, action: "Decide which of the two names is correct." },
      { order: 2, action: "Rename the other one to match it exactly, including case and hyphens." },
    ],
    referenceIds: ["ms-skill-design-checklist"],
    severity: "high",
    confidence: "high",
    family: "Packaging",
    dimension: "integrity",
  },

  "PKG-SLUG": {
    ruleId: "PKG-SLUG",
    title: "Skill Name Uses Characters the Runtime Rejects",
    why: "Skill names are identifiers. The Agent Skills contract rejects uppercase or punctuation, leading or trailing hyphens, and consecutive hyphens.",
    recommendation: "Rewrite the name as kebab-case with single internal hyphens.",
    fixSteps: [
      { order: 1, action: "Convert the name to lower case." },
      { order: 2, action: "Replace spaces, underscores and punctuation with single hyphens." },
      { order: 3, action: "Rename the containing folder to match the corrected name." },
    ],
    referenceIds: ["agent-skills-spec", "ms-skill-design-checklist", "ms-skills-create"],
    severity: "high",
    confidence: "high",
    family: "Packaging",
    dimension: "integrity",
  },

  "PKG-NOISE": {
    ruleId: "PKG-NOISE",
    title: "Bundle Ships Development Artefacts",
    why: "Editor folders, dependency directories and OS metadata inflate the package and can leak local paths or credentials that were never meant to be shared.",
    recommendation: "Remove development artefacts before packaging.",
    fixSteps: [
      { order: 1, action: "Delete the listed files and folders from the bundle." },
      { order: 2, action: "Add them to your ignore file so the next package excludes them automatically." },
    ],
    referenceIds: ["ms-skill-design-checklist", "owasp-secrets-management"],
    severity: "low",
    confidence: "high",
    family: "Packaging",
    dimension: "integrity",
  },

  "PKG-ORPHAN": {
    ruleId: "PKG-ORPHAN",
    title: "Bundled File Is Never Referenced",
    why: "A file the skill never mentions is still shipped, still read by anyone reviewing the bundle, and still part of the trust surface — while contributing nothing to behaviour.",
    recommendation: "Reference the file from SKILL.md, or remove it.",
    fixSteps: [
      { order: 1, action: "Decide whether the skill actually needs the file." },
      { order: 2, action: "If it does, reference it explicitly from SKILL.md so the model knows when to read it." },
      { order: 3, action: "If it does not, delete it from the bundle." },
    ],
    referenceIds: ["ms-skill-design-checklist"],
    severity: "low",
    confidence: "medium",
    family: "Packaging",
    dimension: "integrity",
  },

  "PKG-LINK": {
    ruleId: "PKG-LINK",
    title: "SKILL.md References a File That Is Not in the Bundle",
    why: "The instruction tells the model to read a file that does not exist. At run time the read fails and the skill continues without the information it was told to rely on.",
    recommendation: "Add the missing file, or correct the reference.",
    fixSteps: [
      { order: 1, action: "Check the referenced path against the files actually in the bundle." },
      { order: 2, action: "Add the missing file, or correct the path in SKILL.md." },
    ],
    referenceIds: ["ms-skill-design-checklist"],
    severity: "high",
    confidence: "high",
    family: "Packaging",
    dimension: "integrity",
  },

  // Group B — size limits.

  "LIM-SIZE": {
    ruleId: "LIM-SIZE",
    title: "Cowork Companion Files Exceed 10 MB",
    why: "Copilot Cowork rejects a skill when the files alongside SKILL.md total more than 10 MB.",
    recommendation: "Reduce the total size of the Cowork companion files.",
    fixSteps: [
      { order: 1, action: "Remove large binaries, sample data and images that the skill does not need at run time." },
      { order: 2, action: "Fetch large reference material at run time instead of bundling it." },
    ],
    referenceIds: ["ms-skill-design-checklist"],
    severity: "critical",
    confidence: "high",
    family: "Packaging",
    dimension: "integrity",
  },

  "LIM-FILES": {
    ruleId: "LIM-FILES",
    title: "Cowork Skill Has More Than 20 Companion Files",
    why: "Copilot Cowork accepts at most 20 files alongside SKILL.md. SKILL.md itself is not part of that count.",
    recommendation: "Reduce the Cowork companion-file count to 20 or fewer.",
    fixSteps: [
      { order: 1, action: "Merge related reference files into a single document." },
      { order: 2, action: "Delete files the skill never reads." },
    ],
    referenceIds: ["ms-skill-design-checklist"],
    severity: "high",
    confidence: "high",
    family: "Packaging",
    dimension: "integrity",
  },

  "LIM-FILESIZE": {
    ruleId: "LIM-FILESIZE",
    title: "Cowork Companion File Exceeds 5 MB",
    why: "Copilot Cowork rejects a companion file larger than 5 MB.",
    recommendation: "Split the file, or trim it to what the skill actually needs.",
    fixSteps: [
      { order: 1, action: "Split the file into focused sections the skill can read individually." },
      { order: 2, action: "Reference the specific section from SKILL.md rather than the whole document." },
    ],
    referenceIds: ["ms-skill-design-checklist"],
    severity: "medium",
    confidence: "high",
    family: "Packaging",
    dimension: "integrity",
  },

  "LIM-DESC": {
    ruleId: "LIM-DESC",
    title: "Cowork Skill Description Exceeds 1024 Characters",
    why: "Copilot Cowork requires a non-empty skill description between 1 and 1024 characters.",
    recommendation: "Shorten the description, moving the detail into the body.",
    fixSteps: [
      { order: 1, action: "Keep the opening sentence that states when to use the skill." },
      { order: 2, action: "Move the remaining detail into the body of SKILL.md." },
    ],
    referenceIds: ["agent-skills-spec", "ms-skill-design-checklist"],
    severity: "medium",
    confidence: "high",
    family: "Packaging",
    dimension: "quality",
  },

  // Group C — secrets and private data.

  "SEC-SECRET": {
    ruleId: "SEC-SECRET",
    title: "Bundle Contains What Appears to Be a Live Credential",
    why: "A credential inside a shared skill is disclosed to everyone who installs it. Anything committed this way must be treated as compromised, whether or not the bundle was ever published.",
    recommendation: "Revoke the credential, then remove it from the bundle.",
    fixSteps: [
      { order: 1, action: "Revoke or rotate the credential now. Removing the file does not undo the exposure." },
      { order: 2, action: "Delete the value from the bundle and from your version-control history." },
      { order: 3, action: "Read the credential from a secret store or environment variable at run time instead." },
    ],
    referenceIds: ["owasp-secrets-management", "cwe-798", "owasp-llm02"],
    severity: "critical",
    confidence: "high",
    family: "Security",
    dimension: "safety",
  },

  "SEC-PII": {
    ruleId: "SEC-PII",
    title: "Bundle Contains Personal or Financial Data",
    why: "A shared skill is copied by everyone who installs it. Personal or financial data inside it is disclosed with every copy, and cannot be recalled once distributed.",
    recommendation: "Remove the data and replace it with a clearly fictional example.",
    fixSteps: [
      { order: 1, action: "Delete the real value from the bundle." },
      { order: 2, action: "Replace it with an obviously fictional placeholder if an example is needed." },
    ],
    referenceIds: ["pci-dss", "owasp-llm02", "owasp-secrets-management"],
    severity: "critical",
    confidence: "high",
    family: "Security",
    dimension: "safety",
  },

  "SEC-SAS": {
    ruleId: "SEC-SAS",
    title: "Bundle Contains a Pre-Signed Access URL",
    why: "A pre-signed URL grants access to its target to anyone holding the link, with no further authentication, until it expires.",
    recommendation: "Revoke the signature and remove the URL.",
    fixSteps: [
      { order: 1, action: "Revoke the signature or rotate the signing key." },
      { order: 2, action: "Remove the URL from the bundle and generate signed links at run time instead." },
    ],
    referenceIds: ["owasp-secrets-management", "cwe-798"],
    severity: "critical",
    confidence: "high",
    family: "Security",
    dimension: "safety",
  },

  "SEC-CONN": {
    ruleId: "SEC-CONN",
    title: "Bundle Contains a Connection String",
    why: "Connection strings usually embed credentials alongside the endpoint, so the whole data source is disclosed with the bundle.",
    recommendation: "Remove the connection string and resolve it at run time.",
    fixSteps: [
      { order: 1, action: "Rotate any credential contained in the string." },
      { order: 2, action: "Remove the string from the bundle." },
      { order: 3, action: "Resolve the connection from configuration or a secret store at run time." },
    ],
    referenceIds: ["owasp-secrets-management", "cwe-798"],
    severity: "critical",
    confidence: "high",
    family: "Security",
    dimension: "safety",
  },

  "SEC-PATH": {
    ruleId: "SEC-PATH",
    title: "Bundle Contains a Local Filesystem Path",
    why: "An absolute path from the author's machine does not exist on anyone else's, so the step fails everywhere but where it was written. It also discloses the author's account name and folder layout.",
    recommendation: "Replace absolute paths with relative ones.",
    fixSteps: [
      { order: 1, action: "Replace the absolute path with a path relative to the skill folder." },
      { order: 2, action: "Where an absolute path is genuinely needed, take it as an input rather than hardcoding it." },
    ],
    referenceIds: ["ms-skill-design-checklist", "cwe-497"],
    severity: "medium",
    confidence: "high",
    family: "Security",
    dimension: "safety",
  },

  "SEC-HOST": {
    ruleId: "SEC-HOST",
    title: "Bundle Contains an Internal Hostname or Address",
    why: "Internal hostnames and private addresses are unreachable from other environments, and disclosing them tells a reader about network layout they were not meant to see.",
    recommendation: "Remove the internal address or make it configurable.",
    fixSteps: [
      { order: 1, action: "Replace the internal address with a configurable value." },
      { order: 2, action: "Document what the value should be set to, without naming a real internal host." },
    ],
    referenceIds: ["owasp-secrets-management", "cwe-200"],
    severity: "medium",
    confidence: "medium",
    family: "Security",
    dimension: "safety",
  },

  // Group D — non-blocking authoring guidance.

  "SHP-TRIGGER": {
    ruleId: "SHP-TRIGGER",
    title: "Description Does Not State When to Use the Skill",
    why: "Official guidance says the description should explain both what the skill does and when to use it. Without trigger phrases, the agent has less information for matching a request to the skill.",
    recommendation: "Add concrete trigger situations and phrases to the description.",
    fixSteps: [
      { order: 1, action: "State the triggering situation, for example \"Use when the user asks to…\"." },
      { order: 2, action: "Name the concrete phrases and file types that should trigger the skill." },
      { order: 3, action: "Keep the description focused on what the skill does and when it applies." },
    ],
    referenceIds: ["ms-skill-authoring-rubric", "ms-skill-design-checklist"],
    severity: "medium",
    confidence: "medium",
    family: "Skills",
    dimension: "quality",
  },

  "SHP-BODYLEN": {
    ruleId: "SHP-BODYLEN",
    title: "Cowork Skill Body Exceeds the Authoring Guideline",
    why: "Copilot Cowork recommends moving detail into references when SKILL.md exceeds about 3,000 words. This is authoring advice, not an upload requirement.",
    recommendation: "Move detail into referenced resource files.",
    fixSteps: [
      { order: 1, action: "Keep the main procedure in SKILL.md." },
      { order: 2, action: "Move reference tables and edge cases into separate files." },
      { order: 3, action: "Reference each file from the step that needs it, so it is read only when relevant." },
    ],
    // The Cowork authoring rubric carries this claim directly. The Anthropic blog
    // was cited beside it, which this file's own policy rules out: a vendor blog
    // earns its place nowhere Microsoft has already spoken.
    referenceIds: ["ms-skill-authoring-rubric"],
    severity: "low",
    confidence: "medium",
    family: "Skills",
    dimension: "quality",
  },

  "SHP-HEADINGS": {
    ruleId: "SHP-HEADINGS",
    title: "Skill Body Has No Section Headings",
    why: "Agent Skills guidance recommends structured sections so the agent can locate the part of the instructions relevant to the current task.",
    recommendation: "Add headings that separate the skill's phases.",
    fixSteps: [
      { order: 1, action: "Split the body into sections such as when to use, steps, and edge cases." },
      { order: 2, action: "Give each section a second-level markdown heading." },
    ],
    referenceIds: ["agent-skills-spec", "ms-skill-authoring-rubric"],
    severity: "low",
    confidence: "medium",
    family: "Skills",
    dimension: "quality",
  },

  "SHP-STEPS": {
    ruleId: "SHP-STEPS",
    title: "Procedure Is Not Written as Ordered Steps",
    why: "A procedure written as prose leaves the order implicit, so the model may reorder it. Numbered steps make the sequence explicit and testable.",
    recommendation: "Rewrite the procedure as a numbered list.",
    fixSteps: [
      { order: 1, action: "Break the procedure into discrete actions." },
      { order: 2, action: "Number them in the order they must happen." },
    ],
    referenceIds: ["ms-skill-authoring-rubric"],
    severity: "low",
    confidence: "medium",
    family: "Skills",
    dimension: "quality",
  },

  // Group E — Scout automations.

  "AUTO-SCHEMA": {
    ruleId: "AUTO-SCHEMA",
    title: "Automation Does Not Match the Import Contract",
    why: "The importer validates the definition before accepting it. A definition that fails validation is rejected outright, so the automation never runs.",
    recommendation: "Correct the definition so it satisfies the import contract.",
    fixSteps: [
      { order: 1, action: "Read the reported field and the value the contract expects." },
      { order: 2, action: "Correct the field, then re-import to confirm the definition is accepted." },
    ],
    referenceIds: ["ms-scout-automation-schema"],
    severity: "critical",
    confidence: "high",
    family: "Automation",
    dimension: "integrity",
  },

  "AUTO-STEPS": {
    ruleId: "AUTO-STEPS",
    title: "Automation Has No Steps",
    why: "An automation with no steps imports successfully and then does nothing on every scheduled run, which is harder to notice than an outright failure.",
    recommendation: "Add at least one step with a label and a prompt.",
    fixSteps: [
      { order: 1, action: "Add a step describing the first action the automation must take." },
      { order: 2, action: "Give it a short label and a prompt that states the action and its expected output." },
    ],
    referenceIds: ["ms-scout-automation-schema"],
    severity: "critical",
    confidence: "high",
    family: "Automation",
    dimension: "integrity",
  },

  "AUTO-UNATTENDED": {
    ruleId: "AUTO-UNATTENDED",
    title: "Step Asks the User a Question",
    why: "An unattended automation cannot stop to ask a human. A step that waits for an answer stalls the run, and the schedule continues without the work ever completing.",
    recommendation: "Replace the question with a decision the automation can make on its own.",
    fixSteps: [
      { order: 1, action: "State the rule the automation should apply instead of asking." },
      { order: 2, action: "Where a human really must decide, have the automation report and stop rather than wait." },
    ],
    // Scout's automation guidance only. OWASP LLM06 Excessive Agency describes an
    // agent that acts too freely on its own; a step that stalls waiting for a
    // human is the opposite failure, so citing it here would mislead the reader.
    // AUTO-DESTRUCTIVE below is the rule that genuinely earns that citation.
    referenceIds: ["ms-scout-automation-schema"],
    severity: "high",
    confidence: "medium",
    family: "Automation",
    dimension: "readiness",
  },

  "AUTO-DESTRUCTIVE": {
    ruleId: "AUTO-DESTRUCTIVE",
    title: "Step Performs an Irreversible Action Without Stating Its Scope",
    why: "An unattended step that deletes or sends has no human check between the instruction and the effect. Without an explicit scope the model decides how far the action reaches, on every scheduled run.",
    recommendation: "State exactly what the action may affect.",
    fixSteps: [
      { order: 1, action: "Name the exact scope: which items, which folder, which recipients." },
      { order: 2, action: "Add an explicit upper bound, so an unexpected result cannot become an unbounded action." },
      { order: 3, action: "Prefer a reversible action, such as moving to an archive rather than deleting." },
    ],
    referenceIds: ["owasp-llm06", "ms-scout-automation-schema"],
    severity: "high",
    confidence: "medium",
    family: "Automation",
    dimension: "safety",
  },

  // Group F — runtime awareness.

  "COWORK-BROWSER": {
    ruleId: "COWORK-BROWSER",
    title: "Browser Tool Is Not in Cowork's Published Tool List",
    why: "The current Copilot Cowork tool list does not include browser automation. Because capability lists can change, confirm the dependency and the current runtime surface before treating this as incompatible.",
    recommendation: "Reach the same data through a Microsoft 365 tool, an API or a command-line tool.",
    fixSteps: [
      { order: 1, action: "Identify what the browser step was retrieving or submitting." },
      { order: 2, action: "Replace it with the equivalent Microsoft 365 tool, API call or CLI command." },
      { order: 3, action: "If no equivalent exists, state in the description that the skill targets a runtime with browser access." },
    ],
    // The Cowork platform page lists the tool surface, which is what proves the
    // browser is absent. The package validation rules were cited beside it, but
    // they govern package structure and say nothing about which tools exist.
    referenceIds: ["ms-cowork-platform"],
    severity: "high",
    confidence: "medium",
    family: "Runtime",
    dimension: "readiness",
  },

  "RT-TOOL": {
    ruleId: "RT-TOOL",
    title: "Skill Names a Tool the Target Runtime Does Not Provide",
    why: "A step that calls a tool the runtime does not expose fails at that step. The skill has already begun its work, so the result is a partial outcome rather than a clean refusal.",
    recommendation: "Use a tool the runtime provides, or narrow the skill's stated target runtime.",
    fixSteps: [
      { order: 1, action: "Check the tool name against those the runtime exposes." },
      { order: 2, action: "Replace it with the closest available equivalent." },
      { order: 3, action: "If no equivalent exists, say in the description which runtime the skill targets." },
    ],
    referenceIds: ["ms-cowork-platform", "ms-scout-platform"],
    severity: "high",
    confidence: "medium",
    family: "Runtime",
    dimension: "readiness",
  },

  "RT-URL": {
    ruleId: "RT-URL",
    title: "Skill Drives a Website That Has a Command-Line Tool",
    why: "Driving a web interface is slower and far more brittle than the equivalent command-line tool, and it breaks whenever the page layout changes.",
    recommendation: "Use the documented command-line tool instead.",
    fixSteps: [
      { order: 1, action: "Replace the navigation step with the equivalent command." },
      { order: 2, action: "Declare the command in the skill's allowed tools so it is available at run time." },
    ],
    // The Scout platform page documents the command-line tools that make the
    // web-driving step unnecessary. The Cowork package validation rules were
    // cited beside it, but they govern package structure, not tool choice.
    referenceIds: ["ms-scout-platform"],
    severity: "medium",
    confidence: "medium",
    family: "Runtime",
    dimension: "readiness",
  },

  "RT-BUILTIN": {
    ruleId: "RT-BUILTIN",
    title: "Skill Re-Implements a Capability the Runtime Already Provides",
    why: "A skill that duplicates a built-in competes with it for selection. The model may choose either, so behaviour varies between runs for reasons the author cannot see.",
    recommendation: "Build on the existing capability rather than replacing it.",
    fixSteps: [
      { order: 1, action: "Compare the skill against the built-in capability and identify what it genuinely adds." },
      { order: 2, action: "Narrow the skill to that difference, and have it defer to the built-in for the rest." },
      { order: 3, action: "Withdraw the skill if it adds nothing the built-in does not already do." },
    ],
    referenceIds: ["ms-cowork-platform", "ms-scout-platform", "ms-skill-authoring-rubric"],
    severity: "medium",
    confidence: "medium",
    family: "Runtime",
    dimension: "quality",
  },
};

/**
 * Look up a registered rule definition by its ID.
 *
 * @param ruleId - The rule identifier (e.g. "SCR-CMD-01").
 * @returns The rule definition, or undefined if not registered.
 */
export function getRule(ruleId: string): SkillRuleDefinition | undefined {
  return RULE_REGISTRY[ruleId];
}

/**
 * Resolve the rubric dimension for any skill finding, from any source.
 *
 * Registered rules are authoritative (their `dimension` field wins). Findings
 * built outside the registry (L0 authoring rules, bundle-integrity BND-xx, and
 * inline SKL-xx findings) are mapped by their rule-ID prefix so grouped display
 * always has a dimension. Cross-skill findings (SKL-06) are agent-level and are
 * surfaced through the orchestration section, not a per-finding dimension; they
 * still resolve to "integrity" here as a safe default when shown as a finding.
 *
 * @param ruleId - The finding's rule identifier (e.g. "BND-01", "SKL-05").
 * @returns The rubric dimension the finding rolls up into.
 */
export function dimensionForRuleId(ruleId: string): SkillRubricDimension {
  const registered = RULE_REGISTRY[ruleId];
  if (registered) return registered.dimension;

  // Bundle integrity: referenced/missing/unreferenced/progressive-disclosure.
  if (ruleId.startsWith("BND-")) return "integrity";

  // Skill-level findings by number.
  if (ruleId.startsWith("SKL-")) {
    // SKL-05 injection scan is a safety concern.
    if (ruleId === "SKL-05") return "safety";
    // SKL-06 cross-skill conflict is agent-level; default to integrity when shown flat.
    if (ruleId === "SKL-06") return "integrity";
    // SKL-10 insufficient-guardrails and SKL-08 skill-to-skill coupling are safety/integrity.
    if (ruleId === "SKL-10") return "safety";
    if (ruleId === "SKL-08" || ruleId === "SKL-09") return "integrity";
    // SKL-14 (no evals/examples) is an operational-readiness signal.
    if (ruleId === "SKL-14") return "readiness";
    // SKL-01/02/03 (frontmatter/description), SKL-07 (structure/size), and the
    // authoring lints SKL-04/11/12/13 (steps/routing/negative-scope) are
    // instruction-quality authoring signals.
    return "quality";
  }

  // Resource/operational readiness findings.
  if (ruleId.startsWith("RES-") || ruleId.startsWith("OPS-")) return "readiness";

  // Security scanner families (SCR/HTML/MD) default to safety.
  return "safety";
}

/**
 * Validate that every supplied candidate reference ID belongs to the
 * approved set for the given rule.
 *
 * @param ruleId - Rule whose approved references are checked against.
 * @param candidateIds - Reference IDs to validate.
 * @returns `true` when all candidates are approved; `false` otherwise (including unknown rule).
 */
export function validateRuleReferences(ruleId: string, candidateIds: string[]): boolean {
  const rule = RULE_REGISTRY[ruleId];
  if (!rule) return false;
  const approved = new Set<string>(rule.referenceIds);
  return candidateIds.every((id) => approved.has(id));
}

/**
 * Construct a fully-typed {@link GroundedSkillFinding} by merging the caller's
 * evidence with all deterministic fields sourced from the rule registry.
 * Every displayed finding must be created through this factory so that titles,
 * why-text, ordered fix steps, and reference IDs always come from the registry.
 *
 * @param ruleId - Registered rule identifier.
 * @param opts.resourcePath - Resource file path where the finding was detected.
 * @param opts.evidence - Pre-sanitized evidence snippet shown in the UI.
 * @param opts.fact - Pre-sanitized evidence text for the monospace block.
 * @param opts.severity - Optional severity override; falls back to the rule default.
 * @throws {Error} when `ruleId` is not registered.
 */
export function createRegisteredFinding(
  ruleId: string,
  opts: {
    resourcePath?: string;
    evidence: string;
    fact: string;
    severity?: SkillFindingSeverity;
  },
): GroundedSkillFinding {
  const rule = RULE_REGISTRY[ruleId];
  if (!rule) {
    throw new Error(`Rule "${ruleId}" is not registered in the skill rule registry.`);
  }
  const effectiveSeverity = opts.severity ?? rule.severity;
  const blocksSafety =
    rule.dimension === 'safety' &&
    (effectiveSeverity === 'critical' || effectiveSeverity === 'high');
  return {
    id: `${ruleId}:${opts.resourcePath ?? "unknown"}`,
    ruleId,
    family: rule.family,
    severity: effectiveSeverity,
    title: rule.title,
    fact: opts.fact,
    why: rule.why,
    fix: rule.recommendation,
    referenceId: rule.referenceIds[0] as ReferenceId,
    ai: false,
    evidence: opts.evidence,
    recommendation: rule.recommendation,
    fixSteps: rule.fixSteps,
    referenceIds: rule.referenceIds,
    confidence: rule.confidence,
    resourcePath: opts.resourcePath,
    dimension: rule.dimension,
    safetyDisposition:
      rule.dimension === 'safety' ? (blocksSafety ? 'blocking' : 'advisory') : undefined,
    platformOverlap: rule.dimension === 'safety' ? 'unverified' : undefined,
    skipAiEvaluation: false,
  };
}
