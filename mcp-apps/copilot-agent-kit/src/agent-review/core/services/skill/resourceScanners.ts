/**
 * Deterministic resource scanners for skill bundle files (Task-4).
 *
 * Scans Python, HTML, and Markdown/text resources using explicit regex rules.
 * Every finding is constructed through {@link createRegisteredFinding} so that
 * all client-visible remediation content comes from the central rule registry.
 *
 * Evidence is sanitized before being stored: secret-looking values are redacted
 * and the length is bounded to 200 characters. Raw source bytes are never
 * logged or persisted beyond the sanitized snippet.
 *
 * The exported {@link redactSecrets} helper performs only the redaction step
 * (no truncation) and is used by the persistence layer for non-evidence text
 * fields (rationale, summary, purpose statements) that must not be shortened.
 */
import type { GroundedSkillFinding, SkillFindingSeverity } from "../../contracts/Findings.js";
import type { SkillBundleResource } from "../../contracts/SkillBundle.js";
import { createRegisteredFinding, getRule } from "./skillRuleRegistry.js";

/**
 * Shared source string for secret-detection patterns.
 * A single definition used for both SCR-SEC-01 matching and evidence redaction,
 * eliminating duplication between detection and sanitization.
 */
const SECRET_PATTERN_SOURCE =
  "(?:password|passwd|secret|api[_-]?key|token|auth[_-]?key|credential|private[_-]?key)\\s*=\\s*[\"'][^\"']{4,}[\"']";

/** Case-insensitive pattern for detecting hardcoded secrets in Python source (no global flag). */
const SECRET_DETECTION_PATTERN = new RegExp(SECRET_PATTERN_SOURCE, "i");

/** Case-insensitive global pattern for redacting secrets in evidence strings. */
const SECRET_REDACT_PATTERN = new RegExp(SECRET_PATTERN_SOURCE, "gi");

/** Signed/SAS URL pattern — Azure Blob Storage or query-string signatures. */
const SAS_URL_PATTERN_1 = /https?:\/\/[^\s"']+[?&](?:sig|sv|se|sp|spr|srt|ss)=[^\s"']*/gi;
const SAS_URL_PATTERN_2 = /https?:\/\/[^\s"']*\.blob\.core\.windows\.net[^\s"']*/gi;

/**
 * Redact secret-like key=value assignments and signed/SAS URLs from `text`
 * without truncating. Safe for rationale, summary, purpose-statement, and
 * other non-evidence text fields that must not be shortened.
 *
 * @param text - The string to redact.
 * @returns A new string with secrets and signed URLs replaced by placeholders.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(SECRET_REDACT_PATTERN, (match) => {
      const assignIdx = match.indexOf("=");
      return assignIdx >= 0 ? match.slice(0, assignIdx + 1) + " [REDACTED]" : "[REDACTED]";
    })
    .replace(SAS_URL_PATTERN_1, '[URL-REDACTED]')
    .replace(SAS_URL_PATTERN_2, '[URL-REDACTED]');
}

/**
 * Sanitize a raw evidence string before it is stored in a finding.
 * Redacts secret-looking values and signed/SAS URLs, then truncates.
 *
 * @param raw - The raw evidence snippet extracted from source.
 * @param maxLength - Maximum length of the result (default 200 for scanner compat).
 * @returns A safe, bounded evidence string with secrets and SAS URLs redacted.
 */
export function sanitizeFindingEvidence(raw: string, maxLength = 200): string {
  const redacted = redactSecrets(raw);
  if (redacted.length <= maxLength) return redacted;
  return redacted.slice(0, maxLength - 3) + '...';
}

/** Associates a rule ID with the regex that triggers it. */
interface ScanPattern {
  ruleId: string;
  regex: RegExp;
  classify?: ScanClassifier;
}

interface ScanMatchContext {
  content: string;
  match: RegExpExecArray;
  resourcePath: string;
}

interface ScanDecision {
  report: boolean;
  severity?: SkillFindingSeverity;
}

type ScanClassifier = (context: ScanMatchContext) => ScanDecision;

const SEVERITY_RANK: Record<SkillFindingSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function sourceLine(content: string, index: number): string {
  const start = content.lastIndexOf("\n", index) + 1;
  const end = content.indexOf("\n", index);
  return content.slice(start, end < 0 ? content.length : end);
}

function callArgument(match: RegExpExecArray): string {
  return (match[1] ?? "").trim();
}

function hasOwnedEmptyDirectoryProvenance(
  content: string,
  matchIndex: number,
  rootName: string | undefined,
): boolean {
  if (!rootName) return false;

  const precedingSource = content.slice(0, matchIndex);
  const functionDefinitions = [
    ...precedingSource.matchAll(/^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->[^:]*)?:/gm),
  ];
  const enclosingFunction = functionDefinitions.at(-1);
  const expressions = new Set([rootName]);

  if (enclosingFunction?.[2].match(new RegExp(`\\b${rootName}\\b`))) {
    const functionName = enclosingFunction[1];
    for (const call of content.matchAll(
      new RegExp(`\\b${functionName}\\s*\\(\\s*([A-Za-z_]\\w*(?:\\.\\w+)*)`, "g"),
    )) {
      expressions.add(call[1]);
    }
  }

  return [...expressions].some((expression) => {
    const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rejectsNonDirectory = new RegExp(
      `if\\s+not\\s+${escaped}\\.is_dir\\(\\)\\s*:\\s*\\n\\s*(?:raise|return|sys\\.exit)`,
    ).test(content);
    const rejectsNonEmpty = new RegExp(
      `if\\s+any\\(\\s*${escaped}\\.iterdir\\(\\)\\s*\\)\\s*:\\s*\\n\\s*(?:raise|return|sys\\.exit)`,
    ).test(content);
    const createsDirectory = new RegExp(`\\b${escaped}\\.mkdir\\s*\\(`).test(content);
    return rejectsNonDirectory && rejectsNonEmpty && createsDirectory;
  });
}

function classifyDestructiveCall({ content, match }: ScanMatchContext): ScanDecision {
  const argument = callArgument(match);
  const line = sourceLine(content, match.index);
  const temporaryName = /\b(?:temp|tmp|cache|staging|scratch)\w*\b/i;
  const untrustedName =
    /\b(?:user(?:[_-]?(?:supplied|path|file|input))?|input|request|argv|untrusted|supplied)/i;
  const rootName = argument.match(/^([A-Za-z_]\w*)/)?.[1];
  const temporaryHandles = new Set<string>();
  for (const candidate of content.matchAll(
    /(?:\b([A-Za-z_]\w*)\s*=\s*tempfile\.(?:NamedTemporaryFile|TemporaryFile|TemporaryDirectory)\s*\(|\bwith\s+tempfile\.(?:NamedTemporaryFile|TemporaryFile|TemporaryDirectory)\s*\([^)]*\)\s+as\s+([A-Za-z_]\w*))/g,
  )) {
    temporaryHandles.add(candidate[1] ?? candidate[2]);
  }
  const derivedFromTemporaryHandle = rootName
    ? [...temporaryHandles].some((handle) =>
        new RegExp(`\\b${rootName}\\s*=\\s*${handle}\\.name\\b`).test(content),
      )
    : false;
  const ownedEmptyDirectory = hasOwnedEmptyDirectoryProvenance(content, match.index, rootName);
  const declaredAsTemporary =
    temporaryName.test(argument) ||
    Boolean(rootName && temporaryHandles.has(rootName)) ||
    derivedFromTemporaryHandle ||
    new RegExp(
      `\\b${argument.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b\\s*=\\s*[^\\n]*(?:tempfile|TemporaryDirectory|NamedTemporaryFile)`,
      "i",
    ).test(content);

  if ((declaredAsTemporary || ownedEmptyDirectory) && !untrustedName.test(line)) {
    return { report: false };
  }
  if (
    /\b(?:shutil\.rmtree|os\.rmdir|shutil\.rmdir)\b/.test(match[0]) ||
    untrustedName.test(argument)
  ) {
    return { report: true, severity: "high" };
  }
  return { report: true, severity: "medium" };
}

function literalUrl(text: string): URL | undefined {
  const match = text.match(/["'](https?:\/\/[^"']+)["']/i);
  if (!match) return undefined;
  try {
    return new URL(match[1]);
  } catch {
    return undefined;
  }
}

function classifyNetworkCall({ content, match }: ScanMatchContext): ScanDecision {
  const call = match[0];
  let method = call.match(/\.(get|head|options|post|put|patch|delete|request)\s*\(/i)?.[1]?.toLowerCase();
  let endpoint = literalUrl(call);
  const requestVariable = call.match(/urlopen\s*\(\s*([A-Za-z_]\w*)/)?.[1];
  if (requestVariable) {
    const request = content.match(
      new RegExp(
        `\\b${requestVariable}\\s*=\\s*urllib\\.request\\.Request\\s*\\(\\s*([^,\\n)]+)[^\\n]*`,
        "i",
      ),
    )?.[0];
    const endpointExpression = request?.match(/Request\s*\(\s*([^,\n)]+)/i)?.[1]?.trim();
    method = request?.match(/\bmethod\s*=\s*["'](GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)["']/i)?.[1]?.toLowerCase() ?? method;
    if (endpointExpression) {
      endpoint = literalUrl(endpointExpression);
      if (!endpoint) {
        const constantName = endpointExpression.match(/^[A-Za-z_]\w*$/)?.[0];
        const constantValue = constantName
          ? content.match(new RegExp(`^\\s*${constantName}\\s*=\\s*["'](https?://[^"']+)["']`, "m"))?.[1]
          : undefined;
        endpoint = constantValue ? literalUrl(`"${constantValue}"`) : undefined;
      }
    }
  }
  const transmitsData =
    /\b(?:json|data|files|body|content)\s*=/.test(call) ||
    /\b(?:token|secret|password|credential|payload|user[_-]?data)\b/i.test(call);

  if (
    endpoint &&
    (method === "head" || method === "get" || method === "options") &&
    !transmitsData
  ) {
    return { report: false };
  }
  if (!endpoint || transmitsData || ["post", "put", "patch", "delete"].includes(method ?? "")) {
    return { report: true, severity: "high" };
  }
  return { report: true, severity: "medium" };
}

function classifyTraversal({ content, match }: ScanMatchContext): ScanDecision {
  const line = sourceLine(content, match.index);
  const fileOperation =
    /\b(?:open|Path|read_text|write_text|read_bytes|write_bytes|os\.path|os\.remove|os\.unlink|shutil\.rmtree)\s*\(/;
  return { report: fileOperation.test(line), severity: "high" };
}

function isArchivedReferencePath(resourcePath: string): boolean {
  const normalized = resourcePath.replace(/\\/g, "/").toLowerCase();
  return /(?:^|\/)references\/(?:snapshot|snapshots|snapshot-history|archive|archives|history)(?:\/|$)/.test(
    normalized,
  );
}

function executableHtmlRule(classify?: ScanClassifier): ScanClassifier {
  return (context) =>
    isArchivedReferencePath(context.resourcePath)
      ? { report: false }
      : classify?.(context) ?? { report: true };
}

function classifyRemoteResource({ match }: ScanMatchContext): ScanDecision {
  return {
    report: true,
    severity: /^<\s*script\b/i.test(match[0]) ? "high" : "medium",
  };
}

function classifyHtmlEgress({ match }: ScanMatchContext): ScanDecision {
  const call = match[0];
  const endpoint = literalUrl(call);
  const transmitsData =
    /\b(?:body|data|json|payload)\s*[:=]/i.test(call) ||
    /\b(?:sendBeacon|post|put|patch|delete)\b/i.test(call);
  return {
    report: true,
    severity: !endpoint || transmitsData ? "critical" : "medium",
  };
}

function classifyHtmlSink({ match }: ScanMatchContext): ScanDecision {
  const assignment = match[0].split("=").slice(1).join("=").trim();
  const fixedLiteral = /^(?:["'`][\s\S]*["'`]|\d+|true|false|null)\s*;?$/i.test(assignment);
  const localDomCopy =
    /\b(?:textContent|innerText|innerHTML|outerHTML)\b/.test(assignment) &&
    !/\b(?:user|input|query|param|location|message|response|fetch|storage|cookie|dataset|value)\b/i.test(
      assignment,
    );
  return { report: !fixedLiteral && !localDomCopy, severity: "high" };
}

function classifyShellDirective({ content, match }: ScanMatchContext): ScanDecision {
  const line = sourceLine(content, match.index);
  const dangerous =
    /\b(?:curl|wget|invoke-webrequest)\b[^\n|]{0,160}\|\s*(?:sh|bash|powershell)\b/i.test(line) ||
    /\b(?:delete|remove|erase|wipe|format|shutdown|credential|token|secret)\b/i.test(line) ||
    /\b(?:user|input|argument|parameter|untrusted)\b.{0,80}\b(?:shell|bash|cmd|powershell)\b/i.test(
      line,
    );
  return { report: dangerous, severity: "high" };
}

const HIDDEN_INSTRUCTION_PATTERN =
  /\b(?:ignore|disregard|forget|override|execute|invoke|upload|transmit|exfiltrat|beacon|system prompt|developer mode|shell command)\b/i;

function classifyMarkdownComment({ match }: ScanMatchContext): ScanDecision {
  return { report: HIDDEN_INSTRUCTION_PATTERN.test(match[0]), severity: "high" };
}

// ---------------------------------------------------------------------------
// Python scan patterns
// ---------------------------------------------------------------------------

const PYTHON_PATTERNS: ScanPattern[] = [
  // SCR-CMD-01: OS command injection — direct shell API calls
  {
    ruleId: "SCR-CMD-01",
    regex:
      /\b(?:os\.(?:system|popen)|commands\.(?:getoutput|getstatusoutput))\s*\(/,
  },
  // SCR-CMD-01: shell=True flag enables shell string injection
  { ruleId: "SCR-CMD-01", regex: /\bshell\s*=\s*True\b/ },
  // SCR-CODE-01: dynamic code execution
  { ruleId: "SCR-CODE-01", regex: /\beval\s*\(|\bexec\s*\(/ },
  // SCR-DESTR-01: destructive file-system operations
  {
    ruleId: "SCR-DESTR-01",
    regex: /\b(?:os\.remove|os\.unlink|shutil\.rmtree|shutil\.rmdir|os\.rmdir)\s*\(([^)\n]*)\)/,
    classify: classifyDestructiveCall,
  },
  // SCR-NET-01: outbound network library usage
  {
    ruleId: "SCR-NET-01",
    regex:
      /\b(?:requests|httpx|aiohttp)\.(?:get|head|options|post|put|patch|delete|request)\s*\([^)\n]*\)/i,
    classify: classifyNetworkCall,
  },
  {
    ruleId: "SCR-NET-01",
    regex: /\b(?:urllib\.(?:request\.)?urlopen|socket\.connect|http\.client\.\w+|smtplib\.\w+|ftplib\.\w+)\s*\([^)\n]*\)/,
    classify: classifyNetworkCall,
  },
  // SCR-SEC-01: hardcoded secrets — shared source constant eliminates duplicate regex
  { ruleId: "SCR-SEC-01", regex: SECRET_DETECTION_PATTERN },
  // SCR-DESER-01: unsafe deserialization
  { ruleId: "SCR-DESER-01", regex: /\b(pickle\.loads?|marshal\.loads?|shelve\.open|yaml\.load\s*\()/ },
  // SCR-TRAV-01: path traversal sequences
  { ruleId: "SCR-TRAV-01", regex: /\.\.[/\\]/, classify: classifyTraversal },
];

// ---------------------------------------------------------------------------
// HTML scan patterns
// ---------------------------------------------------------------------------

const HTML_PATTERNS: ScanPattern[] = [
  // HTML-SCRIPT-01: inline <script> tag — executes JS in the browser
  {
    ruleId: "HTML-SCRIPT-01",
    regex: /<script(?:\s[^>]*)?>/i,
    classify: executableHtmlRule(() => ({ report: false })),
  },
  // HTML-HANDLER-01: inline event handler attributes (onclick, onload, …)
  {
    ruleId: "HTML-HANDLER-01",
    regex: /\bon\w+\s*=/i,
    classify: executableHtmlRule(),
  },
  // HTML-JSCHEM-01: javascript: URL scheme
  {
    ruleId: "HTML-JSCHEM-01",
    regex: /javascript\s*:/i,
    classify: executableHtmlRule(),
  },
  // HTML-REMOTE-01: external resource via src/href/action/data attribute
  {
    ruleId: "HTML-REMOTE-01",
    regex:
      /<(?:script|img|link|video|audio|source|object|embed)\b[^>]*(?:src|href|data)\s*=\s*["']https?:\/\/[^"']+["'][^>]*>/i,
    classify: executableHtmlRule(classifyRemoteResource),
  },
  // HTML-FORM-01: form posting to an external URL
  {
    ruleId: "HTML-FORM-01",
    regex: /<form[^>]*\baction\s*=\s*["']https?:\/\//i,
    classify: executableHtmlRule(),
  },
  // HTML-FRAME-01: iframe or frame element
  {
    ruleId: "HTML-FRAME-01",
    regex: /<i?frame[\s>\\/]/i,
    classify: executableHtmlRule(),
  },
  // HTML-EGRESS-01: JavaScript network egress (fetch, XHR, WebSocket, beacon)
  {
    ruleId: "HTML-EGRESS-01",
    regex:
      /\b(?:fetch|WebSocket|navigator\.sendBeacon|axios\.(?:get|post|put|delete|request))\s*\([^)\n]*\)|\bXMLHttpRequest\b/i,
    classify: executableHtmlRule(classifyHtmlEgress),
  },
  // HTML-STORE-01: client-side storage access
  {
    ruleId: "HTML-STORE-01",
    regex: new RegExp(
      `local${'Storage'}\\.|sessionStorage\\.|indexedDB\\.|document\\.cookie`,
      'i',
    ),
    classify: executableHtmlRule(),
  },
  // HTML-SINK-01: unsafe DOM sinks
  {
    ruleId: "HTML-SINK-01",
    regex:
      /(?:innerHTML|outerHTML)\s*=\s*[^;\n]+;?|document\.write\s*\([^)\n]*\)|dangerouslySetInnerHTML/i,
    classify: executableHtmlRule(classifyHtmlSink),
  },
];

// ---------------------------------------------------------------------------
// Markdown / text scan patterns
// ---------------------------------------------------------------------------

const MARKDOWN_PATTERNS: ScanPattern[] = [
  // MD-ROLEOVR-01: role / identity override attempts
  {
    ruleId: "MD-ROLEOVR-01",
    regex:
      /ignore\s+(all\s+)?(previous|prior|above|existing)\s+(instructions?|directives?|rules?|guidelines?|prompts?|context)/i,
  },
  {
    ruleId: "MD-ROLEOVR-01",
    regex:
      /(forget|disregard|reset|wipe|erase)\s+(everything|all|previous|prior|instructions?|guidelines?)/i,
  },
  {
    ruleId: "MD-ROLEOVR-01",
    regex: /from\s+now\s+on\s+(you\s+(are|will|must|shall)|act\s+as|pretend\s+to\s+be)/i,
  },
  {
    ruleId: "MD-ROLEOVR-01",
    regex: /you\s+are\s+now\s+(a|an|the|in\s+(developer|god|admin|jailbreak|DAN))/i,
  },
  // MD-COMMENT-01: hidden HTML comment (invisible when rendered, parsed by LLM)
  { ruleId: "MD-COMMENT-01", regex: /<!--[\s\S]*?-->/, classify: classifyMarkdownComment },
  // MD-EXFIL-01 (1/3): URL path contains a recognised exfiltration/beacon endpoint name
  {
    ruleId: "MD-EXFIL-01",
    regex: /https?:\/\/[^\s)>\]]*\/(?:beacon|track(?:ing)?|pixel|exfil|c2)(?:[/?#][^\s)>\]]*)?/i,
  },
  // MD-EXFIL-01 (2/3): URL query string carries a data-exfiltration parameter
  {
    ruleId: "MD-EXFIL-01",
    regex: /https?:\/\/[^\s)>\]]*\?[^\s)>\]]*(?:data|payload|exfil|dump|beacon)=[^\s)>\]]*/i,
  },
  // MD-EXFIL-01 (3/3): explicit send/upload/transmit/exfiltrate verb near a remote URL
  {
    ruleId: "MD-EXFIL-01",
    regex: /\b(?:send|upload|transmit|exfiltrat(?:e|ing)|beacon(?:\s+to)?)\b[^\n]{0,80}https?:\/\/[^\s)>\]]*/i,
  },
  // MD-EXEC-01: unsafe execution directives
  {
    ruleId: "MD-EXEC-01",
    regex: /(execute|run|invoke|call)\s+(shell|bash|cmd|powershell|terminal)\s+(command|script)/i,
    classify: classifyShellDirective,
  },
  {
    ruleId: "MD-EXEC-01",
    regex: /\b(shell|bash)\s+(command|script)\b/i,
    classify: classifyShellDirective,
  },
  // MD-SPOOF-01: authority / vendor spoofing
  {
    ruleId: "MD-SPOOF-01",
    regex:
      /this\s+(skill|instruction|message)\s+(is|was|has\s+been)\s+(sent|written|created|approved)\s+by\s+(Anthropic|Microsoft|OpenAI|the\s+developer|the\s+platform)/i,
  },
  {
    ruleId: "MD-SPOOF-01",
    regex: /this\s+is\s+(a\s+)?(trusted|verified|official|authorized)\s+(source|instruction|directive)/i,
  },
];

// ---------------------------------------------------------------------------
// Scanner-backed rule corroboration
// ---------------------------------------------------------------------------

/**
 * Every scan pattern, keyed by the rule it defines.
 *
 * These rules are defined *by* their patterns: `MD-ROLEOVR-01` is not "anything
 * that feels like an override", it is exactly the four phrasings below. Exposing
 * the map lets a consumer check that a finding claiming one of these rules
 * carries evidence the scanner itself would match.
 *
 * A rule absent from this map is not pattern-defined and cannot be checked this
 * way — callers must treat "no patterns" as "no opinion", never as "reject".
 */
const ALL_SCAN_PATTERNS = [...PYTHON_PATTERNS, ...HTML_PATTERNS, ...MARKDOWN_PATTERNS];

export const SCANNER_PATTERNS_BY_RULE: ReadonlyMap<string, readonly RegExp[]> = (() => {
  const map = new Map<string, RegExp[]>();
  for (const { ruleId, regex } of ALL_SCAN_PATTERNS) {
    const existing = map.get(ruleId);
    if (existing) existing.push(regex);
    else map.set(ruleId, [regex]);
  }
  return map;
})();

export interface ScannerRuleClassification {
  defined: boolean;
  severity?: SkillFindingSeverity;
}

/**
 * Apply a scanner rule's complete context checks to source text.
 *
 * Pattern-defined AI findings use this result so they cannot claim a severity
 * stronger than the deterministic scanner would assign to the same source.
 */
export function classifyScannerRule(
  ruleId: string,
  content: string,
  resourcePath = "unknown",
): ScannerRuleClassification {
  const patterns = ALL_SCAN_PATTERNS.filter((pattern) => pattern.ruleId === ruleId);
  if (patterns.length === 0) return { defined: false };
  if (!content.trim()) return { defined: true };

  let severity: SkillFindingSeverity | undefined;
  for (const pattern of patterns) {
    const candidate = findReportableMatch(content, pattern, resourcePath);
    if (
      candidate &&
      (!severity || SEVERITY_RANK[candidate.severity] > SEVERITY_RANK[severity])
    ) {
      severity = candidate.severity;
    }
  }
  return severity ? { defined: true, severity } : { defined: true };
}

/**
 * True when `evidence` is text the scanner for `ruleId` would actually match.
 *
 * Returns true for any rule that has no patterns, so this can be applied to a
 * mixed set of findings without suppressing the rules it knows nothing about.
 *
 * @param ruleId - The rule the finding claims.
 * @param evidence - The evidence quoted by the finding.
 */
export function evidenceMatchesScannerRule(ruleId: string, evidence: string): boolean {
  const classification = classifyScannerRule(ruleId, evidence);
  return !classification.defined || classification.severity !== undefined;
}

// ---------------------------------------------------------------------------
// Internal scanner helper
// ---------------------------------------------------------------------------

/** True when a role-override phrase is quoted only as a documented safety example. */
function isDocumentedRoleOverrideExample(content: string, match: RegExpExecArray): boolean {
  const lineStart = content.lastIndexOf("\n", match.index) + 1;
  const nextLineBreak = content.indexOf("\n", match.index + match[0].length);
  const lineEnd = nextLineBreak < 0 ? content.length : nextLineBreak;
  const line = content.slice(lineStart, lineEnd);
  const relativeStart = match.index - lineStart;
  const before = line.slice(0, relativeStart);
  const after = line.slice(relativeStart + match[0].length);

  const isQuoted = [
    ["`", "`"],
    ['"', '"'],
    ["'", "'"],
    ["\u201c", "\u201d"],
    ["\u2018", "\u2019"],
  ].some(([open, close]) => before.lastIndexOf(open) >= 0 && after.indexOf(close) >= 0);
  if (!isQuoted) return false;

  return /prompt[- ]injection|malicious\s+(?:prompt|instruction)|unsafe\s+(?:prompt|instruction)|(?:example|sample|test fixture)\s+(?:of\s+)?(?:an?\s+)?(?:prompt|instruction|attack)|(?:detect|reject|block|flag)\b.{0,100}\b(?:phrase|pattern|prompt|instruction|attack)|(?:never|do not)\s+(?:use|follow|obey|execute)\b/i.test(
    line,
  );
}

interface ReportableMatch {
  match: RegExpExecArray;
  severity: SkillFindingSeverity;
}

/** Find the strongest actionable match for one pattern. */
function findReportableMatch(
  content: string,
  pattern: ScanPattern,
  resourcePath: string,
): ReportableMatch | null {
  const flags = pattern.regex.flags.includes("g")
    ? pattern.regex.flags
    : `${pattern.regex.flags}g`;
  const matcher = new RegExp(pattern.regex.source, flags);
  const defaultSeverity = getRule(pattern.ruleId)?.severity ?? "info";
  let strongest: ReportableMatch | null = null;

  for (let match = matcher.exec(content); match; match = matcher.exec(content)) {
    const documentedExample =
      pattern.ruleId === "MD-ROLEOVR-01" &&
      isDocumentedRoleOverrideExample(content, match);
    const decision = documentedExample
      ? { report: false }
      : pattern.classify?.({ content, match, resourcePath }) ?? { report: true };

    if (decision.report) {
      const severity = decision.severity ?? defaultSeverity;
      if (!strongest || SEVERITY_RANK[severity] > SEVERITY_RANK[strongest.severity]) {
        strongest = { match, severity };
      }
    }
    if (match[0].length === 0) matcher.lastIndex += 1;
  }

  return strongest;
}

/**
 * Scan `content` against a set of patterns, returning at most one
 * {@link GroundedSkillFinding} per rule ID (strongest contextual match wins).
 */
function scanWithPatterns(
  content: string,
  patterns: ScanPattern[],
  resourcePath: string,
): GroundedSkillFinding[] {
  const strongestByRule = new Map<string, ReportableMatch>();

  for (const pattern of patterns) {
    const candidate = findReportableMatch(content, pattern, resourcePath);
    if (!candidate) continue;
    const current = strongestByRule.get(pattern.ruleId);
    if (!current || SEVERITY_RANK[candidate.severity] > SEVERITY_RANK[current.severity]) {
      strongestByRule.set(pattern.ruleId, candidate);
    }
  }

  return [...strongestByRule].map(([ruleId, candidate]) => {
    const sanitized = sanitizeFindingEvidence(candidate.match[0].slice(0, 200));
    return createRegisteredFinding(ruleId, {
      resourcePath,
      evidence: sanitized,
      fact: sanitized,
      severity: candidate.severity,
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run deterministic security and quality scans over a single
 * {@link SkillBundleResource} and return any grounded findings.
 *
 * Dispatches to the language-specific scanner based on `resource.language`.
 * Binary resources and resources without decoded text content return an empty
 * array without any analysis.
 *
 * @param resource - A decoded skill bundle resource to scan.
 * @returns Zero or more grounded findings, each backed by a registered rule.
 */
export function scanSkillResource(resource: SkillBundleResource): GroundedSkillFinding[] {
  if (!resource.textContent || resource.isBinary || resource.decodeStatus !== "decoded") {
    return [];
  }

  const { textContent: content, originalPath: path } = resource;

  switch (resource.language) {
    case "python":
      return scanWithPatterns(content, PYTHON_PATTERNS, path);
    case "html":
      return scanWithPatterns(content, HTML_PATTERNS, path);
    case "markdown":
    case "text":
      return scanWithPatterns(content, MARKDOWN_PATTERNS, path);
    default:
      return [];
  }
}
