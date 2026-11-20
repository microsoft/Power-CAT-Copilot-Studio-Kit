import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModelTransition } from '../ModelTransition';

describe('ModelTransition', () => {
  it('renders the baseline badge and friendly current model without a placeholder dash', () => {
    const html = renderToStaticMarkup(
      <ModelTransition changeType="Baseline" currentModel="GPT5Reasoning" />,
    );
    expect(html).toContain('Baseline');
    expect(html).toContain('GPT-5 Reasoning');
    expect(html).not.toContain('—');
    expect(html).not.toContain('→');
    expect(html).not.toContain('GPT5Reasoning');
  });

  it('formats both models for an ordinary transition', () => {
    const html = renderToStaticMarkup(
      <ModelTransition changeType="Model Changed" previousModel="GPT5Auto" currentModel="GPT51ChatThinky" />,
    );
    expect(html).toContain('GPT-5 Auto');
    expect(html).toContain('GPT-5.3 Chat');
    expect(html).toContain('<span>GPT-5 Auto → GPT-5.3 Chat</span>');
    expect(html).not.toContain('Baseline');
  });

  it('treats an empty previous model as baseline', () => {
    const html = renderToStaticMarkup(
      <ModelTransition changeType="" previousModel=" " currentModel="FutureModel" />,
    );
    expect(html).toContain('Baseline');
    expect(html).toContain('FutureModel');
    expect(html).not.toContain('—');
  });

  it('retains a placeholder when the current model is missing', () => {
    const html = renderToStaticMarkup(<ModelTransition changeType="Baseline" />);
    expect(html).toContain('Baseline');
    expect(html).toContain('—');
  });
});
