import { describe, expect, it } from 'vitest';
import { MODEL_DISPLAY_NAMES, modelDisplayName } from '../model-display';

describe('modelDisplayName', () => {
  it.each([
    ['GPT5Chat', 'GPT-5 Chat'],
    ['GPT55Chat', 'GPT-5.5 Chat'],
    ['GPT56Reasoning', 'GPT 5.6 Sol'],
    ['GPT56ReasoningLuna', 'GPT 5.6 Luna'],
    ['GPT56ReasoningTerra', 'GPT 5.6 Terra'],
    ['gpt-6-astra', 'GPT-6 Astra'],
    ['gpt-6-sol', 'GPT-6 Sol'],
    ['Sonnet46', 'Claude Sonnet 4.6'],
    ['Sonnet5', 'Claude Sonnet 5'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5'],
    ['claude-haiku-5-5', 'Claude Haiku 5.5'],
    ['Opus48', 'Claude Opus 4.8'],
    ['claude-opus-5', 'Claude Opus 5'],
    ['Fable5', 'Claude Fable 5'],
    ['claude-fable-5-1', 'Claude Fable 5.1'],
  ])('matches the supplied catalog name for %s', (raw, expected) => {
    expect(modelDisplayName(raw)).toBe(expected);
  });

  it.each([
    ['GPT41', 'GPT-4.1'],
    ['GPT5Chat', 'GPT-5 Chat'],
    ['GPT5Auto', 'GPT-5 Auto'],
    ['GPT5Reasoning', 'GPT-5 Reasoning'],
    ['GPT51ChatThinky', 'GPT-5.3 Chat'],
    ['GPT51Reasoning', 'GPT-5.4 Reasoning'],
    ['GPT55Chat', 'GPT-5.5 Chat'],
    ['GPT56Chat', 'GPT Chat Latest'],
    ['Sonnet4', 'Claude Sonnet 4.5'],
    ['sonnet4-5', 'Claude Sonnet 4.5'],
    ['sonnet-4-0', 'Claude Sonnet 4.5'],
    ['Sonnet46', 'Claude Sonnet 4.6'],
    ['Opus41', 'Claude Opus 4.6'],
    ['opus4-1', 'Claude Opus 4.6'],
    ['Opus47', 'Claude Opus 4.7'],
    ['Opus48', 'Claude Opus 4.8'],
    ['Grok4', 'Grok 4.2'],
  ])('matches the standard catalog series or hint %s', (raw, expected) => {
    expect(modelDisplayName(raw)).toBe(expected);
  });

  it.each(Object.entries(MODEL_DISPLAY_NAMES))('formats %s', (raw, expected) => {
    expect(modelDisplayName(raw)).toBe(expected);
    expect(modelDisplayName(` ${raw.toUpperCase()} `)).toBe(expected);
  });

  it('preserves unknown model names', () => {
    expect(modelDisplayName(' FutureModel ')).toBe('FutureModel');
    expect(modelDisplayName('GPT-5 Reasoning')).toBe('GPT-5 Reasoning');
    expect(modelDisplayName('constructor')).toBe('constructor');
  });

  it('leaves missing values to the calling UI', () => {
    expect(modelDisplayName(undefined)).toBe('');
    expect(modelDisplayName(' ')).toBe('');
  });
});
