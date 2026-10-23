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
    // The closing quote must be the opening quote. Double-quoted YAML values use
    // backslash escapes; single-quoted values write a quote as ''.
    const quoted = normalized.match(/^modelDescription:\s*(?:"((?:[^"\\]|\\[\s\S])*)"|'((?:[^']|'')*)')/m);
    let value = description[1];
    if (quoted?.[1] !== undefined) {
      value = quoted[1].replace(/\\([\s\S])/g, (_escape, char: string) => (char === "n" ? "\n" : char === "t" ? "\t" : char));
    } else if (quoted?.[2] !== undefined) {
      value = quoted[2].replace(/''/g, "'");
    }
    parsed.modelDescription = value.trim();
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
