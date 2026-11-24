/**
 * The remaining Python `SCR-*` scanner rules, declared the way `SCR-CMD-01` is.
 *
 * Same move, same shape, different file: these six used to exist only as rows in
 * `agents-experience/services/skill/skillRuleRegistry.ts`, and they now declare
 * themselves once here and project into both the core `Rule` vocabulary and the
 * legacy `SkillRuleDefinition` row `createRegisteredFinding` reads. Everything
 * that makes a scanner rule a scanner rule — the population gate, the reduction
 * over scanner output, the `harnesses`/`subjectScope`/`execution` triple, the
 * derivation of the legacy row — lives in {@link skillScannerRule} and is
 * imported rather than restated.
 *
 * They live beside `skill-scanner.rules.ts` rather than inside it because the
 * 53 do not all land at once and a single file edited by several hands at once
 * is a merge conflict waiting to happen. The split is physical only: the entries
 * are the same type, carry the same contract, and are concatenated at
 * registration.
 *
 * All six are Python security rules whose legacy `dimension` was `"safety"`, so
 * all six declare `pillar: 'safety-evidence'` — the one skill dimension that
 * buckets to `safety` in `SKILL_DIMENSION_BUCKET`. The `why`, `recommendation`,
 * ordered `fixSteps` and `referenceIds` are carried across byte for byte; only
 * the prose the new vocabulary adds — question, summary, passWhen, failWhen,
 * notApplicableWhen — is authored here, and it is written from the actual
 * patterns and classifiers in `resourceScanners.ts` so it describes what the
 * scanner detects rather than what the rule's name suggests.
 */

import {
  PYTHON_RESOURCES, skillScannerRule,
  type SkillScannerOptions, type SkillScannerRuleEntry,
} from './skill-scanner.rules';

// ── Python scanner rules ───────────────────────────────────────────────────

export const SCR_CODE_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'critical', confidence: 'high', population: PYTHON_RESOURCES,
});

export const SCR_CODE_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'SCR-CODE-01',
  title: 'Dynamic Code Execution (eval/exec) in Python Script',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['cwe-94', 'owasp-input-validation'],
  prose: {
    question: 'Does every Python resource avoid turning a string into executable code at runtime?',
    summary: 'Scan decoded Python resources for calls to the eval and exec builtins.',
    why: 'eval/exec on untrusted strings executes arbitrary code in the same process.',
    fix: 'Remove eval/exec calls; use a parser or explicit dispatch mapping instead.',
    fixSteps: [
      'Replace eval/exec with safe alternatives such as ast.literal_eval for data or explicit dispatch logic.',
      'If dynamic evaluation is truly required, run it in a fully-isolated sandbox with no access to sensitive state.',
    ],
    passWhen: [
      'No scanned Python resource calls eval(.',
      'No scanned Python resource calls exec(.',
    ],
    failWhen: [
      'A Python resource calls eval(, which evaluates a string as an expression.',
      'A Python resource calls exec(, which runs a string as a statement block.',
    ],
    notApplicableWhen: ['The skill contains no Python resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, SCR_CODE_01_OPTIONS);

export const SCR_DESTR_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'high', confidence: 'high', population: PYTHON_RESOURCES,
});

export const SCR_DESTR_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'SCR-DESTR-01',
  title: 'Potentially Destructive File Operation in Python Script',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['owasp-llm06'],
  prose: {
    question: 'Does every file delete in a Python resource target a path the skill demonstrably owns?',
    summary: 'Scan decoded Python resources for os.remove, os.unlink, os.rmdir, shutil.rmdir and shutil.rmtree, and judge each by the target it is given.',
    why: 'A delete operation can damage the host file system when its target is recursive, user-controlled, or outside a known working directory.',
    fix: 'Restrict the delete target to a validated working directory or temporary file.',
    fixSteps: [
      'Audit every file open/delete call and confirm it operates only within expected, scoped paths.',
      'Replace direct FS operations with scoped storage APIs that enforce path boundaries.',
      'Require explicit runtime consent before any write or delete action.',
    ],
    passWhen: [
      'No scanned Python resource calls os.remove, os.unlink, os.rmdir, shutil.rmdir or shutil.rmtree.',
      'Every delete that is present targets a path the scanner can tie to tempfile or to a temp/tmp/cache/staging/scratch name, and its line names no user-supplied input.',
      'Every delete that is present targets a directory the script itself created and proved empty before removing.',
    ],
    failWhen: [
      'A Python resource deletes recursively with shutil.rmtree, os.rmdir or shutil.rmdir.',
      'The delete target is named for user, input, request, argv, untrusted or supplied data.',
      'The delete target has no visible provenance tying it to a temporary or script-owned path.',
    ],
    notApplicableWhen: ['The skill contains no Python resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, SCR_DESTR_01_OPTIONS);

export const SCR_NET_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'high', confidence: 'high', population: PYTHON_RESOURCES,
});

export const SCR_NET_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'SCR-NET-01',
  title: 'Outbound Network Call in Python Script',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['cwe-918', 'owasp-llm02'],
  prose: {
    question: 'Does every outbound call in a Python resource go to a fixed endpoint without sending data out?',
    summary: 'Scan decoded Python resources for requests/httpx/aiohttp calls and for urllib, socket, http.client, smtplib and ftplib egress, then judge each by its destination, method and payload.',
    why: 'A network call needs review when its destination is dynamic or it transmits data. Fixed read-only probes to known services are advisory.',
    fix: 'Use a fixed, approved endpoint and avoid transmitting credentials or user data.',
    fixSteps: [
      'Confirm the HTTP method, destination and transmitted fields are all required.',
      'Verify the target endpoint is in the approved allowlist.',
      'Add observability (logging, alerting) for any approved network egress.',
    ],
    passWhen: [
      'No scanned Python resource calls requests, httpx, aiohttp, urllib, socket, http.client, smtplib or ftplib.',
      'Every call that is present targets a literal URL, uses GET, HEAD or OPTIONS, and passes no json/data/files/body/content argument or credential-like name.',
    ],
    failWhen: [
      'The destination is not a literal URL the scanner can resolve, so where the call goes is decided at runtime.',
      'The call carries a payload — a json, data, files, body or content argument, or a token, secret, password, credential or user-data name.',
      'The call uses POST, PUT, PATCH or DELETE, which are write methods rather than read-only probes.',
    ],
    notApplicableWhen: ['The skill contains no Python resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, SCR_NET_01_OPTIONS);

export const SCR_SEC_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'critical', confidence: 'high', population: PYTHON_RESOURCES,
});

export const SCR_SEC_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'SCR-SEC-01',
  title: 'Hardcoded Secret in Python Script',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['cwe-798', 'owasp-secrets-management'],
  prose: {
    question: 'Is every Python resource free of credentials written directly into the source?',
    summary: 'Scan decoded Python resources for an assignment of a quoted literal to a credential-named variable.',
    why: 'Secrets embedded in source files are exposed to everyone who reads the bundle.',
    fix: 'Remove all hardcoded credentials and use a secrets manager or environment variable injection.',
    fixSteps: [
      'Delete the hardcoded secret from the file immediately.',
      'Rotate the affected credential.',
      'Inject secrets at runtime via environment variables or a managed secrets store.',
    ],
    passWhen: [
      'No scanned Python resource assigns a quoted literal to a name containing password, passwd, secret, api_key, token, auth_key, credential or private_key.',
      'Credential-named variables that are present are read from the environment or a secrets store rather than assigned a literal.',
    ],
    failWhen: [
      'A Python resource assigns a quoted literal of four or more characters to a credential-named variable.',
    ],
    notApplicableWhen: ['The skill contains no Python resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, SCR_SEC_01_OPTIONS);

export const SCR_DESER_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'critical', confidence: 'high', population: PYTHON_RESOURCES,
});

export const SCR_DESER_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'SCR-DESER-01',
  title: 'Unsafe Deserialization in Python Script',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['cwe-502', 'owasp-input-validation'],
  prose: {
    question: 'Does every Python resource deserialize with a reader that cannot construct arbitrary objects?',
    summary: 'Scan decoded Python resources for pickle.load/loads, marshal.load/loads, shelve.open and yaml.load.',
    why: 'Deserializing untrusted data with pickle/marshal/yaml.load can execute arbitrary code.',
    fix: 'Replace unsafe deserialization with safe alternatives (e.g., json.loads, yaml.safe_load).',
    fixSteps: [
      'Replace pickle.loads / marshal.loads with json.loads or a schema-validated parser.',
      'Replace yaml.load with yaml.safe_load.',
      'Never deserialize data received from an untrusted source.',
    ],
    passWhen: [
      'No scanned Python resource calls pickle.load/loads, marshal.load/loads or shelve.open.',
      'Any YAML parsing uses yaml.safe_load rather than yaml.load.',
    ],
    failWhen: [
      'A Python resource calls pickle.load/loads or marshal.load/loads, which reconstruct arbitrary objects from the byte stream.',
      'A Python resource calls shelve.open, which unpickles the values it stores.',
      'A Python resource calls yaml.load, whose default loader instantiates Python objects named in the document.',
    ],
    notApplicableWhen: ['The skill contains no Python resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, SCR_DESER_01_OPTIONS);

export const SCR_TRAV_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'high', confidence: 'high', population: PYTHON_RESOURCES,
});

export const SCR_TRAV_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'SCR-TRAV-01',
  title: 'Path Traversal in Python Script',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['cwe-22', 'owasp-input-validation'],
  prose: {
    question: 'Does every Python resource keep file access inside its intended directory?',
    summary: 'Scan decoded Python resources for a parent-directory sequence on a line that also performs a file operation.',
    why: 'Constructing file paths from user input without validation allows access outside the intended directory.',
    fix: 'Validate and canonicalize all file paths; reject any path that escapes the allowed root.',
    fixSteps: [
      'Resolve the file path to a canonical absolute path before opening it.',
      'Assert the resolved path is inside the expected root directory.',
      "Reject or sanitize any input containing '..' or absolute path segments.",
    ],
    passWhen: [
      'No scanned Python resource contains a parent-directory sequence.',
      'Any parent-directory sequence that is present sits on a line that performs no file operation, so it is a comment, a string or an import rather than an access path.',
    ],
    failWhen: [
      'A parent-directory sequence appears on a line that also calls open, Path, read_text, write_text, read_bytes, write_bytes, os.path, os.remove, os.unlink or shutil.rmtree.',
    ],
    notApplicableWhen: ['The skill contains no Python resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, SCR_TRAV_01_OPTIONS);

/**
 * The six declared here, in published order.
 *
 * Kept as its own export rather than appended to `skillScannerRuleEntries` so
 * this file owns its list outright; registration concatenates the two.
 */
export const scrScannerRuleEntries: readonly SkillScannerRuleEntry[] = Object.freeze([
  SCR_CODE_01,
  SCR_DESTR_01,
  SCR_NET_01,
  SCR_SEC_01,
  SCR_DESER_01,
  SCR_TRAV_01,
]);
