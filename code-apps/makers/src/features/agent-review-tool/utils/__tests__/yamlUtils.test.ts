import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import { extractVariables, preprocessYaml } from '../yamlUtils';

const description = 'The minimum number of seats required.';
const binding = {
  kind: 'AutomaticTaskInput',
  propertyName: 'minimumSeats',
  description,
};

describe('extractVariables input descriptions', () => {
  it.each([undefined, '', ' \t\n', null, false, 12, { text: 'Invalid' }, ['Invalid']].map(value => [value]))(
    'uses the bound description when the property description is %j',
    (propertyDescription) => {
      const properties = {
        minimumSeats: {
          displayName: 'Minimum seats',
          type: 'Number',
          description: propertyDescription,
        },
      };

      expect(extractVariables(properties, [binding])).toEqual([{
        VariableName: 'minimumSeats',
        displayName: 'Minimum seats',
        VariableDescription: description,
      }]);
      expect(properties.minimumSeats.description).toBe(propertyDescription);
    },
  );

  it('keeps a populated property description unchanged when the binding conflicts', () => {
    const existingDescription = '  Use the reserved seat count.\n';

    expect(extractVariables({
      minimumSeats: { displayName: 'Minimum seats', description: existingDescription },
    }, [binding])[0].VariableDescription).toBe(existingDescription);
  });

  it.each([false, true])('matches exact property names with reversed inputs: %s', (reverse) => {
    const inputs = [
      { ...binding, propertyName: 'unrelated', description: 'Not a declared input.' },
      { ...binding, propertyName: 'workshopCode', description: 'The workshop code.' },
      binding,
    ];

    expect(extractVariables({
      minimumSeats: { displayName: 'Workshop code' },
      workshopCode: { displayName: 'Minimum seats' },
      other: { displayName: 'Minimum seats' },
      MinimumSeats: { displayName: 'Minimum seats' },
    }, reverse ? [...inputs].reverse() : inputs)).toEqual([
      { VariableName: 'minimumSeats', displayName: 'Workshop code', VariableDescription: description },
      { VariableName: 'workshopCode', displayName: 'Minimum seats', VariableDescription: 'The workshop code.' },
      { VariableName: 'other', displayName: 'Minimum seats', VariableDescription: undefined },
      { VariableName: 'MinimumSeats', displayName: 'Minimum seats', VariableDescription: undefined },
    ]);
  });

  it.each([undefined, null, '', ' \t', false, 8, { text: 'Invalid' }, ['Invalid']].map(value => [value]))(
    'keeps a missing description missing for malformed or empty binding text: %j',
    (invalidDescription) => {
      const result = extractVariables({ minimumSeats: { displayName: 'Minimum seats' } }, [
        null,
        false,
        'minimumSeats',
        ['minimumSeats'],
        { ...binding, propertyName: null },
        { ...binding, propertyName: 123 },
        { ...binding, propertyName: ' ' },
        { ...binding, propertyName: 'Minimum seats' },
        { ...binding, propertyName: ' minimumSeats ' },
        { ...binding, kind: 'ManualTaskInput' },
        { propertyName: 'minimumSeats', description },
        { ...binding, description: invalidDescription },
      ]);

      expect(result).toEqual([{
        VariableName: 'minimumSeats',
        displayName: 'Minimum seats',
        VariableDescription: undefined,
      }]);
    },
  );

  it.each([undefined, null, '', 42, false, {}, binding])(
    'does not infer a description from a non-array inputs value: %j',
    (inputs) => {
      expect(extractVariables({ minimumSeats: {} }, inputs)[0].VariableDescription)
        .toBeUndefined();
    },
  );

  it('uses the first nonblank matching binding and preserves its exact text', () => {
    const firstDescription = '  First bound description.\n';
    expect(extractVariables({ minimumSeats: {} }, [
      { ...binding, description: ' ' },
      { ...binding, description: firstDescription },
      binding,
    ])[0].VariableDescription).toBe(firstDescription);
  });

  it.each([null, 'Number', 5, false, [], { description: 42, displayName: false }].map(value => [value]))(
    'retains a declared variable with malformed metadata: %j',
    (value) => {
      expect(extractVariables({ minimumSeats: value })).toEqual([{
        VariableName: 'minimumSeats',
        displayName: undefined,
        VariableDescription: undefined,
      }]);
      expect(extractVariables({ minimumSeats: value }, [binding])[0])
        .toMatchObject({ VariableName: 'minimumSeats', VariableDescription: description });
    },
  );

  it('preserves supported legacy array and object formats without binding metadata', () => {
    expect(extractVariables([
      { name: 'named', displayName: 'Named input', description: 'Named description.' },
      { VariableName: 'alias', displayName: 'Alias input', VariableDescription: 'Alias description.' },
      { name: 'both', description: 'Primary description.', VariableDescription: 'Alias description.' },
      'bare',
    ])).toEqual([
      { VariableName: 'named', displayName: 'Named input', VariableDescription: 'Named description.' },
      { VariableName: 'alias', displayName: 'Alias input', VariableDescription: 'Alias description.' },
      { VariableName: 'both', displayName: undefined, VariableDescription: 'Primary description.' },
      { VariableName: 'bare' },
    ]);
    expect(extractVariables({
      named: { displayName: 'Named input', description: 'Named description.' },
    })).toEqual([{
      VariableName: 'named',
      displayName: 'Named input',
      VariableDescription: 'Named description.',
    }]);
  });

  it.each([undefined, [], [{ ...binding, propertyName: 'seats', description: 'Binding guidance.' }]])(
    'keeps a populated legacy alias ahead of a blank primary description and binding %j', inputs => {
      const declared = '  Declared seat guidance.\n';
      const variable = { name: 'seats', description: ' ', VariableDescription: declared };
      expect(extractVariables([variable], inputs)[0].VariableDescription).toBe(declared);
      expect(variable.description).toBe(' ');
      expect(variable.VariableDescription).toBe(declared);
    },
  );

  it('keeps malformed legacy entries visible as missing instead of throwing', () => {
    expect(extractVariables([null, false, { name: 12, description: ['Invalid'] }]))
      .toEqual(Array.from({ length: 3 }, () => ({
        VariableName: '',
        displayName: undefined,
        VariableDescription: undefined,
      })));
  });

  it('does not turn bindings into variables when there is no readable variable declaration', () => {
    for (const value of [undefined, null, false, '', 12]) {
      expect(extractVariables(value, [binding])).toEqual([]);
    }
  });
});

/**
 * YAML 1.2.2 section 5.3 reserves exactly two indicator characters —
 * `c-reserved ::= '@' | '`' ` — and Example 5.10 states the consequence:
 * "Reserved indicators can't start a plain scalar." One occurrence fails the whole
 * document, so an unquoted `@odata.*` property name silently discarded an entire
 * Copilot Studio tool definition and left the component classified as unknown.
 */
describe('preprocessYaml reserved indicator quoting', () => {
  const load = (raw: string) => yaml.load(preprocessYaml(raw)) as Record<string, unknown>;

  it('parses the two cases the YAML spec gives as errors (Example 5.10)', () => {
    expect(() => yaml.load('commercial-at: @text')).toThrow();
    expect(() => yaml.load('grave-accent: `text')).toThrow();

    expect(load('commercial-at: @text')).toEqual({ 'commercial-at': '@text' });
    expect(load('grave-accent: `text')).toEqual({ 'grave-accent': '`text' });
  });

  it('recovers a connector tool whose output property name is @odata.nextLink', () => {
    const raw = [
      'kind: TaskDialog',
      'modelDisplayName: Search for users (V2)',
      'outputs:',
      '  - propertyName: @odata.nextLink',
      '  - propertyName: value',
      'action:',
      '  kind: InvokeConnectorTaskAction',
    ].join('\n');

    expect(() => yaml.load(raw)).toThrow();

    const parsed = load(raw);
    expect(parsed.kind).toBe('TaskDialog');
    expect(parsed.modelDisplayName).toBe('Search for users (V2)');
    expect((parsed.action as Record<string, unknown>).kind).toBe('InvokeConnectorTaskAction');
    expect(parsed.outputs).toEqual([{ propertyName: '@odata.nextLink' }, { propertyName: 'value' }]);
  });

  it('leaves every other indicator untouched, because they are legal in value position', () => {
    expect(load('anchored: !!str &anchor value\nalias: *anchor'))
      .toEqual({ anchored: 'value', alias: 'value' });
    expect(load('literal: |\n  some\n  text\nfolded: >\n  some\n  text'))
      .toEqual({ literal: 'some\ntext\n', folded: 'some text\n' });
    expect(load('percent: 50% off')).toEqual({ percent: '50% off' });
  });

  it('only treats the first character as an indicator', () => {
    expect(load('mail: user@contoso.com')).toEqual({ mail: 'user@contoso.com' });
    expect(load('code: a`b')).toEqual({ code: 'a`b' });
  });

  it('escapes an embedded apostrophe so the quoted value round-trips exactly', () => {
    expect(load("owner: @o'brien")).toEqual({ owner: "@o'brien" });
  });
});
