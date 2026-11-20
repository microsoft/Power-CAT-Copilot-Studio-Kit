// Keep aligned with MODEL_DISPLAY_NAMES in agent-change-tracker/ChangeTimeline.
export const MODEL_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  gpt41: 'GPT-4.1',
  gpt5chat: 'GPT-5 Chat',
  gpt5auto: 'GPT-5 Auto',
  gpt5reasoning: 'GPT-5 Reasoning',
  gpt56reasoning: 'GPT 5.6 Sol',
  gpt56reasoningluna: 'GPT 5.6 Luna',
  gpt56reasoningterra: 'GPT 5.6 Terra',
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-6-sol': 'GPT-6 Sol',
  'gpt-6-1-sol': 'GPT-6.1 Sol',
  'gpt-6-luna': 'GPT-6 Luna',
  gpt56chat: 'GPT Chat Latest',
  gpt51chatthinky: 'GPT-5.3 Chat',
  gpt51reasoning: 'GPT-5.4 Reasoning',
  gpt55chat: 'GPT-5.5 Chat',
  sonnet4: 'Claude Sonnet 4.5',
  sonnet5: 'Claude Sonnet 5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-haiku-5-5': 'Claude Haiku 5.5',
  'claude-opus-5': 'Claude Opus 5',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'sonnet4-5': 'Claude Sonnet 4.5',
  'sonnet-4-0': 'Claude Sonnet 4.5',
  sonnet46: 'Claude Sonnet 4.6',
  opus41: 'Claude Opus 4.6',
  'opus4-1': 'Claude Opus 4.6',
  opus47: 'Claude Opus 4.7',
  opus48: 'Claude Opus 4.8',
  fable5: 'Claude Fable 5',
  'claude-fable-5-1': 'Claude Fable 5.1',
  grok4: 'Grok 4.2',
};

export function modelDisplayName(value: string | undefined): string {
  const raw = value?.trim() ?? '';
  return Object.hasOwn(MODEL_DISPLAY_NAMES, raw.toLowerCase())
    ? MODEL_DISPLAY_NAMES[raw.toLowerCase()]
    : raw;
}
