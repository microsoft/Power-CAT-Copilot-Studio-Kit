/**
 * Deterministic L0 injection & safety scan (research §5, OWASP LLM01/LLM06).
 * An uploaded SKILL.md is an indirect prompt-injection vector; this scan runs
 * BEFORE the AI judge and its critical/high hits hard-gate the L1 evaluation.
 */
import type { SkillSafetyFinding } from '../../contracts/SkillEvaluation.js';
import { normalizeForScan } from './normalize.js';

type Sev = 'critical' | 'high' | 'medium' | 'info';
export interface InjectionPattern { id: string; severity: Sev; category: string; regex: RegExp; note: string; }

/** Full Category I–VII catalog (research §5.1–§5.7). */
export const INJECTION_PATTERNS: InjectionPattern[] = [
  // I — Role / identity override
  { id: 'INJ-01', severity: 'critical', category: 'role-override', note: 'Attempts to discard the operating instructions',
    regex: /ignore\s+(all\s+)?(previous|prior|above|existing)\s+(instructions?|directives?|rules?|guidelines?|prompts?|context)/i },
  { id: 'INJ-02', severity: 'critical', category: 'role-override', note: 'Attempts to wipe prior context',
    regex: /(forget|disregard|reset|wipe|erase|clear)\s+(everything|all|your|previous|prior|above|instructions?|prompts?|guidelines?)/i },
  { id: 'INJ-03', severity: 'critical', category: 'role-override', note: 'Redefines the agent role',
    regex: /from\s+now\s+on\s+(you\s+(are|will|must|shall)|act\s+as|pretend\s+to\s+be|behave\s+as)/i },
  { id: 'INJ-04', severity: 'critical', category: 'role-override', note: 'Jailbreak persona assignment',
    regex: /you\s+are\s+now\s+(a|an|the|in\s+(developer|god|admin|jailbreak|DAN|unrestricted))/i },
  { id: 'INJ-05', severity: 'high', category: 'role-override', note: 'Requests privileged persona',
    regex: /act\s+as\s+(a|an)\s+(admin|root|developer|system|operator|superuser|god|unrestricted|uncensored)/i },
  { id: 'INJ-06', severity: 'high', category: 'role-override', note: 'Role-play override',
    regex: /pretend\s+(you\s+are|to\s+be)/i },
  { id: 'INJ-07', severity: 'critical', category: 'role-override', note: 'Named jailbreak mode',
    regex: /(developer|god|jailbreak|DAN|unrestricted|no[\s-]filter)\s+mode/i },
  { id: 'INJ-08', severity: 'critical', category: 'role-override', note: 'Claims to supply new system instructions',
    regex: /your\s+(new|updated|revised|actual|real)\s+(instructions?|system\s+prompt|directive|rules?|guidelines?)/i },

  // II — System / platform prompt override
  { id: 'SYS-01', severity: 'critical', category: 'system-override', note: 'Rewrites the system prompt',
    regex: /(override|replace|modify|change|update|rewrite)\s+(the\s+|your\s+)?(system\s+prompt|system\s+instructions?|agent\s+instructions?|base\s+prompt)/i },
  { id: 'SYS-02', severity: 'critical', category: 'system-override', note: 'Chat-template injection marker',
    regex: /(\[SYSTEM\s*:|<\|system\|>|<\|im_start\|>system|###\s*system\s*:)/i },
  { id: 'SYS-03', severity: 'critical', category: 'system-override', note: 'Claims precedence over prior instructions',
    regex: /this\s+(supersedes|overrides|takes\s+precedence\s+over|replaces)\s+(all|any|previous|prior|above|existing)\s+(instructions?|prompts?|rules?)/i },
  { id: 'SYS-04', severity: 'high', category: 'system-override', note: 'Mimics an operator override',
    regex: /^\s*IMPORTANT\s*(OVERRIDE|CORRECTION|UPDATE)\s*:/im },
  { id: 'SYS-05', severity: 'medium', category: 'authority-spoofing', note: 'Claims platform authorization',
    regex: /(authorized|granted|given)\s+(by\s+)?(Anthropic|Microsoft|OpenAI|the\s+developer|the\s+administrator|the\s+platform)\s+(to|for)/i },

  // III — Safety / policy bypass
  { id: 'SAF-01', severity: 'critical', category: 'safety-bypass', note: 'Disables safety controls',
    regex: /(disable|bypass|circumvent|remove|unlock|ignore|skip)\s+(safety|content|security|responsible\s+AI)\s+(guidelines?|policies?|restrictions?|filters?|measures?|protocols?|controls?)/i },
  { id: 'SAF-02', severity: 'critical', category: 'safety-bypass', note: 'Asserts absence of restrictions',
    regex: /(you\s+have\s+no|without\s+(any\s+)?|no)\s+(restrictions?|filters?|guidelines?|limitations?|guardrails?|constraints?)/i },
  { id: 'SAF-03', severity: 'critical', category: 'safety-bypass', note: 'Suppresses refusal behavior',
    regex: /(do\s+not|never|must\s+not)\s+(refuse|decline|reject|deny)\s+(any|all|this|these|requests?|queries?|prompts?)/i },
  { id: 'SAF-04', severity: 'high', category: 'safety-bypass', note: 'Requests uncensored mode',
    regex: /(uncensored|unfiltered|unrestricted|unmoderated)\s+(version|mode|response|AI|assistant|agent)/i },
  { id: 'SAF-05', severity: 'critical', category: 'safety-bypass', note: 'Forces unconditional compliance',
    regex: /(never\s+refuse|always\s+comply|comply\s+with\s+all|answer\s+all\s+questions\s+without)/i },

  // IV — Exfiltration
  { id: 'EXF-01', severity: 'critical', category: 'exfiltration', note: 'Sends data to an external endpoint',
    regex: /send\s+(the\s+|all\s+|this\s+|confidential\s+|private\s+)?(data|information|content|messages?|history|context|conversation)\s+to\s+(http|https|ftp)/i },
  { id: 'EXF-02', severity: 'critical', category: 'exfiltration', note: 'Forwards content to an email address',
    regex: /(forward|transmit|relay|email)\s+.{0,80}(to\s+|at\s+|via\s+).{0,40}@/i },
  { id: 'EXF-03', severity: 'critical', category: 'exfiltration', note: 'URL in skill body (possible beacon)',
    regex: /https?:\/\/[^\s)]+/i },
  { id: 'EXF-04', severity: 'critical', category: 'exfiltration', note: 'Markdown image beacon',
    regex: /!\[.*?\]\(https?:\/\/[^)]+\)/i },
  { id: 'EXF-05', severity: 'high', category: 'exfiltration', note: 'Encodes data into a URL/param',
    regex: /(include|append|embed|encode)\s+.{0,60}\s+(in\s+the?\s+|as\s+(a\s+)?)?(url|link|request|query\s+param)/i },
  { id: 'EXF-06', severity: 'high', category: 'exfiltration', note: 'Requests disclosure of the system prompt',
    regex: /(reveal|display|show|print|output|expose|echo)\s+(the\s+|your\s+)?(system\s+prompt|hidden\s+instructions?|confidential\s+parameters|agent\s+instructions?)/i },
  { id: 'EXF-07', severity: 'high', category: 'exfiltration', note: 'Posts to a webhook/endpoint',
    regex: /(webhook|POST\s+to|send\s+a\s+request\s+to|call\s+the\s+endpoint)\s+https?:\/\//i },

  // V — Hidden / obfuscated (HID-01/02 handled in normalize; HID-03/04/08 here)
  { id: 'HID-03', severity: 'critical', category: 'hidden-obfuscated', note: 'HTML comment — invisible when rendered, parsed as text',
    regex: /<!--[\s\S]*?-->/ },
  { id: 'HID-04', severity: 'high', category: 'hidden-obfuscated', note: 'Base64 blob — decoded and rescanned',
    regex: /[A-Za-z0-9+/]{60,}={0,2}/ },
  { id: 'HID-08', severity: 'critical', category: 'hidden-obfuscated', note: 'Adversarial suffix (long non-word run)',
    regex: /[^\w\s]{30,}/ },

  // VI — Excessive agency (OWASP LLM06)
  { id: 'AGN-01', severity: 'high', category: 'excessive-agency', note: 'Claims elevated privileges',
    regex: /(you\s+have|you\s+(are\s+)?granted|you\s+(are\s+)?authorized)\s+(admin|root|elevated|full|unrestricted|system)\s+(access|permissions?|privileges?)/i },
  { id: 'AGN-02', severity: 'high', category: 'excessive-agency', note: 'Destructive data directive',
    regex: /(delete|drop|truncate|destroy|wipe)\s+(all|the\s+|database|records?|files?|data)/i },
  { id: 'AGN-03', severity: 'high', category: 'excessive-agency', note: 'Runs shell/terminal commands',
    regex: /(run|execute|invoke|call)\s+(shell|bash|cmd|powershell|terminal)\s+(command|script)/i },
  { id: 'AGN-04', severity: 'medium', category: 'excessive-agency', note: 'Skips user approval',
    regex: /(do\s+not|skip|bypass|without)\s+(ask|request|require|wait\s+for)\s+(user|human|admin)\s+(approval|confirmation|review|consent)/i },
  { id: 'AGN-05', severity: 'medium', category: 'excessive-agency', note: 'Grants unrestricted tool use',
    regex: /(run\s+any|execute\s+any|call\s+any)\s+(command|function|tool|API)/i },

  // VII — Trust escalation / authority spoofing
  { id: 'TRU-01', severity: 'critical', category: 'authority-spoofing', note: 'Spoofs vendor/developer authorship',
    regex: /this\s+(skill|instruction|message)\s+(is|was|has\s+been)\s+(sent|written|created|approved)\s+by\s+(Anthropic|Microsoft|OpenAI|the\s+developer|the\s+platform\s+team)/i },
  { id: 'TRU-02', severity: 'high', category: 'authority-spoofing', note: 'Claims trusted/official status',
    regex: /this\s+is\s+(a\s+)?(trusted|verified|official|authorized)\s+(source|instruction|directive)/i },
  { id: 'TRU-03', severity: 'high', category: 'authority-spoofing', note: 'Demands blind trust of user input',
    regex: /(trust|believe|accept)\s+(all|any|every)\s+(user\s+(input|request|instruction|message)|input\s+from\s+the\s+user)/i },
  { id: 'TRU-04', severity: 'medium', category: 'authority-spoofing', note: 'Passes instructions to the orchestrator',
    regex: /(tell|instruct|pass\s+(these\s+instructions?\s+to|along\s+to))\s+(the\s+)?(orchestrator|controller|parent\s+agent|other\s+agents?)/i },
];

const OBSERVED_PLATFORM_OVERLAP_IDS = new Set([
  'INJ-01', 'INJ-02', 'INJ-03', 'INJ-04', 'INJ-05', 'INJ-06', 'INJ-07', 'INJ-08',
  'SYS-01', 'SYS-02', 'SYS-03', 'SYS-04',
  'EXF-01', 'EXF-03', 'EXF-04', 'EXF-06', 'EXF-07',
  'AGN-03', 'AGN-04',
]);

const referenceFor = (category: string): string =>
  category === 'excessive-agency' ? 'owasp-llm06' : 'owasp-llm01';

function classifyFinding(id: string, severity: Sev): Pick<
  SkillSafetyFinding,
  'safetyDisposition' | 'platformOverlap' | 'skipAiEvaluation'
> {
  const overlapObserved = OBSERVED_PLATFORM_OVERLAP_IDS.has(id);
  const skipAiEvaluation = severity === 'critical' || severity === 'high';
  return {
    safetyDisposition: overlapObserved || !skipAiEvaluation ? 'advisory' : 'blocking',
    platformOverlap: overlapObserved ? 'observed' : 'unverified',
    skipAiEvaluation,
  };
}

const BIC_SOURCE_MARKER_RE =
  /<!--\s*bic:source=(?:upload|blank)\s*-->/gi;

/** Scan text for injection/safety red flags, including a base64-decode second pass. */
export function scanText(text: string, target: string): SkillSafetyFinding[] {
  const findings: SkillSafetyFinding[] = [];
  const seen = new Set<string>();
  const { normalized, hiddenFindings } = normalizeForScan(
    text.replace(BIC_SOURCE_MARKER_RE, ''),
  );

  for (const h of hiddenFindings) {
    const key = `${h.id}:${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      id: h.id, target, category: h.category, severity: h.severity,
      evidence: h.evidence, rationale: 'Hidden characters can smuggle instructions past human review.',
      recommendation: 'Remove the hidden characters before publish.', reference: 'owasp-llm01',
      ...classifyFinding(h.id, h.severity),
    });
  }

  const scanOne = (t: string, provenance: string) => {
    for (const p of INJECTION_PATTERNS) {
      const m = p.regex.exec(t);
      if (!m) continue;
      const key = `${p.id}:${provenance}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        id: p.id, target: provenance, category: p.category, severity: p.severity,
        evidence: m[0].slice(0, 160), rationale: p.note,
        recommendation: 'Review and remove or justify this directive before publish.',
        reference: referenceFor(p.category),
        ...classifyFinding(p.id, p.severity),
      });
    }
  };

  scanOne(normalized, target);

  for (const blob of normalized.match(/[A-Za-z0-9+/]{60,}={0,2}/g) ?? []) {
    try {
      const decoded = atob(blob);
      if (/[ -~]/.test(decoded)) scanOne(decoded, `${target} (base64-decoded)`);
    } catch { /* not valid base64 */ }
  }

  return findings;
}
