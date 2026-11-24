/**
 * The deterministic scanner rules over an uploaded skill's Markdown and text
 * resources.
 *
 * Same move as `skill-scanner.rules.ts`, which owns the shared machinery and the
 * Python family: the declaration below is the one authority, and
 * {@link skillScannerRule} projects it into the `Rule` the core registry wants
 * and the legacy `SkillRuleDefinition` row `createRegisteredFinding` has always
 * read. Nothing here re-states a value the exemplar already derives.
 *
 * These five are one family by subject as well as by population: every one of
 * them is a prompt-injection surface that arrives as prose. A Markdown resource
 * is read by the model, not executed, so the attack is not a dangerous call but
 * a dangerous *sentence* — an override directive, a hidden comment, a beacon
 * URL, an execution order, a forged signature. The detectors live in
 * `resourceScanners.ts` (`MARKDOWN_PATTERNS`), and the `passWhen`/`failWhen`
 * prose below describes those patterns rather than the risk in the abstract, so
 * a maker reading a pass knows what was actually looked for.
 */

import {
  MARKDOWN_RESOURCES, skillScannerRule,
  type SkillScannerOptions, type SkillScannerRuleEntry,
} from './skill-scanner.rules';

// ── Markdown / text scanner rules ──────────────────────────────────────────

export const MD_ROLEOVR_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'critical', confidence: 'high', population: MARKDOWN_RESOURCES,
});

export const MD_ROLEOVR_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'MD-ROLEOVR-01',
  title: 'Role or System Override Attempt in Markdown Resource',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-llm01'],
  prose: {
    question: "Does every Markdown or text resource leave the agent's role and system prompt alone?",
    summary: 'Scan decoded Markdown and text resources for directives that discard prior instructions or reassign the agent a new identity, skipping phrases quoted as documented prompt-injection examples.',
    why: "Skill resources must not contain instructions that override the agent's operating guidelines.",
    fix: "Remove all instructions that attempt to override, reset, or redefine the agent's role or system prompt.",
    fixSteps: [
      'Remove the role/system override directive from the resource.',
      "Review the resource author's intent and restrict any instruction that controls agent behavior.",
    ],
    passWhen: [
      'No scanned Markdown or text resource tells the agent to ignore all previous instructions, directives, rules, guidelines, prompts or context.',
      'No scanned resource tells the agent to forget, disregard, reset, wipe or erase everything it was given.',
      'No scanned resource reassigns the agent with "from now on you are / act as / pretend to be" or "you are now a / in developer mode".',
      'An override phrase that is present is quoted inline on a line that documents it as a prompt-injection example, which the scanner treats as documentation rather than an instruction.',
    ],
    failWhen: [
      'A Markdown or text resource instructs the agent to ignore or discard the instructions, rules or guidelines it is already operating under.',
      "A Markdown or text resource rewrites the agent's identity — \"from now on you must\", \"you are now in developer mode\" — so the resource supersedes the system prompt.",
    ],
    notApplicableWhen: ['The skill contains no Markdown or text resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, MD_ROLEOVR_01_OPTIONS);

export const MD_COMMENT_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'high', confidence: 'medium', population: MARKDOWN_RESOURCES,
});

export const MD_COMMENT_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'MD-COMMENT-01',
  title: 'Hidden Instruction in Markdown Comment',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-llm01'],
  prose: {
    question: 'Does every Markdown or text resource keep its HTML comments free of agent instructions?',
    summary: 'Scan decoded Markdown and text resources for HTML comment blocks whose body carries an imperative the renderer hides but the model still reads.',
    why: 'A comment containing an active instruction is invisible when rendered but can still be parsed by an LLM.',
    fix: 'Remove hidden behavioral instructions from Markdown comments.',
    fixSteps: [
      'Delete the hidden instruction from the comment block.',
      'Move any necessary context into visible, attributable prose.',
    ],
    passWhen: [
      'Scanned resources contain no HTML comment blocks at all.',
      'The comment blocks they do contain hold only authoring notes — none mentions ignore, disregard, forget, override, execute, invoke, upload, transmit, exfiltrate, beacon, system prompt, developer mode or shell command.',
    ],
    failWhen: [
      'An HTML comment block in a Markdown or text resource carries one of those instruction keywords, so the text never reaches a human reviewing the rendered page but is still handed to the model.',
    ],
    notApplicableWhen: ['The skill contains no Markdown or text resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, MD_COMMENT_01_OPTIONS);

export const MD_EXFIL_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'high', confidence: 'medium', population: MARKDOWN_RESOURCES,
});

export const MD_EXFIL_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'MD-EXFIL-01',
  title: 'Exfiltration or Beacon URL in Markdown Resource',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-llm01', 'owasp-llm02'],
  prose: {
    question: 'Does every Markdown or text resource avoid outbound URLs that could carry data off the host?',
    summary: 'Scan decoded Markdown and text resources for URLs whose path or query string names a beacon or exfiltration endpoint, and for send/upload verbs written alongside a remote URL.',
    why: 'URLs embedded in skill resources can be used as beacons to exfiltrate data when the agent renders or retrieves the resource.',
    fix: 'Remove all outbound URLs from skill resources; use relative links or reference IDs only.',
    fixSteps: [
      'Remove the outbound URL from the resource.',
      'If a reference is necessary, cite a local resource path or approved knowledge source.',
    ],
    passWhen: [
      'No scanned resource holds an http or https URL whose path segment is beacon, track, tracking, pixel, exfil or c2.',
      'No scanned resource holds a URL whose query string sets data, payload, exfil, dump or beacon.',
      'No scanned resource places send, upload, transmit, exfiltrate or beacon within 80 characters before an http or https URL.',
    ],
    failWhen: [
      'A Markdown or text resource embeds a beacon-, pixel-, tracking- or c2-named URL, or one whose query string is shaped to carry a payload out.',
      'A Markdown or text resource instructs the agent to send, upload, transmit or exfiltrate something to a remote URL named on the same line.',
    ],
    notApplicableWhen: ['The skill contains no Markdown or text resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, MD_EXFIL_01_OPTIONS);

export const MD_EXEC_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'high', confidence: 'high', population: MARKDOWN_RESOURCES,
});

export const MD_EXEC_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'MD-EXEC-01',
  title: 'Unsafe Execution Instruction in Markdown Resource',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-llm06'],
  prose: {
    question: 'Does every Markdown or text resource stop short of ordering the agent to run a shell command?',
    summary: 'Scan decoded Markdown and text resources for shell execution directives, reporting only those whose line also pipes a download into a shell, names a destructive or credential operation, or routes untrusted input to the shell.',
    why: 'Instructions telling the agent to execute shell commands or run code are an excessive agency risk.',
    fix: 'Remove all directives instructing the agent to run commands or execute code.',
    fixSteps: [
      'Delete the execution directive from the resource.',
      'If automation is needed, implement it as an approved connector action, not a text directive.',
    ],
    passWhen: [
      'No scanned resource tells the agent to execute, run, invoke or call a shell, bash, cmd, powershell or terminal command or script.',
      'Any shell wording that is present is benign in context: its line neither pipes a download into a shell, nor names a destructive or credential operation, nor routes untrusted input into a shell.',
    ],
    failWhen: [
      'A shell directive sits on a line that pipes curl, wget or Invoke-WebRequest into sh, bash or powershell.',
      'A shell directive sits on a line naming delete, remove, erase, wipe, format, shutdown, credential, token or secret.',
      'A shell directive sits on a line that feeds user input, an argument, a parameter or untrusted data to a shell, cmd or powershell.',
    ],
    notApplicableWhen: ['The skill contains no Markdown or text resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, MD_EXEC_01_OPTIONS);

export const MD_SPOOF_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'high', confidence: 'high', population: MARKDOWN_RESOURCES,
});

export const MD_SPOOF_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'MD-SPOOF-01',
  title: 'Authority Spoofing in Markdown Resource',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-llm01'],
  prose: {
    question: 'Does every Markdown or text resource avoid claiming vendor or platform authority for its own content?',
    summary: 'Scan decoded Markdown and text resources for sentences claiming the content was sent, written, created or approved by a named vendor, or self-certifying it as a trusted or official directive.',
    why: 'Claims of official authorship or platform authorization in a skill resource attempt to manufacture false trust.',
    fix: 'Remove all authority claims from the resource; legitimate platform instructions are never embedded in skill files.',
    fixSteps: [
      'Delete the authority claim from the resource.',
      'Remind users that official platform instructions never appear inside uploaded skill files.',
    ],
    passWhen: [
      'No scanned resource claims this skill, instruction or message was sent, written, created or approved by Anthropic, Microsoft, OpenAI, the developer or the platform.',
      'No scanned resource describes itself as a trusted, verified, official or authorized source, instruction or directive.',
    ],
    failWhen: [
      'A Markdown or text resource attributes its own content to a named vendor or to the platform, borrowing an authority an uploaded file cannot have.',
      'A Markdown or text resource self-certifies as trusted, verified, official or authorized so the agent weights it above the instructions it was actually given.',
    ],
    notApplicableWhen: ['The skill contains no Markdown or text resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, MD_SPOOF_01_OPTIONS);

/**
 * The Markdown scanner rules declared here, in published order.
 *
 * Kept as its own list rather than appended to `skillScannerRuleEntries` so the
 * two files stay independently editable; the registry spreads both.
 */
export const markdownScannerRuleEntries: readonly SkillScannerRuleEntry[] = Object.freeze([
  MD_ROLEOVR_01,
  MD_COMMENT_01,
  MD_EXFIL_01,
  MD_EXEC_01,
  MD_SPOOF_01,
]);
