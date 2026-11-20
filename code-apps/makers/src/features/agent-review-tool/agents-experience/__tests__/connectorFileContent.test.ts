/**
 * Decoding of Dataverse connector file content.
 *
 * Measured on ZAVA Training Hub: all four skill resources failed with
 * `Failed to execute 'atob' on 'Window': The string to be decoded is not
 * correctly encoded`. The bundle manifest came back empty, `skill_markdown` was
 * blank, and the review then reported the skill as having no name, no
 * description and an empty body — four findings that were artefacts of the
 * download, not defects in the agent. A decode failure must never be able to
 * masquerade as a review result, so every shape the connector can return is
 * pinned here.
 */
import { describe, expect, it } from 'vitest';

import { decodeConnectorFileContent } from '../services/skill/SkillBundleService';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const b64 = (value: string) => btoa(value);

describe('decodeConnectorFileContent', () => {
  it('reads the Power Automate $content envelope', () => {
    // The unhandled case. The old code looked only at `value`, so this object
    // stringified to "[object Object]" and atob threw on the leading bracket.
    const raw = { '$content-type': 'text/markdown', '$content': b64('# Onboarding') };
    expect(text(decodeConnectorFileContent(raw))).toBe('# Onboarding');
  });

  it('reads the OData value wrapper', () => {
    expect(text(decodeConnectorFileContent({ value: b64('hello') }))).toBe('hello');
  });

  it('reads a bare base64 string', () => {
    expect(text(decodeConnectorFileContent(b64('print("hi")')))).toBe('print("hi")');
  });

  it('strips a data URI prefix before decoding', () => {
    const raw = `data:text/html;base64,${b64('<h1>Welcome</h1>')}`;
    expect(text(decodeConnectorFileContent(raw))).toBe('<h1>Welcome</h1>');
  });

  it('accepts base64url and line-wrapped payloads', () => {
    const wrapped = b64('trainer notes').replace(/(.{4})/g, '$1\n');
    expect(text(decodeConnectorFileContent(wrapped))).toBe('trainer notes');
    const urlSafe = b64('a?b>c').replace(/\+/g, '-').replace(/\//g, '_');
    expect(text(decodeConnectorFileContent(urlSafe))).toBe('a?b>c');
  });

  it('returns raw text unchanged when the column is already decoded', () => {
    // Real markdown contains spaces and punctuation, so it is not valid base64.
    // The old code threw here; the file must survive verbatim instead.
    const md = '---\nname: onboarding-guide\n---\n# Guide\nUse the trainer notes.';
    expect(text(decodeConnectorFileContent(md))).toBe(md);
  });

  it('preserves non-ASCII text that is not base64', () => {
    const body = '# Übersicht — “quoted” café';
    expect(text(decodeConnectorFileContent(body))).toBe(body);
  });

  it('passes binary payloads straight through', () => {
    const bytes = new Uint8Array([0, 1, 2, 250]);
    expect(decodeConnectorFileContent(bytes)).toEqual(bytes);
    expect(decodeConnectorFileContent(bytes.buffer)).toEqual(bytes);
  });

  it('names the shape it could not read rather than throwing an atob error', () => {
    expect(() => decodeConnectorFileContent({ unexpected: 1 }))
      .toThrow(/unrecognised shape \(keys: unexpected\)/);
  });

  it('rejects a data URI whose payload is corrupt', () => {
    // Declared base64 that will not decode is corruption, not text, so it must
    // surface as an error rather than be silently stored as its own source.
    expect(() => decodeConnectorFileContent('data:text/plain;base64,@@@@'))
      .toThrow(/did not decode/);
  });

  it('round-trips an empty file to an empty result', () => {
    expect(text(decodeConnectorFileContent(''))).toBe('');
  });
});
