import { describe, expect, it, vi } from 'vitest';
import {
  agentHarnessLabel,
  agentSelectorLabel,
  resolveSavedReviewHarness,
  startReviewForHarness,
} from '../agentHarness';

function makeHandlers() {
  return { standard: vi.fn(), copilot: vi.fn(), unsupported: vi.fn() };
}

describe('startReviewForHarness', () => {
  it('calls only the unsupported handler for an unsupported harness', () => {
    const handlers = makeHandlers();
    startReviewForHarness('unsupported', handlers);
    expect(handlers.unsupported).toHaveBeenCalledTimes(1);
    expect(handlers.copilot).not.toHaveBeenCalled();
    expect(handlers.standard).not.toHaveBeenCalled();
  });

  it('calls only the Copilot handler for the Microsoft Copilot harness', () => {
    const handlers = makeHandlers();
    startReviewForHarness('copilot', handlers);
    expect(handlers.copilot).toHaveBeenCalledTimes(1);
    expect(handlers.unsupported).not.toHaveBeenCalled();
    expect(handlers.standard).not.toHaveBeenCalled();
  });

  it('calls only the standard handler for the standard harness or no harness', () => {
    for (const harness of ['standard', undefined] as const) {
      const handlers = makeHandlers();
      startReviewForHarness(harness, handlers);
      expect(handlers.standard).toHaveBeenCalledTimes(1);
      expect(handlers.unsupported).not.toHaveBeenCalled();
      expect(handlers.copilot).not.toHaveBeenCalled();
    }
  });
});

describe('resolveSavedReviewHarness', () => {
  it('uses the harness of the saved review first', () => {
    expect(resolveSavedReviewHarness({ harness: 'unsupported', reviewHarness: 'copilot' }, 'unsupported')).toBe('copilot');
    expect(resolveSavedReviewHarness({ harness: 'unsupported', reviewHarness: 'standard' }, 'unsupported')).toBe('standard');
    expect(resolveSavedReviewHarness({ harness: 'copilot', reviewHarness: 'standard' }, 'copilot')).toBe('standard');
  });

  it('uses the agent harness when the saved review does not state a harness', () => {
    expect(resolveSavedReviewHarness({ harness: 'copilot' }, undefined)).toBe('copilot');
    expect(resolveSavedReviewHarness(undefined, 'copilot')).toBe('copilot');
    expect(resolveSavedReviewHarness({ harness: 'standard' }, 'standard')).toBe('standard');
    expect(resolveSavedReviewHarness({ harness: 'unsupported' }, 'unsupported')).toBe('standard');
    expect(resolveSavedReviewHarness(undefined, undefined)).toBe('standard');
  });
});

describe('agentHarnessLabel', () => {
  it('gives one label for each harness', () => {
    expect(agentHarnessLabel('standard')).toBe('Standard');
    expect(agentHarnessLabel('copilot')).toBe('Microsoft Copilot');
    expect(agentHarnessLabel('unsupported')).toBe('Unsupported harness');
    expect(agentHarnessLabel(undefined)).toBe('Standard');
  });
});

describe('agentSelectorLabel', () => {
  it('adds the harness label only for an unsupported harness', () => {
    expect(agentSelectorLabel('Future agent', 'unsupported')).toBe('Future agent (Unsupported harness)');
    expect(agentSelectorLabel('Copilot agent', 'copilot')).toBe('Copilot agent');
    expect(agentSelectorLabel('Standard agent', 'standard')).toBe('Standard agent');
    expect(agentSelectorLabel('Old agent', undefined)).toBe('Old agent');
  });
});
