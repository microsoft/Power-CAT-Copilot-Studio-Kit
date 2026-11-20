/** Convert a bot icon column value to the image data URL required by map nodes. */
export function toAgentMapIconDataUrl(raw: unknown): string | undefined {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return undefined;
  if (value.startsWith('data:image/')) return value;
  if (value.startsWith('data:')) return undefined;
  return `data:image/png;base64,${value}`;
}
