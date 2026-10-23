export interface BotComponentParsedData {
  modelDisplayName?: string;
  modelDescription?: string;
  triggerQueries?: string[];
}

export interface ComponentInfo {
  name: string;
  description?: string;
  modelDisplayName?: string;
  modelDescription?: string;
  triggerQueries?: string[];
  rawData?: string;
}

export function parseBotComponentData(data?: string): BotComponentParsedData {
  if (!data) return {};
  const normalized = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parsed: BotComponentParsedData = {};
  const displayName = normalized.match(/^modelDisplayName:\s*(.+)$/m);
  if (displayName) {
    parsed.modelDisplayName = displayName[1].trim().replace(/^["']|["']$/g, "");
  }
  const description = normalized.match(/^modelDescription:\s*["']?(.+?)["']?\s*$/m);
  if (description) {
    const quoted = normalized.match(/modelDescription:\s*["']([^"']+)["']/s);
    parsed.modelDescription = (quoted?.[1] ?? description[1]).trim();
  }
  const queries = normalized.match(/triggerQueries:\s*\n((?:\s+-\s*.+\n?)+)/m);
  if (queries) {
    parsed.triggerQueries = queries[1]
      .split("\n")
      .map((line) => line.match(/^\s+-\s*(.+)$/)?.[1]?.trim())
      .filter((value): value is string => Boolean(value));
  }
  return parsed;
}
