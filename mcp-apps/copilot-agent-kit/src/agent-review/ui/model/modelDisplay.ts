export { prettyModelSeries } from '../../core/index.js';

export type ModelProvider = 'claude' | 'openai' | null;

export function modelProvider(text: string | undefined | null): ModelProvider {
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (/(claude|sonnet|opus|haiku)/.test(normalized)) return 'claude';
  if (/(gpt|openai|davinci|\bo[13]\b)/.test(normalized)) return 'openai';
  return null;
}
