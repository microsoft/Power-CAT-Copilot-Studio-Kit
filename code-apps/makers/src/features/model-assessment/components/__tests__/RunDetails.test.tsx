import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RunDetails } from '../RunDetails';
import { formatWhen, type EvaluationRunVM } from '../../contracts/model-assessment';

describe('RunDetails date presentation', () => {
  it('renders a generated run name with the shared friendly date format', () => {
    const timestamp = '2026-09-15T04:07:41.243Z';
    const run: EvaluationRunVM = {
      id: 'run-1',
      name: `Customer Support Case Agent - ${timestamp}`,
      status: 'No Change',
      analysisStatus: 'Pending',
      regression: 'Not Assessed',
      pass: 0, fail: 0, error: 0, excluded: 0,
    };
    const html = renderToStaticMarkup(<RunDetails run={run} results={[]} />);
    expect(html).toContain(`Customer Support Case Agent - ${formatWhen(timestamp)}`);
    expect(html).not.toContain(timestamp);
    expect(run.name).toContain(timestamp);
  });
});
