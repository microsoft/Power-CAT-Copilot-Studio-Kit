import type { EvaluationResultVM } from './model-assessment';
import { MODEL_DISPLAY_NAMES, modelDisplayName } from './model-display';
import { withMetricDisplayNames } from './metric-display';

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const nextStep = /^(?:review|rerun|re-run|investigate|consider|monitor|keep|check|retry|validate|inspect)\b|^(?:next step|next action)\s*:|\b(?:recommended next action|next action (?:is|should))/i;
const identifiers = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi;
const modelNames = new RegExp(
  `\\b(?:${Object.keys(MODEL_DISPLAY_NAMES).sort((a, b) => b.length - a.length).join('|')})\\b`,
  'gi',
);

// Headed prompt output: one line per point, e.g. "🧭 **Overall:** ..." or "⚠️ Needs attention: ...".
const headedLine = /^\s*((?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D)*)\s*(?:\*\*\s*([^*\n]{1,40}?)\s*:?\s*\*\*\s*:?|([^*:\n]{1,40}):)\s*(.*)$/u;
// An icon and a short label alone on a line, e.g. "✅ Works well".
const bareHeading = /^((?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D)+)\s*([^:.!?\n]{1,40})$/u;
// Markdown list markers; the UI draws its own bullets.
const listMarker = /^(?:[-*•–]|\d+[.)])\s+/;

const unbold = (value: string) => value.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*\*/g, '').trim();

export interface AnalysisSection {
  icon: string;
  heading: string;
  items: string[];
}

export interface AnalysisPresentation {
  summary: string;
  findings: string[];
  nextStep?: string;
  /** Present only when the analysis is written as headed lines. */
  sections?: AnalysisSection[];
}

interface ParsedLine {
  icon: string;
  heading?: string;
  body: string;
  text: string;
  bare?: boolean;
}

function parseLine(raw: string): ParsedLine {
  const bulleted = listMarker.test(raw);
  const text = raw.replace(listMarker, '');
  const match = headedLine.exec(text);
  const icon = match?.[1] ?? '';
  // A plain "Label:" counts as a heading only after an icon, so ordinary sentences stay text.
  // A bulleted "**Label:** text" without an icon is a point under the current heading.
  const heading = match && (!bulleted || icon) ? (match[2] ?? (icon ? match[3] : undefined))?.trim() : undefined;
  if (match && heading) return { icon, heading, body: match[4], text };
  const bare = bareHeading.exec(unbold(text));
  if (bare) return { icon: bare[1], heading: bare[2].trim(), body: '', text, bare: true };
  return { icon: '', body: text, text };
}

function headedSections(text: string, readable: (value: string) => string): AnalysisSection[] | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(parseLine);
  const sections: AnalysisSection[] = [];
  let headed = 0;
  lines.forEach((line, index) => {
    const next = lines[index + 1];
    // A bare "✅ Works well" line is a heading only when points follow it.
    const heading = line.bare && (!next || next.heading) ? undefined : line.heading;
    const body = readable(unbold(heading ? line.body : line.text));
    if (heading) {
      headed += 1;
      const last = sections.at(-1);
      if (last && last.heading.toLowerCase() === heading.toLowerCase()) {
        if (body) last.items.push(body);
      } else {
        sections.push({ icon: line.icon, heading, items: body ? [body] : [] });
      }
    } else if (body) {
      const last = sections.at(-1);
      if (last) last.items.push(body);
      else sections.push({ icon: '', heading: '', items: [body] });
    }
  });
  return headed >= 2 ? sections.filter((section) => section.items.length > 0) : undefined;
}

export function presentAnalysis(text: string, results: EvaluationResultVM[]): AnalysisPresentation {
  const questions = new Map<string, string>();
  for (const result of results) {
    const id = result.testCaseId?.trim();
    const question = result.question?.trim();
    if (id && question && question.toLowerCase() !== id.toLowerCase()) {
      questions.set(id.toLowerCase(), question);
    }
  }

  // Segment before substituting question labels, which can contain punctuation.
  const namedModels = withMetricDisplayNames(
    text.trim().replace(modelNames, (model) => modelDisplayName(model)),
  );
  const readable = (sentence: string) => sentence
    .replace(identifiers, (id) => {
      const question = questions.get(id.toLowerCase());
      return question ? `“${question}”` : id;
    });

  const sections = headedSections(namedModels, readable);
  if (sections) {
    const [first, ...rest] = sections.flatMap((section) => section.items);
    return { summary: first ?? '', findings: rest, sections };
  }

  const sentences = Array.from(segmenter.segment(namedModels), ({ segment }) => segment.trim().replace(listMarker, ''))
    .filter(Boolean);
  const action = sentences.length > 1 && nextStep.test(sentences.at(-1) ?? '')
    ? sentences.pop()
    : undefined;

  return {
    summary: readable(sentences.shift() ?? ''),
    findings: sentences.map(readable),
    nextStep: action ? readable(action) : undefined,
  };
}
