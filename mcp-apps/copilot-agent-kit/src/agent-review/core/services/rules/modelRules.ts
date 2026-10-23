import type { Rule } from './ruleTypes.js';

const CLAUDE_FAMILIES = ['sonnet', 'opus', 'haiku'];

export function prettyModelSeries(series: string): string {
  const raw = series.trim();
  if (!raw) return raw;
  if (raw.includes('-')) {
    const parts = raw.split('-').filter(Boolean);
    const out: string[] = [];
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (/^\d+$/.test(part) && /^\d$/.test(parts[index + 1] ?? '')) {
        out.push(`${part}.${parts[index + 1]}`);
        index++;
      } else {
        out.push(
          /^gpt$/i.test(part)
            ? 'GPT'
            : part.charAt(0).toUpperCase() + part.slice(1),
        );
      }
    }
    return out.join(' ').replace(/^GPT (\d)/, 'GPT-$1');
  }
  const gpt = /^GPT(\d)(\d?)(.*)$/i.exec(raw);
  if (gpt) {
    const version = gpt[2] ? `${gpt[1]}.${gpt[2]}` : gpt[1];
    return `GPT-${version}${gpt[3] ? ` ${gpt[3]}` : ''}`;
  }
  const claude = /^([A-Za-z]+)(\d)(\d?)$/.exec(raw);
  if (claude && CLAUDE_FAMILIES.includes(claude[1].toLowerCase())) {
    const family = claude[1].charAt(0).toUpperCase()
      + claude[1].slice(1).toLowerCase();
    const version = claude[3]
      ? `${claude[2]}.${claude[3]}`
      : claude[2];
    return `Claude ${family} ${version}`;
  }
  const generic = /^([A-Za-z]+)(\d)(\d)$/.exec(raw);
  return generic ? `${generic[1]} ${generic[2]}.${generic[3]}` : raw;
}

const FAMILY = 'Model';

export const modelRules: Rule[] = [
  {
    id: 'MDL-01', family: FAMILY, severity: 'info', referenceId: 'ms-select-model', kind: 'record',
    check(model) {
      if (!model.agentSettings.modelSeries) return null;
      return {
        id: 'MDL-01', family: FAMILY, severity: 'info', referenceId: 'ms-select-model', ai: false,
        title: `Model: ${prettyModelSeries(model.agentSettings.modelSeries)}`,
        fact: `agentSettings.model.series: ${model.agentSettings.modelSeries}`,
        why: 'The selected model affects reasoning depth, response quality, and speed.',
        fix: 'No action required — surfaced for the review record.',
      };
    },
  },
];
