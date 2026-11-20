/**
 * Secret and private-data scanner (spec 018, group C).
 *
 * Two rules govern this file:
 *
 * 1. A matched secret never appears in the finding. The finding says what kind
 *    of value was found and where — reporting the value itself would copy the
 *    exposure into the saved review and into anyone's screen share.
 * 2. Any file holding a match is withheld from the AI payload. Sending a
 *    detected credential to a model to ask about it would be the one action the
 *    finding exists to prevent.
 */
import type { ArtifactFinding, UploadedArtifact } from '../contracts/ArtifactReview';
import { buildFinding } from './findingFactory';
import { stripRoot } from './artifactUtils';

export interface SecretScanResult {
  findings: ArtifactFinding[];
  /** Root-relative paths that must not be sent to the AI layer. */
  withheldPaths: Set<string>;
}

interface Detector {
  ruleId: string;
  label: string;
  pattern: RegExp;
  /** Extra check to reject structurally invalid matches. */
  validate?: (match: string) => boolean;
  /** True when a match should withhold the whole file from the AI payload. */
  withhold: boolean;
}

/** Luhn checksum. Rejects the many 16-digit numbers that are not card numbers. */
function passesLuhn(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Shannon entropy per character.
 *
 * A high-entropy string in a config position is very likely a generated
 * secret. Prose never reaches this threshold, which is what keeps the rule from
 * reporting every long word in the documentation.
 */
function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let total = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    total -= p * Math.log2(p);
  }
  return total;
}

const DETECTORS: Detector[] = [
  {
    ruleId: 'SEC-SECRET',
    label: 'an Azure or Microsoft Entra client secret',
    pattern: /\b[A-Za-z0-9_~.-]{3}8Q~[A-Za-z0-9_~.-]{34}\b/g,
    withhold: true,
  },
  {
    ruleId: 'SEC-SECRET',
    label: 'a GitHub personal access token',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
    withhold: true,
  },
  {
    ruleId: 'SEC-SECRET',
    label: 'an AWS access key identifier',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    withhold: true,
  },
  {
    ruleId: 'SEC-SECRET',
    label: 'a Slack token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    withhold: true,
  },
  {
    ruleId: 'SEC-SECRET',
    label: 'an OpenAI-style API key',
    pattern: /\bsk-[A-Za-z0-9]{32,}\b/g,
    withhold: true,
  },
  {
    ruleId: 'SEC-SECRET',
    label: 'a private key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    withhold: true,
  },
  {
    ruleId: 'SEC-SECRET',
    label: 'a JSON Web Token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    withhold: true,
  },
  {
    ruleId: 'SEC-SAS',
    label: 'a pre-signed access URL',
    pattern: /https?:\/\/[^\s"'<>]+[?&](?:sig|X-Amz-Signature|Signature)=[^\s"'&<>]+/gi,
    withhold: true,
  },
  {
    ruleId: 'SEC-CONN',
    label: 'a connection string containing credentials',
    pattern:
      /\b(?:AccountKey|Password|Pwd|SharedAccessKey)\s*=\s*[^\s;"']{8,}|\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s"'<>]*:[^\s"'@<>]+@/gi,
    withhold: true,
  },
  {
    ruleId: 'SEC-PII',
    label: 'a payment card number',
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    validate: passesLuhn,
    withhold: true,
  },
  {
    ruleId: 'SEC-PATH',
    label: 'an absolute path from a local machine',
    pattern: /\b[A-Za-z]:\\Users\\[^\s"'<>|]+|\/(?:home|Users)\/[A-Za-z0-9._-]+\/[^\s"'<>|]*/g,
    withhold: false,
  },
  {
    ruleId: 'SEC-HOST',
    label: 'an internal hostname or private network address',
    pattern:
      /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b|\b[a-z0-9-]+\.(?:internal|corp|local|intranet)\b/gi,
    withhold: false,
  },
];

/** Config-style assignments, where a high-entropy value is very likely a secret. */
const ASSIGNMENT_RE =
  /\b(?:api[_-]?key|apikey|secret|token|password|passwd|pwd|client[_-]?secret|access[_-]?key)\b\s*[:=]\s*["']?([A-Za-z0-9+/_=~.-]{20,})["']?/gi;

const ENTROPY_THRESHOLD = 3.8;

/** Placeholders authors use on purpose. Reporting these teaches users to ignore the rule. */
const PLACEHOLDER_RE =
  /^(?:x{4,}|\*{4,}|<[^>]+>|\$\{[^}]+\}|%[A-Z_]+%|your[_-]?\w+|example|changeme|placeholder|todo|redacted|dummy|sample|test|fake|abc123|0{6,}|1{6,})$/i;

export interface CredentialMatch {
  ruleId: string;
  /** The kind of value that was found, for example "an AWS access key identifier". */
  label: string;
  /**
   * True when no pattern rule matched and the only evidence is a high-entropy
   * value in a credential-named field. Such a match can be a false positive.
   */
  entropyOnly: boolean;
}

const CREDENTIAL_RULE_IDS = new Set(['SEC-SECRET', 'SEC-SAS', 'SEC-CONN']);

// Private copies, so that findCredentialMatches never changes the lastIndex of
// the shared global patterns that scanForSecrets uses.
const CREDENTIAL_DETECTORS: Detector[] = DETECTORS
  .filter((detector) => CREDENTIAL_RULE_IDS.has(detector.ruleId))
  .map((detector) => ({ ...detector, pattern: new RegExp(detector.pattern.source, detector.pattern.flags) }));
const CREDENTIAL_ASSIGNMENT_RE = new RegExp(ASSIGNMENT_RE.source, ASSIGNMENT_RE.flags);

function credentialValue(value: string, ruleId: string): string {
  if (ruleId === 'SEC-CONN') {
    return value.match(/^(?:AccountKey|Password|Pwd|SharedAccessKey)\s*=\s*(.+)$/i)?.[1]
      ?? value.match(/^[^:]+:\/\/[^:]*:([^@]+)@$/)?.[1]
      ?? value;
  }
  if (ruleId === 'SEC-SAS') {
    return value.match(/[?&](?:sig|X-Amz-Signature|Signature)=([^&]+)/i)?.[1] ?? value;
  }
  return value;
}

function hasCredentialMatch(text: string, detector: Detector): boolean {
  for (const match of text.matchAll(detector.pattern)) {
    const value = match[0];
    if (PLACEHOLDER_RE.test(credentialValue(value, detector.ruleId).trim())) continue;
    if (detector.validate && !detector.validate(value)) continue;
    return true;
  }
  return false;
}

/**
 * Names each kind of credential in a text, one entry per kind, without the value.
 *
 * Only the credential rules apply (secrets, pre-signed URLs, and connection
 * strings), not the private-data rules. The entropy check runs only when no
 * pattern rule matched; its single entry is marked `entropyOnly`.
 */
export function findCredentialMatches(text: string): CredentialMatch[] {
  const matches = CREDENTIAL_DETECTORS
    .filter((detector) => hasCredentialMatch(text, detector))
    .map((detector) => ({ ruleId: detector.ruleId, label: detector.label, entropyOnly: false }));
  if (matches.length > 0) return matches;

  for (const assignment of text.matchAll(CREDENTIAL_ASSIGNMENT_RE)) {
    const value = assignment[1];
    if (PLACEHOLDER_RE.test(value.trim()) || entropy(value) < ENTROPY_THRESHOLD) continue;
    return [{ ruleId: 'SEC-SECRET', label: 'a high-entropy value in a credential-named field', entropyOnly: true }];
  }
  return [];
}

/**
 * Builds a redactor for detected credential values, including values quoted
 * elsewhere without the original credential field name.
 */
export function createCredentialRedactor(texts: Iterable<string>): (text: string) => string {
  const values = new Set<string>();
  for (const text of texts) {
    for (const detector of CREDENTIAL_DETECTORS) {
      for (const match of text.matchAll(detector.pattern)) {
        const value = match[0];
        const secret = credentialValue(value, detector.ruleId);
        if (PLACEHOLDER_RE.test(secret.trim())) continue;
        if (detector.validate && !detector.validate(value)) continue;
        values.add(value);
        values.add(secret);
        if (detector.label === 'a private key block') values.add(text);
      }
    }
    for (const assignment of text.matchAll(CREDENTIAL_ASSIGNMENT_RE)) {
      const value = assignment[1];
      if (PLACEHOLDER_RE.test(value.trim()) || entropy(value) < ENTROPY_THRESHOLD) continue;
      values.add(value);
    }
  }
  const protectedValues = [...values].sort((left, right) => right.length - left.length);
  return (text) => protectedValues.reduce(
    (redacted, value) => redacted.split(value).join('[REDACTED]'),
    text,
  );
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length;
}

function isRejectedNetworkFixture(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 500), index);
  const after = text.slice(index, Math.min(text.length, index + 500));
  return (
    /\b(?:test\w*|assert\w*|expect\w*|reject\w*|deny\w*|block\w*|non[_ -]?public\w*|private\w*)/i.test(
      before,
    ) &&
    /\b(?:assertRaises|toThrow|reject|deny|block|invalid|not\s+allowed)\b/i.test(after)
  );
}

/** Scan every decoded text file in the bundle. */
export function scanForSecrets(artifact: UploadedArtifact): SecretScanResult {
  const findings: ArtifactFinding[] = [];
  const withheldPaths = new Set<string>();
  const seen = new Set<string>();

  for (const file of artifact.files) {
    if (file.isBinary || !file.text) continue;
    const relative = stripRoot(file.path, artifact.rootFolderName);
    const text = file.text;

    for (const detector of DETECTORS) {
      // Each detector carries the global flag, so lastIndex must be reset
      // between files or the second file starts scanning part-way through.
      detector.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = detector.pattern.exec(text)) !== null) {
        const value = match[0];
        if (PLACEHOLDER_RE.test(value.trim())) continue;
        if (detector.validate && !detector.validate(value)) continue;
        if (detector.ruleId === 'SEC-HOST' && isRejectedNetworkFixture(text, match.index)) continue;

        const line = lineNumberAt(text, match.index);
        // One finding per rule, file and line. A key repeated on twenty lines
        // is one problem, not twenty.
        const key = `${detector.ruleId}|${relative}|${detector.label}|${line}`;
        if (seen.has(key)) continue;
        seen.add(key);

        findings.push(
          buildFinding({
            ruleId: detector.ruleId,
            resourcePath: relative,
            line,
            // Deliberately describes the value instead of quoting it.
            evidence: `Line ${line} of "${relative}" contains what appears to be ${detector.label}. The value is not reproduced here.`,
            instanceKey: `${detector.label}:${line}`,
          }),
        );

        if (detector.withhold) withheldPaths.add(relative);
      }
    }

    ASSIGNMENT_RE.lastIndex = 0;
    let assignment: RegExpExecArray | null;
    while ((assignment = ASSIGNMENT_RE.exec(text)) !== null) {
      const value = assignment[1];
      if (PLACEHOLDER_RE.test(value.trim())) continue;
      if (entropy(value) < ENTROPY_THRESHOLD) continue;

      const line = lineNumberAt(text, assignment.index);
      const key = `SEC-SECRET|${relative}|entropy|${line}`;
      if (seen.has(key)) continue;
      seen.add(key);

      findings.push(
        buildFinding({
          ruleId: 'SEC-SECRET',
          resourcePath: relative,
          line,
          evidence: `Line ${line} of "${relative}" assigns a high-entropy value to a credential-named field. The value is not reproduced here.`,
          instanceKey: `entropy:${line}`,
        }),
      );
      withheldPaths.add(relative);
    }
  }

  return { findings, withheldPaths };
}
