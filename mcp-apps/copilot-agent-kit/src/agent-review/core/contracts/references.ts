/**
 * Curated official reference registry (spec 013 §2, §5; research §12).
 * Every grounded finding must cite one of these entries; the CitationGate
 * drops AI output citing any URL not present here.
 *
 * The keys are frozen. They are persisted on every saved finding as
 * `referenceId`, so renaming one orphans the citation on every review already
 * in Dataverse. `ms-classic-vs-new` keeps its name for that reason even though
 * the product no longer says "classic" -- only its title and URL are current.
 *
 * Titles and URLs, by contrast, are resolved at render time from this map, so
 * correcting them here also corrects every saved review.
 *
 * Titles mirror the live Learn pages, checked 2026-08-07. "(preview)" is kept
 * only where the page itself still carries it: the GitHub Copilot harness is
 * generally available, but Work IQ, Memory and agent evaluation are not.
 *
 * ── Non-Microsoft sources, audited 2026-08-09 ────────────────────────────────
 * All OWASP, CWE and Anthropic URLs were fetched and confirmed to resolve, and
 * every title below now matches the live page. Three CWE titles were corrected:
 * 502 was "Unsafe Deserialization", which is a paraphrase and not a CWE alias
 * (the official name is "Deserialization of Untrusted Data"); 798 and 918 were
 * truncations. The other four CWE titles use CWE's own parenthetical alias,
 * which is the short form CWE itself publishes, so they were left alone.
 *
 * **Do not "fix" the `owasp-llm01` URL for consistency.** It is the only LLM
 * entry whose slug carries no year, which reads like an oversight beside
 * `llm022025-`, `llm052025-` and `llm062025-`. It is not: `llm012025-...`
 * returns 404, and the unversioned slug serves the current page, titled
 * "LLM01:2025 Prompt Injection". The inconsistency is OWASP's, and the URL here
 * is the working one.
 *
 * `anthropic-agents` remains only for saved historical reviews. Persisted
 * findings store reference IDs, so deleting this entry would orphan their
 * citations. New findings must not cite it. BND-05 and XSK-05 use Microsoft
 * guidance, while MD-ROLEOVR-01 and MD-EXEC-01 use the applicable OWASP pages.
 *
 * The pattern worth keeping: OWASP and CWE earn their place because the rules
 * citing them scan Python, HTML and Markdown bundled inside a skill, where CWE
 * is the canonical identifier and Microsoft publishes no equivalent. A vendor
 * blog earns its place nowhere Microsoft has already spoken.
 */
export interface ReferenceEntry {
  title: string;
  url: string;
  source: 'Agent Skills' | 'Microsoft Learn' | 'OWASP' | 'Anthropic' | 'MITRE CWE' | 'PCI SSC';
}

export const REFERENCES = {
  'agent-skills-spec':            { title: 'Agent Skills specification', url: 'https://agentskills.io/specification', source: 'Agent Skills' },
  'ms-authoring-instructions': { title: 'Configure agent details and instructions', url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/authoring-instructions', source: 'Microsoft Learn' },
  'ms-tools-skills':           { title: 'Build an agent', url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/build-overview', source: 'Microsoft Learn' },
  'ms-enduser-auth':           { title: 'Configure user authentication for tools', url: 'https://learn.microsoft.com/microsoft-copilot-studio/configure-enduser-authentication', source: 'Microsoft Learn' },
  'ms-connections':            { title: 'Create and manage connections', url: 'https://learn.microsoft.com/microsoft-copilot-studio/authoring-connections', source: 'Microsoft Learn' },
  'ms-skills-overview':        { title: 'Skills overview for agents', url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/skills-overview', source: 'Microsoft Learn' },
  'ms-skills-create':          { title: 'Create a skill for an agent', url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/skills-create', source: 'Microsoft Learn' },
  'ms-knowledge-add':          { title: 'Add knowledge sources to an agent', url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/knowledge-add-existing-copilot', source: 'Microsoft Learn' },
  'ms-work-iq':                { title: 'Work IQ in Microsoft Copilot Studio (preview)', url: 'https://learn.microsoft.com/microsoft-copilot-studio/add-work-iq', source: 'Microsoft Learn' },
  'ms-memory':                 { title: 'Memory (preview)', url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/memory-overview', source: 'Microsoft Learn' },
  'ms-select-model':           { title: 'Select a model for an agent', url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/authoring-select-agent-model', source: 'Microsoft Learn' },
  'ms-connected-agent':        { title: 'Add a connected agent to an agent', url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/add-agent-connected', source: 'Microsoft Learn' },
  'ms-eval-intro':             { title: 'Evaluate an agent (preview)', url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/analytics-agent-evaluation-intro', source: 'Microsoft Learn' },
  'ms-eval-create':            { title: 'Create a test set for an agent (preview)', url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/analytics-agent-evaluation-create', source: 'Microsoft Learn' },
  'ms-eval-results':           { title: 'Run evaluations and view results', url: 'https://learn.microsoft.com/microsoft-copilot-studio/analytics-agent-evaluation-results', source: 'Microsoft Learn' },
  'ms-agents-overview':        { title: 'Agents overview', url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/overview', source: 'Microsoft Learn' },
  'ms-classic-vs-new':         { title: 'Choose a harness', url: 'https://learn.microsoft.com/microsoft-copilot-studio/harnesses-overview', source: 'Microsoft Learn' },
  'ms-standard-topics':       { title: 'Create and edit topics', url: 'https://learn.microsoft.com/microsoft-copilot-studio/authoring-create-edit-topics', source: 'Microsoft Learn' },
  'ms-standard-topic-checker': { title: 'Manage topics', url: 'https://learn.microsoft.com/microsoft-copilot-studio/authoring-topic-management', source: 'Microsoft Learn' },
  'owasp-llm01':               { title: 'OWASP Top 10 for LLM Applications — LLM01 Prompt Injection', url: 'https://genai.owasp.org/llmrisk/llm01-prompt-injection/', source: 'OWASP' },
  'owasp-llm02':               { title: 'OWASP LLM02 Sensitive Information Disclosure', url: 'https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/', source: 'OWASP' },
  'owasp-llm05':               { title: 'OWASP LLM05 Improper Output Handling', url: 'https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/', source: 'OWASP' },
  'owasp-llm06':               { title: 'OWASP LLM06 Excessive Agency', url: 'https://genai.owasp.org/llmrisk/llm062025-excessive-agency/', source: 'OWASP' },
  'owasp-input-validation':    { title: 'OWASP Input Validation Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html', source: 'OWASP' },
  'owasp-command-injection':   { title: 'OWASP OS Command Injection Defense Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html', source: 'OWASP' },
  'owasp-xss-prevention':      { title: 'OWASP Cross Site Scripting Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html', source: 'OWASP' },
  'owasp-clickjacking':        { title: 'OWASP Clickjacking Defense Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html', source: 'OWASP' },
  'owasp-secrets-management':  { title: 'OWASP Secrets Management Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html', source: 'OWASP' },
  'owasp-third-party-javascript': { title: 'OWASP Third Party JavaScript Management Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Javascript_Management_Cheat_Sheet.html', source: 'OWASP' },
  'pci-dss':                   { title: 'PCI Data Security Standard', url: 'https://www.pcisecuritystandards.org/document_library?document=pci_dss', source: 'PCI SSC' },
  'cwe-22':                    { title: 'CWE-22 Path Traversal', url: 'https://cwe.mitre.org/data/definitions/22.html', source: 'MITRE CWE' },
  'cwe-78':                    { title: 'CWE-78 OS Command Injection', url: 'https://cwe.mitre.org/data/definitions/78.html', source: 'MITRE CWE' },
  'cwe-79':                    { title: 'CWE-79 Cross-site Scripting', url: 'https://cwe.mitre.org/data/definitions/79.html', source: 'MITRE CWE' },
  'cwe-94':                    { title: 'CWE-94 Code Injection', url: 'https://cwe.mitre.org/data/definitions/94.html', source: 'MITRE CWE' },
  'cwe-200':                   { title: 'CWE-200 Exposure of Sensitive Information to an Unauthorized Actor', url: 'https://cwe.mitre.org/data/definitions/200.html', source: 'MITRE CWE' },
  'cwe-497':                   { title: 'CWE-497 Exposure of Sensitive System Information to an Unauthorized Control Sphere', url: 'https://cwe.mitre.org/data/definitions/497.html', source: 'MITRE CWE' },
  'cwe-502':                   { title: 'CWE-502 Deserialization of Untrusted Data', url: 'https://cwe.mitre.org/data/definitions/502.html', source: 'MITRE CWE' },
  'cwe-798':                   { title: 'CWE-798 Use of Hard-coded Credentials', url: 'https://cwe.mitre.org/data/definitions/798.html', source: 'MITRE CWE' },
  'cwe-918':                   { title: 'CWE-918 Server-Side Request Forgery (SSRF)', url: 'https://cwe.mitre.org/data/definitions/918.html', source: 'MITRE CWE' },
  // Retained only so citations in saved historical reviews continue to resolve.
  'anthropic-agents':          { title: 'Building Effective AI Agents', url: 'https://www.anthropic.com/engineering/building-effective-agents', source: 'Anthropic' },

  // ── Uploaded-artifact review (spec 018) ──────────────────────────────────
  // Microsoft's published authoring guidance for Agent Skills and Scout
  // automations. Cited by the active PKG/SHP/AUTO/RT/COWORK rules.
  //
  // These pointed at the cat-agent-skills and skill-recorder repositories until
  // Learn published the same material. A sample repository is a useful thing to
  // read but a poor thing to cite: it carries no commitment, it can be
  // restructured without notice, and a reader told "your skill breaks the rules"
  // deserves the page the rules are actually stated on. Every deterministic
  // threshold below is now traceable to a documented one:
  //
  //   PKG-SLUG        → ASKILL-P007, kebab-case name
  //   PKG-LINK        → companion file validation, relative paths that resolve
  //   SHP-*            → "Skill authoring best practices"
  //   AUTO-*           → documented Scout automation behavior
  //
  // Deep links carry an anchor so the reader lands on the rule, not the top of
  // a long article. Anchors are part of the published heading text, so they
  // move only when the heading does.
  'ms-skill-authoring-rubric': { title: 'Skill authoring best practices for Copilot Cowork', url: 'https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-plugin-development#skill-authoring-best-practices', source: 'Microsoft Learn' },
  'ms-skill-design-checklist': { title: 'Skill package validation rules for Copilot Cowork', url: 'https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-plugin-development#validation-rules', source: 'Microsoft Learn' },
  'ms-scout-automation-schema': { title: 'Create automations in Microsoft Scout', url: 'https://learn.microsoft.com/microsoft-scout/use-microsoft-scout#create-automations', source: 'Microsoft Learn' },
  'ms-cowork-platform':        { title: 'Build plugins for Copilot Cowork', url: 'https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-plugin-development', source: 'Microsoft Learn' },
  'ms-scout-platform':         { title: 'Use Microsoft Scout', url: 'https://learn.microsoft.com/microsoft-scout/use-microsoft-scout', source: 'Microsoft Learn' },
  'ms-scout-custom-skill':     { title: 'Create a custom skill in Microsoft Scout', url: 'https://learn.microsoft.com/microsoft-scout/use-microsoft-scout#create-a-custom-skill', source: 'Microsoft Learn' },
} as const satisfies Record<string, ReferenceEntry>;

export type ReferenceId = keyof typeof REFERENCES;
