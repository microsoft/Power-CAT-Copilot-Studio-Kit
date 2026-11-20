/** Foundation-model provider inferred from a model name/series. */
export type ModelProvider = 'claude' | 'openai' | null;

/** Vendor prefix for a bare Claude family name, so the label matches the product picker. */
const CLAUDE_FAMILIES = ['sonnet', 'opus', 'haiku'];

/**
 * Formats a stored model series into the label Copilot Studio shows in its own
 * model picker.
 *
 * Three shapes occur in the wild and all must round-trip to a product label:
 *
 * | Stored          | Displayed          |
 * |-----------------|--------------------|
 * | `Sonnet46`      | `Claude Sonnet 4.6`|
 * | `claude-opus-5` | `Claude Opus 5`    |
 * | `GPT5Chat`      | `GPT-5 Chat`       |
 *
 * Anything unrecognised is returned unchanged rather than mangled — showing the
 * raw series is better than inventing a wrong product name.
 */
export function prettyModelSeries(series: string): string {
  const raw = series.trim();
  if (!raw) return raw;

  // Hyphenated form: claude-opus-5, claude-sonnet-4-6, gpt-5-chat
  if (raw.includes('-')) {
    const parts = raw.split('-').filter(Boolean);
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      // Join a bare major/minor pair back into one number: 4-6 -> 4.6
      if (/^\d+$/.test(p) && /^\d$/.test(parts[i + 1] ?? '')) {
        out.push(`${p}.${parts[i + 1]}`);
        i++;
        continue;
      }
      out.push(/^gpt$/i.test(p) ? 'GPT' : p.charAt(0).toUpperCase() + p.slice(1));
    }
    // "GPT 5 Chat" reads as "GPT-5 Chat" in the product.
    return out.join(' ').replace(/^GPT (\d)/, 'GPT-$1');
  }

  // GPT compact form: GPT5Chat, GPT56Reasoning
  const gpt = /^GPT(\d)(\d?)(.*)$/i.exec(raw);
  if (gpt) {
    const version = gpt[2] ? `${gpt[1]}.${gpt[2]}` : gpt[1];
    const suffix = gpt[3] ? ` ${gpt[3]}` : '';
    return `GPT-${version}${suffix}`;
  }

  // Claude compact form: Sonnet46 -> Claude Sonnet 4.6, Opus5 -> Claude Opus 5
  const claude = /^([A-Za-z]+)(\d)(\d?)$/.exec(raw);
  if (claude && CLAUDE_FAMILIES.includes(claude[1].toLowerCase())) {
    const family = claude[1].charAt(0).toUpperCase() + claude[1].slice(1).toLowerCase();
    const version = claude[3] ? `${claude[2]}.${claude[3]}` : claude[2];
    return `Claude ${family} ${version}`;
  }

  // Legacy behaviour for any other Xxx99 pattern.
  const generic = /^([A-Za-z]+)(\d)(\d)$/.exec(raw);
  return generic ? `${generic[1]} ${generic[2]}.${generic[3]}` : raw;
}

/**
 * Infers the foundation-model vendor from a model name or series so the UI can
 * surface the matching brand glyph. Returns null when the vendor is unknown.
 */
export function modelProvider(text: string | undefined | null): ModelProvider {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/(claude|sonnet|opus|haiku)/.test(t)) return 'claude';
  if (/(gpt|openai|davinci|\bo[13]\b)/.test(t)) return 'openai';
  return null;
}
