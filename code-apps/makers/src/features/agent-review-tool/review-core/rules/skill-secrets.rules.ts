/**
 * The deterministic secret and private-data rules over an uploaded skill's
 * bundle — group C of `skillRuleRegistry.ts`.
 *
 * Same move, and the same machinery, as `skill-packaging.rules.ts`: the
 * declaration below is the one authority, and {@link skillPackagingRule}
 * projects it into the `Rule` the core registry wants and into the legacy
 * `SkillRuleDefinition` row `createRegisteredFinding` has always read. Nothing
 * here restates a value the seam already derives, and the detector is not
 * re-run — `secretScanner.ts` is what decides a failure, and these rules report
 * a verdict over the findings it already produced.
 *
 * These six are one family by population as well as by subject. Every one of
 * them is answered by the same pass over the same set: `scanForSecrets` walks
 * `artifact.files`, skips anything binary or undecoded, and runs every detector
 * against the text of what is left. So they share one
 * {@link DECODED_BUNDLE_TEXT} population rather than declaring six copies of it,
 * and they publish under the `Security` family rather than the seam's
 * `Packaging` constant — which is exactly why `family` rides on the options.
 *
 * Two judgements are worth stating, because both move scores:
 *
 * - **The empty set of matches is a pass, not a not-applicable.** These are
 *   scanning rules, and the claim each makes is "the bundle holds none of this".
 *   A readable bundle with no credential in it has answered that question
 *   affirmatively; it has not escaped being asked. This is LIM-SIZE's reading of
 *   a budget rather than PKG-NAME's reading of a missing field, and returning
 *   not-applicable here would drop all six from both sides of `creditFor`, so a
 *   clean bundle would earn nothing at all on safety evidence.
 * - **An unscannable bundle is `could-not-run`, never not-applicable.** Both
 *   degenerate states — an archive that produced no file table, and a bundle
 *   whose every file is binary or failed to decode — mean the scan did not
 *   happen. Nothing was measured, and a claim of absence cannot be earned by a
 *   measurement that was never taken. Unlike the packaging rules, none of these
 *   has a *genuine* not-applicable: there is no runtime gate on a secret, and no
 *   sibling presence rule owns the absence, so `notApplicableWhen` is empty by
 *   construction rather than by omission.
 *
 * The population object is declared here rather than in the seam because it is
 * read only by this file; `skill-packaging.rules.ts` is imported from and never
 * edited.
 */

import type {
  UploadedArtifact, UploadedFile,
} from '../../skills-automations/contracts/ArtifactReview';
import type { Rule } from '../rule';
import {
  populated, skillPackagingRule, unreadablePopulation,
  type SkillPackagingContext, type SkillPackagingOptions, type SkillPackagingPopulation,
  type SkillPackagingRuleEntry, type SkillRuleDefinition,
} from './skill-packaging.rules';

/** The legacy row shape, re-exported so this file's consumers need only one import. */
export type { SkillRuleDefinition };

/** The family every group C rule publishes under. */
const SECURITY_RULE_FAMILY = 'Security';

// ── Population ─────────────────────────────────────────────────────────────

/** Exactly what `scanForSecrets` iterates: every bundled file that decoded to text. */
function decodedTextFiles(artifact: UploadedArtifact): UploadedFile[] {
  return artifact.files.filter(file => !file.isBinary && typeof file.text === 'string');
}

/**
 * The decoded text of the bundle — the set every group C detector reads.
 *
 * Neither failing state is `absent`. A bundle of nothing but binaries has not
 * demonstrated that it holds no credentials; it has withheld the only evidence
 * that could have shown either way, and that is an infrastructure status rather
 * than a judgement about the skill. The same is true of an archive that produced
 * no file list at all, which is the state `COWORK_COMPANION_FILES` already reads
 * as unreadable for the same reason.
 *
 * `detail` is phrased over the set rather than over any one detector, because
 * all six rules share this resolver and the pass sentence has to be true of each
 * of them.
 */
export const DECODED_BUNDLE_TEXT: SkillPackagingPopulation = Object.freeze({
  label: 'decoded bundle text',
  resolve: (ctx: SkillPackagingContext) => {
    if (ctx.artifact.files.length === 0) {
      return unreadablePopulation(
        'This archive produced no file list, so there was no file content to scan for sensitive '
        + 'values.',
      );
    }

    const texts = decodedTextFiles(ctx.artifact);
    if (texts.length === 0) {
      return unreadablePopulation(
        `None of the ${ctx.artifact.files.length} bundled file(s) decoded to text — every one is `
        + 'binary or failed to decode — so none of them could be scanned for sensitive values.',
      );
    }

    const bytes = texts.reduce((sum, file) => sum + file.bytes, 0);
    return populated(
      `${texts.length} decoded text file(s) totalling ${bytes} byte(s) were scanned, and none of `
      + 'them matched.',
    );
  },
});

// ── Secret and private-data rules ──────────────────────────────────────────

export const SEC_SECRET_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'critical', confidence: 'high', family: SECURITY_RULE_FAMILY,
  population: DECODED_BUNDLE_TEXT,
});

export const SEC_SECRET: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'SEC-SECRET',
  title: 'Bundle Contains What Appears to Be a Live Credential',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-secrets-management', 'cwe-798', 'owasp-llm02'],
  prose: {
    question: 'Is the bundle free of values that look like live credentials?',
    summary: 'Scan every decoded text file for known credential formats — Entra client secrets, GitHub and Slack tokens, AWS key ids, OpenAI-style keys, private key blocks and JWTs — and for high-entropy values assigned to credential-named fields.',
    why: 'A credential inside a shared skill is disclosed to everyone who installs it. Anything committed this way must be treated as compromised, whether or not the bundle was ever published.',
    fix: 'Revoke the credential, then remove it from the bundle.',
    fixSteps: [
      'Revoke or rotate the credential now. Removing the file does not undo the exposure.',
      'Delete the value from the bundle and from your version-control history.',
      'Read the credential from a secret store or environment variable at run time instead.',
    ],
    passWhen: [
      'At least one bundled file decoded to text, and no scanned file matched a known credential format.',
      'No scanned file assigns a high-entropy value to a field named for an api key, secret, token or password.',
      'A value that matches a credential shape is a recognised placeholder — "xxxx", "<your-key>", "${TOKEN}", "changeme" — which the scanner treats as deliberate example text.',
    ],
    failWhen: [
      'A decoded text file contains a value matching a known credential format, and that value is not a recognised placeholder.',
      'A decoded text file assigns a value with high Shannon entropy to a credential-named configuration field.',
    ],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['artifact.files[].text', 'artifact.files[].path'] },
}, SEC_SECRET_OPTIONS);

export const SEC_PII_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'critical', confidence: 'high', family: SECURITY_RULE_FAMILY,
  population: DECODED_BUNDLE_TEXT,
});

export const SEC_PII: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'SEC-PII',
  title: 'Bundle Contains Personal or Financial Data',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['pci-dss', 'owasp-llm02', 'owasp-secrets-management'],
  prose: {
    question: 'Is the bundle free of real personal or financial data?',
    summary: 'Scan every decoded text file for payment card numbers, confirming each candidate against the Luhn checksum before reporting it.',
    why: 'A shared skill is copied by everyone who installs it. Personal or financial data inside it is disclosed with every copy, and cannot be recalled once distributed.',
    fix: 'Remove the data and replace it with a clearly fictional example.',
    fixSteps: [
      'Delete the real value from the bundle.',
      'Replace it with an obviously fictional placeholder if an example is needed.',
    ],
    passWhen: [
      'At least one bundled file decoded to text, and no scanned file contains a digit sequence that passes the Luhn checksum for a payment card number.',
      'A long digit sequence that is present fails the Luhn check, so it is some other identifier rather than a card number.',
    ],
    failWhen: [
      'A decoded text file contains a 13 to 19 digit sequence that passes the Luhn checksum, which is the shape of a real payment card number.',
    ],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['artifact.files[].text', 'artifact.files[].path'] },
}, SEC_PII_OPTIONS);

export const SEC_SAS_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'critical', confidence: 'high', family: SECURITY_RULE_FAMILY,
  population: DECODED_BUNDLE_TEXT,
});

export const SEC_SAS: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'SEC-SAS',
  title: 'Bundle Contains a Pre-Signed Access URL',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-secrets-management', 'cwe-798'],
  prose: {
    question: 'Is the bundle free of pre-signed access URLs?',
    summary: 'Scan every decoded text file for HTTP URLs carrying a signature parameter — a shared access signature, or an AWS request signature.',
    why: 'A pre-signed URL grants access to its target to anyone holding the link, with no further authentication, until it expires.',
    fix: 'Revoke the signature and remove the URL.',
    fixSteps: [
      'Revoke the signature or rotate the signing key.',
      'Remove the URL from the bundle and generate signed links at run time instead.',
    ],
    passWhen: [
      'At least one bundled file decoded to text, and no scanned file contains a URL carrying a "sig", "Signature" or "X-Amz-Signature" query parameter.',
      'URLs that are present are unsigned endpoints, which carry no standing grant of access.',
    ],
    failWhen: [
      'A decoded text file contains an HTTP or HTTPS URL whose query string carries a signature parameter, which grants its holder access without further authentication.',
    ],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['artifact.files[].text', 'artifact.files[].path'] },
}, SEC_SAS_OPTIONS);

export const SEC_CONN_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'critical', confidence: 'high', family: SECURITY_RULE_FAMILY,
  population: DECODED_BUNDLE_TEXT,
});

export const SEC_CONN: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'SEC-CONN',
  title: 'Bundle Contains a Connection String',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-secrets-management', 'cwe-798'],
  prose: {
    question: 'Is the bundle free of connection strings carrying credentials?',
    summary: 'Scan every decoded text file for credential-bearing connection strings — an AccountKey, Password, Pwd or SharedAccessKey assignment, or a database URI with a password embedded in its authority.',
    why: 'Connection strings usually embed credentials alongside the endpoint, so the whole data source is disclosed with the bundle.',
    fix: 'Remove the connection string and resolve it at run time.',
    fixSteps: [
      'Rotate any credential contained in the string.',
      'Remove the string from the bundle.',
      'Resolve the connection from configuration or a secret store at run time.',
    ],
    passWhen: [
      'At least one bundled file decoded to text, and no scanned file assigns a value to AccountKey, Password, Pwd or SharedAccessKey.',
      'No scanned file contains a mongodb, postgres, mysql or redis URI with a password in its authority section.',
      'A connection string that is present names only an endpoint, with its credential resolved from configuration at run time.',
    ],
    failWhen: [
      'A decoded text file contains a connection string whose credential is written inline, disclosing the endpoint and the means to reach it together.',
    ],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['artifact.files[].text', 'artifact.files[].path'] },
}, SEC_CONN_OPTIONS);

export const SEC_PATH_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'medium', confidence: 'high', family: SECURITY_RULE_FAMILY,
  population: DECODED_BUNDLE_TEXT,
});

export const SEC_PATH: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'SEC-PATH',
  title: 'Bundle Contains a Local Filesystem Path',
  pillar: 'safety-evidence',
  severity: 'medium',
  tags: ['security'],
  references: ['ms-skill-design-checklist', 'cwe-497'],
  prose: {
    question: 'Is the bundle free of absolute paths from the author\'s own machine?',
    summary: "Scan every decoded text file for absolute user-profile paths — a Windows \"C:\\Users\\...\" path, or a POSIX \"/home/...\" or \"/Users/...\" path.",
    why: "An absolute path from the author's machine does not exist on anyone else's, so the step fails everywhere but where it was written. It also discloses the author's account name and folder layout.",
    fix: 'Replace absolute paths with relative ones.',
    fixSteps: [
      'Replace the absolute path with a path relative to the skill folder.',
      'Where an absolute path is genuinely needed, take it as an input rather than hardcoding it.',
    ],
    passWhen: [
      'At least one bundled file decoded to text, and no scanned file contains an absolute path rooted in a user profile directory.',
      'Paths that are present are relative to the skill folder, so they resolve on every machine that installs the skill.',
    ],
    failWhen: [
      "A decoded text file contains an absolute path under a user profile directory, which resolves only on the author's machine and names their account.",
    ],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['artifact.files[].text', 'artifact.files[].path'] },
}, SEC_PATH_OPTIONS);

export const SEC_HOST_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'medium', confidence: 'medium', family: SECURITY_RULE_FAMILY,
  population: DECODED_BUNDLE_TEXT,
});

export const SEC_HOST: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'SEC-HOST',
  title: 'Bundle Contains an Internal Hostname or Address',
  pillar: 'safety-evidence',
  severity: 'medium',
  tags: ['security'],
  references: ['owasp-secrets-management', 'cwe-200'],
  prose: {
    question: 'Is the bundle free of internal hostnames and private network addresses?',
    summary: 'Scan every decoded text file for RFC 1918 addresses and for hostnames ending in .internal, .corp, .local or .intranet, skipping matches the surrounding text frames as a rejected test fixture.',
    why: 'Internal hostnames and private addresses are unreachable from other environments, and disclosing them tells a reader about network layout they were not meant to see.',
    fix: 'Remove the internal address or make it configurable.',
    fixSteps: [
      'Replace the internal address with a configurable value.',
      'Document what the value should be set to, without naming a real internal host.',
    ],
    passWhen: [
      'At least one bundled file decoded to text, and no scanned file contains a 10.x, 192.168.x or 172.16–31.x address.',
      'No scanned file names a host under the .internal, .corp, .local or .intranet suffix.',
      'A private address that is present sits in a test that asserts it is rejected, which the scanner reads as a negative fixture rather than a configured endpoint.',
    ],
    failWhen: [
      'A decoded text file names a private network address or an internal hostname as something the skill reaches, which no other environment can resolve.',
    ],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['artifact.files[].text', 'artifact.files[].path'] },
}, SEC_HOST_OPTIONS);

/**
 * Every secret and private-data rule declared here, in published order.
 *
 * The order is `RULE_REGISTRY`'s own, so the rows this file supplies land where
 * the hand-written ones stood. `skillRuleRegistry.ts` will spread
 * {@link skillSecretsDefinitions} over them exactly as it already does for the
 * scanner rules, so a rule that moves here stops being authored twice without
 * any consumer of `RULE_REGISTRY` changing. That spread is the orchestrator's
 * edit, not this file's.
 */
export const skillSecretsRuleEntries: readonly SkillPackagingRuleEntry[] = Object.freeze([
  SEC_SECRET,
  SEC_PII,
  SEC_SAS,
  SEC_CONN,
  SEC_PATH,
  SEC_HOST,
]);

export const skillSecretsCoreRules: readonly Rule<SkillPackagingContext>[] = Object.freeze(
  skillSecretsRuleEntries.map(entry => entry.rule),
);

export const skillSecretsDefinitions: Readonly<Record<string, SkillRuleDefinition>> =
  Object.freeze(
    Object.fromEntries(skillSecretsRuleEntries.map(entry => [entry.rule.id, entry.definition])),
  );
