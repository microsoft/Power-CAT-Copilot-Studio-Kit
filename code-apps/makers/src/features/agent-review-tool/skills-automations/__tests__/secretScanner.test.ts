/**
 * Secret scanner tests.
 *
 * Two properties matter more than detection breadth:
 *
 * 1. A finding must never echo the matched value. A review report that quotes a
 *    live credential has copied the secret into a second place.
 * 2. A hit must withhold the file from the AI payload, so the credential is not
 *    sent to a model as part of "here is the skill to review".
 *
 * The fake secrets are split into string parts, so that secret scanners do not
 * report them.
 */
import { describe, expect, it } from 'vitest';
import { createCredentialRedactor, findCredentialMatches, scanForSecrets } from '../services/secretScanner';
import { artifact, file, hasRule } from './fixtures';

/** Passes the Luhn check, so it is shaped like a real card number. */
const LUHN_VALID = '4539578763621486';
/** Same length and prefix, fails the Luhn check. */
const LUHN_INVALID = '4539578763621487';

describe('scanForSecrets', () => {
  it('finds nothing in a clean bundle', () => {
    const result = scanForSecrets(artifact([file('SKILL.md', '# Clean\n\nNo credentials here.')]));
    expect(result.findings).toHaveLength(0);
    expect(result.withheldPaths.size).toBe(0);
  });

  it('does not report a private address that a negative security test rejects', () => {
    const result = scanForSecrets(
      artifact([
        file(
          'scripts/test_url_validation.py',
          [
            'def test_url_validation_rejects_non_public_addresses():',
            '    for url in ("http://10.0.0.1/",):',
            '        with self.assertRaises(ValueError):',
            '            validate_public_url(url)',
          ].join('\n'),
        ),
      ]),
    );

    expect(hasRule(result.findings, 'SEC-HOST')).toBe(false);
  });

  it('still reports an internal address used as configuration', () => {
    const result = scanForSecrets(
      artifact([file('config.py', 'service_url = "http://10.0.0.1/api"')]),
    );

    expect(hasRule(result.findings, 'SEC-HOST')).toBe(true);
  });

  it('flags a hard-coded connection string', () => {
    const result = scanForSecrets(
      artifact([
        file(
          'config.md',
          'Use DefaultEndpointsProtocol=https;AccountName=store;AccountKey=' + 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz==;EndpointSuffix=core.windows.net',
        ),
      ]),
    );
    expect(hasRule(result.findings, 'SEC-CONN')).toBe(true);
  });

  it('flags a SAS token', () => {
    const result = scanForSecrets(
      artifact([file('notes.md', 'Download from https://x.blob.core.windows.net/c/f?sv=2021-08-06&sig=AbC123%2FdEf%3D&se=2030-01-01')]),
    );
    expect(hasRule(result.findings, 'SEC-SAS')).toBe(true);
  });

  it('never echoes the matched value in the finding text', () => {
    const secret = 'sk-' + 'liveAKIAIOSFODNN7EXAMPLEabcdefghijklmnop';
    const result = scanForSecrets(artifact([file('SKILL.md', `api_key = "${secret}"`)]));
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      const text = [finding.title, finding.evidence, finding.recommendation, ...finding.fixSteps].join(' ');
      expect(text).not.toContain(secret);
    }
  });

  it('withholds a file that contains a credential from the AI payload', () => {
    const result = scanForSecrets(artifact([file('scripts/deploy.sh', 'export API_TOKEN="ghp_' + 'aBcD1234efGH5678ijKL90mnOP12qrST3456"')]));
    expect(result.withheldPaths.has('scripts/deploy.sh')).toBe(true);
  });

  it('accepts a Luhn-valid card number as a PII hit', () => {
    const result = scanForSecrets(artifact([file('example.md', `Card on file: ${LUHN_VALID}`)]));
    expect(hasRule(result.findings, 'SEC-PII')).toBe(true);
  });

  it('rejects a Luhn-invalid number of the same shape', () => {
    // Order numbers and ticket IDs are the same length as card numbers. Without
    // the checksum this rule would fire on ordinary documentation.
    const result = scanForSecrets(artifact([file('example.md', `Order reference: ${LUHN_INVALID}`)]));
    expect(hasRule(result.findings, 'SEC-PII')).toBe(false);
  });

  it('does not flag an obvious placeholder', () => {
    const result = scanForSecrets(
      artifact([file('SKILL.md', 'Set `api_key = "YOUR_API_KEY_HERE"` before running.\napi_key = "<your-token>"')]),
    );
    expect(result.findings).toHaveLength(0);
  });

  it('reports one finding per line rather than one per pattern that matches it', () => {
    const line = 'export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY"';
    const result = scanForSecrets(artifact([file('a.sh', line)]));
    const lines = new Set(result.findings.map((f) => f.line));
    expect(result.findings.length).toBe(lines.size);
  });

  it('scans every file, not just the first', () => {
    // A global regex keeps its lastIndex between calls. Without a reset the
    // second file is scanned from part-way through and its secret is missed.
    const result = scanForSecrets(
      artifact([
        file('a.sh', 'export GITHUB_TOKEN="ghp_' + 'aBcD1234efGH5678ijKL90mnOP12qrST3456"'),
        file('b.sh', 'export GITHUB_TOKEN="ghp_' + 'zYxW9876vuTS5432rqPO10nmLK98jihG7654"'),
      ]),
    );
    expect(result.withheldPaths.has('a.sh')).toBe(true);
    expect(result.withheldPaths.has('b.sh')).toBe(true);
  });
});

describe('findCredentialMatches', () => {
  // Built at run time so that the source file holds no credential-shaped literal.
  const accessKeyId = ['AKIA', 'IOSFODNN7', 'SYNTHAB'].join('');
  const signedUrl = ['https://files.contoso.invalid/report.pdf?sv=2024&', 'sig', '=SyntheticSignature%3D'].join('');
  const highEntropy = ['Qz8', 'vR2', 'mK9', 'tX4', 'wL7', 'pB1', 'nF6'].join('');

  it('names each credential type and never returns the value', () => {
    const matches = findCredentialMatches(`key: ${accessKeyId}\nurl: ${signedUrl}`);

    expect(matches).toEqual(expect.arrayContaining([
      { ruleId: 'SEC-SECRET', label: 'an AWS access key identifier', entropyOnly: false },
      { ruleId: 'SEC-SAS', label: 'a pre-signed access URL', entropyOnly: false },
    ]));
    expect(JSON.stringify(matches)).not.toContain(accessKeyId);
    expect(JSON.stringify(matches)).not.toContain('SyntheticSignature');
  });

  it('marks a high-entropy value in a credential-named field as entropy-only', () => {
    expect(findCredentialMatches(`client_secret: ${highEntropy}`)).toEqual([
      expect.objectContaining({ ruleId: 'SEC-SECRET', entropyOnly: true }),
    ]);
  });

  it('ignores placeholders, low-entropy values, and private-data rules', () => {
    expect(findCredentialMatches('api_key: your_api_key_goes_right_here')).toEqual([]);
    expect(findCredentialMatches('password: aaaaaaaaaaaaaaaaaaaaaaaa')).toEqual([]);
    expect(findCredentialMatches('Card on file: 4539578763621486')).toEqual([]);
    expect(findCredentialMatches('Open /home/someone/notes.txt on host build.internal')).toEqual([]);
  });

  it('gives the same result when it is called again', () => {
    const text = `first: ${accessKeyId}`;
    expect(findCredentialMatches(text)).toEqual(findCredentialMatches(text));
    expect(findCredentialMatches(text)).toHaveLength(1);
  });
});

describe('createCredentialRedactor', () => {
  it.each(['connection', 'signed-url'])(
    'removes the credential portion of a %s when another finding quotes only that portion',
    (kind) => {
      const value = ['repeat', 'repeat', 'repeat'].join('-');
      const source = kind === 'connection'
        ? `postgresql://synthetic:${value}@database.contoso.invalid/data`
        : `https://files.contoso.invalid/data?sig=${value}`;
      const redact = createCredentialRedactor([source]);
      expect(redact(`Found "${value}" elsewhere.`)).toBe('Found "[REDACTED]" elsewhere.');
      expect(redact(source)).not.toContain(value);
    },
  );

  it('removes a connection password when another finding quotes only its value', () => {
    const password = ['repeat', 'repeat', 'repeat'].join('-');
    const redact = createCredentialRedactor([`Password=${password}`]);
    expect(redact(`Function "${password}" has no operationId.`))
      .toBe('Function "[REDACTED]" has no operationId.');
  });

  it('removes known and entropy-only values when another finding quotes them without their field names', () => {
    const accessKeyId = ['AKIA', 'IOSFODNN7', 'SYNTHAB'].join('');
    const highEntropy = ['Qz8', 'vR2', 'mK9', 'tX4', 'wL7', 'pB1', 'nF6'].join('');
    const redact = createCredentialRedactor([accessKeyId, `client_secret=${highEntropy}`]);
    const message = `Function "${accessKeyId}" has no operationId; found "${highEntropy}" again.`;
    expect(redact(message)).toBe('Function "[REDACTED]" has no operationId; found "[REDACTED]" again.');
    expect(redact(message)).toBe(redact(message));
  });

  it('leaves ordinary content, explicit placeholders, and low-entropy strings unchanged', () => {
    const text = 'api_key=YOUR_API_KEY_HERE; password: aaaaaaaaaaaaaaaaaaaaaaaa; get_orders';
    expect(createCredentialRedactor([text])(text)).toBe(text);
  });

  it('does not change the detector state used by artifact scanning', () => {
    const value = ['ghp_', 'Synthetic', 'Value', 'For', 'A', 'Test', 'Only', '12345678901234'].join('');
    const source = artifact([file('config.txt', `token=${value}`)]);
    const before = scanForSecrets(source);
    expect(createCredentialRedactor([value])(value)).toBe('[REDACTED]');
    expect(scanForSecrets(source)).toEqual(before);
  });
});
