import { describe, expect, it } from 'vitest';
import type { AgentHarnessKind, BotMetadata } from '../../contracts/ReviewResult';
import { findOriginalAgents, isUpgradedCopyName, originalNameOf } from '../upgradePairing';

function agent(botId: string, name: string, harness?: AgentHarnessKind): BotMetadata {
  return {
    botId,
    name,
    statusCode: 0,
    componentIdUnique: `${botId}-component`,
    ...(harness ? { harness } : {}),
  };
}

describe('upgradePairing', () => {
  it.each([
    'Expense helper (Upgraded)',
    '  Expense helper (upgraded)  ',
    'Expense helper(UPGRADED)',
  ])('accepts "%s" as the name of an upgraded copy', (name) => {
    expect(isUpgradedCopyName(name)).toBe(true);
    expect(originalNameOf(name)).toBe('Expense helper');
  });

  it.each([
    'Expense helper',
    'Expense helper (Upgraded) v2',
    '(Upgraded)',
    '',
  ])('does not accept "%s" as the name of an upgraded copy', (name) => {
    expect(isUpgradedCopyName(name)).toBe(false);
  });

  it('finds only the standard agents that have the same trimmed name', () => {
    const agents = [
      agent('a1', 'Expense helper', 'standard'),
      agent('a2', 'Expense helper '),
      agent('a3', 'expense helper', 'standard'),
      agent('a4', 'Expense helper', 'copilot'),
      agent('a5', 'Expense helper (Upgraded)', 'copilot'),
      agent('a6', 'Expense helper', 'unsupported'),
    ];

    expect(findOriginalAgents(' Expense helper (Upgraded) ', agents)).toEqual({
      candidates: [agents[0], agents[1]],
      match: 'exact',
    });
  });

  it('finds no agent when the name is not the name of an upgraded copy', () => {
    expect(findOriginalAgents('Expense helper', [agent('a1', 'Expense helper', 'standard')]).candidates).toEqual([]);
  });

  it('finds the standard agent whose name starts with the shorter name of the copy, word by word', () => {
    const agents = [
      agent('a1', 'Emp IT Helpdesk Agent - Contoso', 'standard'),
      agent('a2', 'Emp ITSM bot', 'standard'),
      agent('a3', 'Employee IT helpdesk', 'standard'),
      agent('a4', 'Emp', 'standard'),
      agent('a5', 'Emp IT Helpdesk Agent - Contoso', 'copilot'),
      agent('a6', 'Emp IT helper', 'unsupported'),
      agent('a7', 'Emp IT (Upgraded)', 'copilot'),
    ];

    expect(findOriginalAgents('Emp IT (Upgraded)', agents)).toEqual({ candidates: [agents[0]], match: 'prefix' });
  });

  it('uses only the exact name match when a standard agent has the original name', () => {
    const agents = [
      agent('a1', 'Emp IT Helpdesk Agent - Contoso', 'standard'),
      agent('a2', 'Emp IT', 'standard'),
    ];

    expect(findOriginalAgents('Emp IT (Upgraded)', agents)).toEqual({ candidates: [agents[1]], match: 'exact' });
  });

  it('finds all the standard agents whose names start with the name of the copy, in any case and punctuation', () => {
    const agents = [
      agent('a1', 'Emp IT Helpdesk', 'standard'),
      agent('a2', 'emp-it (EU)'),
    ];

    expect(findOriginalAgents('Emp IT (Upgraded)', agents)).toEqual({ candidates: agents, match: 'prefix' });
  });

  it('finds no agent when the name of the copy has no letters or digits', () => {
    expect(findOriginalAgents('-- (Upgraded)', [agent('a1', 'Expense helper', 'standard')]).candidates).toEqual([]);
  });
});
