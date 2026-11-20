export const MODEL_PARSER_VERSION = 'v2';

export function parseAgentConfiguration(configuration: unknown): {
  isHarness: boolean;
  model?: string;
} {
  if (typeof configuration !== 'string' || !configuration.trim()) return { isHarness: false };
  const config: unknown = JSON.parse(configuration);
  if (!config || typeof config !== 'object') return { isHarness: false };
  const recognizer = 'recognizer' in config ? config.recognizer : undefined;
  const isHarness = Boolean(
    recognizer && typeof recognizer === 'object' &&
    '$kind' in recognizer && recognizer.$kind === 'CLICopilotRecognizer',
  );
  if (!isHarness) return { isHarness: false };
  const settings = 'agentSettings' in config ? config.agentSettings : undefined;
  const model = settings && typeof settings === 'object' && 'model' in settings ? settings.model : undefined;
  const series = model && typeof model === 'object' && 'series' in model ? model.series : undefined;
  return { isHarness: true, model: typeof series === 'string' ? series.trim() || undefined : undefined };
}

/** Parse and normalize modelNameHint from a Copilot Studio component payload. */
export function parseModelNameHint(data: unknown): string | undefined {
  if (typeof data !== 'string') return undefined;
  const value = data.match(/modelNameHint:\s*([^\r\n]+)/i)?.[1]?.trim();
  if (!value) return undefined;
  const unquoted = value.replace(/^(["'])(.*)\1$/, '$2').trim();
  return unquoted || undefined;
}
