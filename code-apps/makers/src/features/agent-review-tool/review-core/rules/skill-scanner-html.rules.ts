/**
 * The deterministic scanner rules over an uploaded skill's HTML resources.
 *
 * Same move as `skill-scanner.rules.ts`, continued: these nine rows used to be
 * hand-written metadata in `agents-experience/services/skill/skillRuleRegistry.ts`
 * with no `check`, and the detection lived in `resourceScanners.ts`. The
 * declaration below is now the one authority, projected into the `RuleOutcome`
 * shape the core registry wants and into the legacy `SkillRuleDefinition` shape
 * `createRegisteredFinding` has always read.
 *
 * They are split into their own file rather than appended to the Python rules
 * because the three populations `scanSkillResource` dispatches on are the natural
 * seam, not because an HTML rule is a different kind of thing — every rule here
 * is built by the same {@link skillScannerRule} and shares its generated check.
 *
 * Two things worth knowing before reading the prose:
 *
 * - **`passWhen` and `failWhen` describe the scanner, not the hazard.** Several
 *   of these rules have a classifier that suppresses a match the regex found —
 *   an archived `references/snapshot` path is never reported, a literal-valued
 *   `innerHTML` assignment is not a sink, and `HTML-SCRIPT-01` defers to whatever
 *   more specific inline-script rule fired on the same file. Prose that promised
 *   a failure the detector will not raise would be worse than no prose.
 * - **`dimension` is absent on purpose.** All nine legacy rows carry
 *   `dimension: "safety"`, and `safety-evidence` is the only skill dimension that
 *   buckets there, so the pillar below derives the legacy value rather than
 *   restating it.
 */

import {
  HTML_RESOURCES, skillScannerRule,
  type SkillScannerOptions, type SkillScannerRuleEntry,
} from './skill-scanner.rules';

/** Every HTML rule reads the same not-applicable sentence, so it is written once. */
const NO_HTML_RESOURCE = 'The skill contains no HTML resource for the scanner to read.';

// ── HTML scanner rules ─────────────────────────────────────────────────────

export const HTML_SCRIPT_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'medium', confidence: 'medium', population: HTML_RESOURCES,
});

export const HTML_SCRIPT_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'HTML-SCRIPT-01',
  title: 'Inline Script Requires Review',
  pillar: 'safety-evidence',
  severity: 'medium',
  tags: ['security'],
  references: ['owasp-xss-prevention'],
  prose: {
    question: 'Does every HTML resource keep its executable code out of inline script blocks?',
    summary: 'Scan decoded HTML resources for an opening script tag, as the catch-all for executable markup no more specific inline-script rule has already claimed.',
    why: 'An inline script is executable when the HTML is opened, but its presence alone does not establish XSS or data theft.',
    fix: 'Review the script for untrusted inputs, unsafe DOM sinks and network egress; move executable code to a controlled file where practical.',
    fixSteps: [
      'Remove the inline <script> block from the HTML.',
      'Serve scripts from a trusted, versioned external source with Subresource Integrity.',
      "Apply a Content Security Policy header that blocks 'unsafe-inline'.",
    ],
    passWhen: [
      'No scanned HTML resource contains an opening <script> tag.',
      'Every <script> tag found is already covered by a more specific inline-script rule, so this catch-all stays silent rather than reporting the same block twice.',
    ],
    failWhen: [
      'An HTML resource opens a <script> tag and no more specific inline-script rule has reported on that file.',
    ],
    notApplicableWhen: [NO_HTML_RESOURCE],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, HTML_SCRIPT_01_OPTIONS);

export const HTML_HANDLER_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'medium', confidence: 'medium', population: HTML_RESOURCES,
});

export const HTML_HANDLER_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'HTML-HANDLER-01',
  title: 'Inline Event Handler in HTML Resource',
  pillar: 'safety-evidence',
  severity: 'medium',
  tags: ['security'],
  references: ['cwe-79', 'owasp-xss-prevention'],
  prose: {
    question: 'Does every HTML resource attach its event listeners from script rather than from markup attributes?',
    summary: 'Scan decoded HTML resources for inline event-handler attributes, where an on-prefixed attribute assigns script directly in the tag.',
    why: 'Inline event handlers (onclick, onload, etc.) are an XSS vector.',
    fix: 'Remove all inline event handlers and attach listeners programmatically from a safe script.',
    fixSteps: [
      'Remove the inline event handler attribute.',
      'Attach event listeners programmatically from a controlled, external script file.',
      "Enforce a Content Security Policy that disallows 'unsafe-inline'.",
    ],
    passWhen: [
      'No scanned HTML resource assigns an on-prefixed attribute such as onclick=, onload= or onerror=.',
      'The only such attribute sits under an archived references path, which the scanner does not report on.',
    ],
    failWhen: [
      'An HTML resource assigns an inline event handler attribute, so script runs straight from the markup when the event fires.',
    ],
    notApplicableWhen: [NO_HTML_RESOURCE],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, HTML_HANDLER_01_OPTIONS);

export const HTML_JSCHEM_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'high', confidence: 'high', population: HTML_RESOURCES,
});

export const HTML_JSCHEM_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'HTML-JSCHEM-01',
  title: 'javascript: URL Scheme in HTML Resource',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['cwe-79', 'owasp-xss-prevention'],
  prose: {
    question: 'Is every URL in the HTML a real location rather than a javascript: expression?',
    summary: 'Scan decoded HTML resources for the javascript: URL scheme in any href, src or other URL-valued position.',
    why: 'javascript: href/src values execute code when the link or resource is activated.',
    fix: 'Replace all javascript: URLs with safe href values or button/click actions.',
    fixSteps: [
      "Replace the javascript: URL with a safe href (e.g., '#' with a delegated event listener).",
      'Sanitize all user-supplied URL values to reject the javascript: scheme.',
    ],
    passWhen: [
      'No scanned HTML resource contains the javascript: scheme, in an href, a src or anywhere else a URL is read.',
      'The only occurrence sits under an archived references path, which the scanner does not report on.',
    ],
    failWhen: [
      'An HTML resource contains a javascript: URL, so activating that link or loading that resource executes the expression after the colon.',
    ],
    notApplicableWhen: [NO_HTML_RESOURCE],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, HTML_JSCHEM_01_OPTIONS);

export const HTML_REMOTE_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'high', confidence: 'high', population: HTML_RESOURCES,
});

export const HTML_REMOTE_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'HTML-REMOTE-01',
  title: 'Remote External Resource in HTML',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-third-party-javascript', 'cwe-79'],
  prose: {
    question: 'Does every HTML resource load its scripts, media and stylesheets from somewhere the tenant controls?',
    summary: 'Scan decoded HTML resources for a script, img, link, video, audio, source, object or embed element whose src, href or data attribute is an absolute http or https URL.',
    why: 'Loading resources from external domains exposes users to third-party script injection and tracking.',
    fix: 'Remove or allowlist every external resource reference.',
    fixSteps: [
      'Replace the external resource URL with a locally hosted or allowlisted source.',
      'If an external source is required, add Subresource Integrity (integrity attribute).',
      'Restrict permitted origins via Content Security Policy.',
    ],
    passWhen: [
      'No script, img, link, video, audio, source, object or embed element in a scanned HTML resource points its src, href or data attribute at an absolute http:// or https:// URL.',
      'Every reference is relative or otherwise local, so nothing is fetched from a third-party origin when the page opens.',
    ],
    failWhen: [
      'An HTML resource loads a script, image, stylesheet, media file or embedded object from an absolute external URL.',
      'The match is graded high when the external element is a <script> tag, because that origin then runs code, and medium for the other element types.',
    ],
    notApplicableWhen: [NO_HTML_RESOURCE],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, HTML_REMOTE_01_OPTIONS);

export const HTML_FORM_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'high', confidence: 'high', population: HTML_RESOURCES,
});

export const HTML_FORM_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'HTML-FORM-01',
  title: 'HTML Form with External Action',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-llm02'],
  prose: {
    question: 'Does every form in the HTML submit to an endpoint the tenant controls?',
    summary: 'Scan decoded HTML resources for a form element whose action attribute is an absolute http or https URL.',
    why: 'Forms posting data to external URLs can silently exfiltrate user input.',
    fix: "Remove the form's external action attribute and route submissions through an approved API.",
    fixSteps: [
      'Remove the external action URL from the form element.',
      'Route form submissions through a controlled, allowlisted API endpoint.',
    ],
    passWhen: [
      'No <form> element in a scanned HTML resource sets its action attribute to an absolute http:// or https:// URL.',
      'Forms either omit an action or target a relative, in-tenant path.',
    ],
    failWhen: [
      'An HTML resource declares a <form> that posts to an absolute external URL, so whatever the user types is sent off-tenant the moment they submit.',
    ],
    notApplicableWhen: [NO_HTML_RESOURCE],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, HTML_FORM_01_OPTIONS);

export const HTML_FRAME_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'medium', confidence: 'medium', population: HTML_RESOURCES,
});

export const HTML_FRAME_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'HTML-FRAME-01',
  title: 'Embedded Frame Requires Review',
  pillar: 'safety-evidence',
  severity: 'medium',
  tags: ['security'],
  references: ['owasp-clickjacking'],
  prose: {
    question: 'Does the HTML avoid embedding another document inside itself?',
    summary: 'Scan decoded HTML resources for an iframe or frame element, which brings a second document — and possibly a second origin — into the page.',
    why: 'A frame can embed another origin and needs an explicit framing policy. Its presence alone does not prove cross-site scripting or clickjacking.',
    fix: 'Remove all iframe/frame elements; apply X-Frame-Options or CSP frame-ancestors.',
    fixSteps: [
      'Remove the iframe or frame element from the HTML.',
      'If embedding is required, allow only explicitly approved, same-origin content.',
      "Add X-Frame-Options DENY or Content Security Policy frame-ancestors 'none' to response headers.",
    ],
    passWhen: [
      'No scanned HTML resource opens an <iframe> or <frame> element.',
      'The only frame element sits under an archived references path, which the scanner does not report on.',
    ],
    failWhen: [
      'An HTML resource opens an <iframe> or <frame> element, embedding a document that no framing policy in the skill constrains.',
    ],
    notApplicableWhen: [NO_HTML_RESOURCE],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, HTML_FRAME_01_OPTIONS);

export const HTML_EGRESS_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'critical', confidence: 'high', population: HTML_RESOURCES,
});

export const HTML_EGRESS_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'HTML-EGRESS-01',
  title: 'JavaScript Network Egress in HTML Resource',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-llm02'],
  prose: {
    question: 'Does the script in the HTML stay off the network?',
    summary: 'Scan decoded HTML resources for a JavaScript network call — fetch, XMLHttpRequest, WebSocket, navigator.sendBeacon or an axios request method.',
    why: 'JavaScript network calls in HTML can exfiltrate data to attacker-controlled endpoints.',
    fix: 'Remove all fetch/XHR/WebSocket/beacon calls; route data through approved connectors only.',
    fixSteps: [
      'Remove the fetch/XMLHttpRequest/WebSocket/beacon call from the inline script.',
      'If network access is needed, route it through an approved Power Platform connector.',
      'Apply a Content Security Policy connect-src directive to restrict allowed origins.',
    ],
    passWhen: [
      'No scanned HTML resource calls fetch, WebSocket, navigator.sendBeacon or an axios get/post/put/delete/request method, and none names XMLHttpRequest.',
      'Whatever the page needs is already present in the bundle, so it opens without reaching an endpoint.',
    ],
    failWhen: [
      'An HTML resource makes a JavaScript network call.',
      'The call is graded critical when its endpoint is not a literal URL the scanner can read, or when it carries a body/data/json/payload or uses sendBeacon, post, put, patch or delete — all of which send data out rather than only reading it in. A plain read from a literal URL is graded medium.',
    ],
    notApplicableWhen: [NO_HTML_RESOURCE],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, HTML_EGRESS_01_OPTIONS);

export const HTML_STORE_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'medium', confidence: 'medium', population: HTML_RESOURCES,
});

export const HTML_STORE_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'HTML-STORE-01',
  title: 'Client-Side Storage Access in HTML Resource',
  pillar: 'safety-evidence',
  severity: 'medium',
  tags: ['security'],
  references: ['owasp-llm02'],
  prose: {
    question: 'Does the HTML keep state out of the browser rather than persisting it client-side?',
    summary: 'Scan decoded HTML resources for browser-side storage access through localStorage, sessionStorage, indexedDB or document.cookie.',
    why: 'Client-side storage access requires review when sensitive values are read or written; access alone does not establish a leak.',
    fix: 'Remove all client-side storage access; use server-side session management.',
    fixSteps: [
      'Remove the storage access call from the script.',
      'Use server-side session management instead of client-side storage.',
    ],
    passWhen: [
      'No scanned HTML resource reads or writes localStorage, sessionStorage, indexedDB or document.cookie.',
      'Any state the page keeps lives for the lifetime of the page only, so nothing persists in the browser after it closes.',
    ],
    failWhen: [
      'An HTML resource touches browser-side storage through localStorage, sessionStorage, indexedDB or document.cookie, putting data somewhere the tenant does not govern and any later script on the page can read.',
    ],
    notApplicableWhen: [NO_HTML_RESOURCE],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, HTML_STORE_01_OPTIONS);

export const HTML_SINK_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'high', confidence: 'high', population: HTML_RESOURCES,
});

export const HTML_SINK_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'HTML-SINK-01',
  title: 'Unsafe DOM Sink in HTML Resource',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['cwe-79', 'owasp-xss-prevention'],
  prose: {
    question: 'Does the script build the page through safe DOM APIs rather than by assigning markup into a sink?',
    summary: 'Scan decoded HTML resources for an innerHTML or outerHTML assignment, a document.write call, or dangerouslySetInnerHTML, and report the ones whose value is not provably inert.',
    why: 'Assigning to innerHTML/outerHTML/document.write/eval with user input causes DOM XSS.',
    fix: 'Replace unsafe DOM sinks with safe text-only alternatives (textContent, createElement).',
    fixSteps: [
      'Replace innerHTML/outerHTML assignments with textContent or safe DOM APIs.',
      'Replace document.write with safe DOM insertion methods.',
      'Apply DOMPurify or equivalent sanitization before inserting any HTML.',
    ],
    passWhen: [
      'No scanned HTML resource assigns to innerHTML or outerHTML, calls document.write, or uses dangerouslySetInnerHTML.',
      'Every such assignment takes a fixed literal — a quoted string, a number, true, false or null — which carries no injected markup.',
      'Every remaining assignment only copies another local DOM property (textContent, innerText, innerHTML, outerHTML) and mentions no user, input, query, param, location, message, response, fetch, storage, cookie, dataset or value source.',
    ],
    failWhen: [
      'An HTML resource assigns a computed value to innerHTML or outerHTML, calls document.write with a computed argument, or uses dangerouslySetInnerHTML — a sink that parses whatever reaches it as markup.',
    ],
    notApplicableWhen: [NO_HTML_RESOURCE],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, HTML_SINK_01_OPTIONS);

/**
 * Every HTML scanner rule declared here, in published order.
 *
 * The order mirrors `HTML_PATTERNS` in `resourceScanners.ts`, so a reader holding
 * the detector beside the declarations walks the two lists together.
 */
export const htmlScannerRuleEntries: readonly SkillScannerRuleEntry[] = Object.freeze([
  HTML_SCRIPT_01,
  HTML_HANDLER_01,
  HTML_JSCHEM_01,
  HTML_REMOTE_01,
  HTML_FORM_01,
  HTML_FRAME_01,
  HTML_EGRESS_01,
  HTML_STORE_01,
  HTML_SINK_01,
]);
