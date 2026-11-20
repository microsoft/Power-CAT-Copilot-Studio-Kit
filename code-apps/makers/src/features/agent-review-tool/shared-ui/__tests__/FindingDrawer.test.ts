/**
 * The drawer must show every field the review recorded.
 *
 * This exists because the failure it guards against is silent. A field the drawer forgets to render
 * does not throw, does not fail a type check and does not change a score — the reader simply never
 * learns that the rule had an acceptance check, and there is nothing on screen to suggest anything
 * is missing. That is exactly how `acceptanceCheck` was dropped before: it was produced by the AI
 * workflow, carried through the contract, and then quietly discarded at the last step.
 *
 * Rendered to static markup rather than into a DOM. Neither app ships jsdom or testing-library, and
 * adding both to assert "this string is on screen" would be a larger change than the thing it
 * verifies. `InlineDrawer` renders in place, so static markup contains the whole body.
 */
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FindingDrawer } from '../FindingDrawer';
import type { ConsolidatedRow, RuleMeta } from '../consolidatedFindings';

const RULE_META: RuleMeta = {
  description: 'Does every tool description state when the agent should choose it?',
  tags: ['quality', 'token-optimizer'],
  harnesses: ['copilot', 'standard'],
  references: ['copilot-tool-guidance'],
  fixSteps: ['Open the tool in Copilot Studio.', 'Rewrite the description to name the trigger.'],
  severity: 'high',
  pillar: 'tools',
};

function row(overrides: Partial<ConsolidatedRow> = {}): ConsolidatedRow {
  return {
    key: 'TOL-01',
    ruleId: 'TOL-01',
    title: 'Two tools answer the same request',
    family: 'Tools',
    tone: 'warning',
    bucket: 'fail',
    detection: 'ai',
    fact: 'Both "Lookup order" and "Find order" describe retrieving an order by id.',
    why: 'The orchestrator has no way to choose between them, so routing becomes arbitrary.',
    fix: 'Give each tool a description that names the case it is for.',
    acceptanceCheck: 'Ask "where is order 42" and confirm one tool is selected every time.',
    fixSteps: ['Open the duplicate tool.', 'Narrow its description to one case.'],
    confidence: 'high',
    suggestedText: 'Use when the customer supplies an order number.',
    affected: [{ id: 'tool-1', name: 'Lookup order', instanceKey: 'TOL-01:tool-1' }],
    evidence: [
      {
        id: 'TOL-01',
        family: 'Tools',
        severity: 'warning',
        title: 'Lookup order overlaps Find order',
        fact: 'description: "Retrieves an order."',
        fieldPath: 'bot.tools[0].description',
        acceptanceCheck: 'Re-run routing after editing this tool.',
        ai: true,
      },
    ],
    instanceKeys: ['TOL-01:tool-1'],
    ...overrides,
  };
}

function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

function drawer(overrides: Partial<ConsolidatedRow> = {}, ruleMeta?: (id: string) => RuleMeta | undefined): string {
  return render(
    createElement(FindingDrawer, {
      id: 'drawer-1',
      open: true,
      overlay: false,
      row: row(overrides),
      index: 0,
      total: 3,
      onPrev: () => {},
      onNext: () => {},
      onClose: () => {},
      ruleMeta,
    }),
  );
}

describe('FindingDrawer', () => {
  it('shows every field the finding recorded', () => {
    const html = drawer();

    // The six narrative fields a finding carries end to end, from the AI workflow to the screen.
    // The rule id is deliberately absent — see the dedicated test below.
    expect(html).toContain('Two tools answer the same request');
    expect(html).toContain('Both &quot;Lookup order&quot; and &quot;Find order&quot;');
    expect(html).toContain('The orchestrator has no way to choose between them');
    expect(html).toContain('Give each tool a description that names the case it is for.');
    expect(html).toContain('Ask &quot;where is order 42&quot;');
    expect(html).toContain('bot.tools[0].description');
  });

  it('leaves the rule id, family and harnesses off the tag row', () => {
    const html = drawer();

    // Each of these restates something the reader already has: the list row they clicked carries
    // the id, and the family and harness are the grouping they navigated through to reach it. The
    // fixture declares all three, so a regression here shows up as a reappearing badge.
    expect(html).not.toContain('TOL-01');
    expect(html).not.toContain('>Tools<');
    expect(html).not.toContain('>copilot<');
    expect(html).not.toContain('>standard<');

    // What the row does keep, in order.
    expect(html.indexOf('AI generated')).toBeLessThan(html.indexOf('Medium severity'));
    expect(html.indexOf('Medium severity')).toBeLessThan(html.indexOf('high confidence'));
  });

  it('labels each field so the reader knows which question it answers', () => {
    const html = drawer();

    expect(html).toContain('What we found');
    expect(html).toContain('Why it matters');
    expect(html).toContain('Recommendation');
    expect(html).toContain('How to confirm the fix');
  });

  it('shows the ordered steps, the suggested text and the model confidence', () => {
    const html = drawer();

    expect(html).toContain('Narrow its description to one case.');
    expect(html).toContain('Use when the customer supplies an order number.');
    expect(html).toContain('high confidence');
  });

  it('adds what the rule asks, which no finding carries', () => {
    const withMeta = drawer({}, () => RULE_META);

    // A rule's own question, tags and citations are registry facts. A passing rule produces no
    // finding at all, so without the lookup those rows would open an empty drawer.
    expect(withMeta).toContain('Does every tool description state when the agent should choose it?');
    expect(withMeta).toContain('token-optimizer');
    expect(withMeta).toContain('What this rule checks');
  });

  it('falls back to the rule\'s own stakes on a row that carries no finding', () => {
    const meta: RuleMeta = { ...RULE_META, why: 'Overlapping tools make routing unpredictable.' };

    // A passing rule produces no finding, so `why` is empty exactly where the reader most needs
    // to learn what the agent was held to. The registry answers instead of the drawer going blank.
    const passed = drawer(
      { tone: 'pass', bucket: 'pass', why: undefined, fact: undefined, fix: undefined, evidence: [] },
      () => meta,
    );
    expect(passed).toContain('Why it matters');
    expect(passed).toContain('Overlapping tools make routing unpredictable.');

    // The finding's own words still win wherever it has them.
    const failed = drawer({}, () => meta);
    expect(failed).toContain('The orchestrator has no way to choose between them');
    expect(failed).not.toContain('Overlapping tools make routing unpredictable.');
  });

  it('says the finding was written by a model, and only then', () => {
    expect(drawer()).toContain('AI-generated content may be incorrect.');
    expect(drawer({ detection: 'static' })).not.toContain('AI-generated content may be incorrect.');
  });

  it('renders each status with its own label', () => {
    expect(drawer({ tone: 'pass', bucket: 'pass' })).toContain('Pass');
    expect(drawer({ tone: 'warning', bucket: 'fail' })).toContain('Fail');
    expect(drawer({ tone: 'not-applicable', bucket: 'not-assessed' })).toContain('Not applicable');
    expect(drawer({ tone: 'not-assessed', bucket: 'not-assessed' })).toContain('Not assessed');
    expect(drawer({ tone: 'could-not-run', bucket: 'not-assessed' })).toContain('Could not run');
  });

  it('shows why a rule could not be judged instead of leaving the body blank', () => {
    const html = drawer({
      tone: 'could-not-run',
      bucket: 'not-assessed',
      note: 'The agent definition was not captured.',
      fact: undefined,
      why: undefined,
      fix: undefined,
      acceptanceCheck: undefined,
    });

    expect(html).toContain('The agent definition was not captured.');
  });

  it('tells the reader where they are in the list', () => {
    expect(drawer()).toContain('1 of 3');
  });

  it('renders nothing when no row is selected', () => {
    const html = render(
      createElement(FindingDrawer, {
        id: 'drawer-1',
        open: false,
        overlay: false,
        row: null,
        index: -1,
        total: 0,
        onPrev: () => {},
        onNext: () => {},
        onClose: () => {},
      }),
    );

    expect(html).not.toContain('Two tools answer the same request');
  });
});

/**
 * The manual-pass affordance in the drawer header.
 *
 * It used to be a prose block and a button in the drawer's footer, offered on any row that carried
 * instance keys — which included rows that had already passed and rules that never ran. Figma moved
 * it beside the status badge as a three-dot menu, and the gate moved with it.
 *
 * These assert the gate, not the menu's contents: Fluent renders a `MenuPopover` through a portal,
 * so the items never reach static markup. The trigger does, and the trigger is what the gate
 * controls.
 */
describe('FindingDrawer — the manual-pass gate', () => {
  function overridable(overrides: Partial<ConsolidatedRow> = {}): string {
    return render(
      createElement(FindingDrawer, {
        id: 'drawer-1',
        open: true,
        overlay: false,
        // The header menu stands in for rows with no components to decide between; a row that has
        // components gets the per-component menu in the body instead.
        row: row({ affected: [], instanceKeys: ['TOL-01'], ...overrides }),
        index: 0,
        total: 3,
        onPrev: () => {},
        onNext: () => {},
        onClose: () => {},
        onSetAside: () => {},
      }),
    );
  }

  const TRIGGER = 'Change the outcome for Two tools answer the same request';

  it('offers the menu on a finding the agent failed', () => {
    expect(overridable({ tone: 'error', bucket: 'fail' })).toContain(TRIGGER);
  });

  it('offers nothing on a finding that already passed', () => {
    expect(overridable({ tone: 'pass', bucket: 'pass' })).not.toContain(TRIGGER);
  });

  it('offers nothing on a rule that never ran', () => {
    expect(overridable({ tone: 'could-not-run', bucket: 'not-assessed' })).not.toContain(TRIGGER);
    expect(overridable({ tone: 'not-applicable', bucket: 'not-assessed' })).not.toContain(TRIGGER);
  });

  it('offers nothing when no rule instance stands behind the row', () => {
    expect(overridable({ tone: 'error', bucket: 'fail', instanceKeys: [] })).not.toContain(TRIGGER);
  });

  it('keeps the way back once the finding is set aside', () => {
    expect(overridable({ tone: 'ignored', bucket: 'pass', dismissed: true })).toContain(TRIGGER);
  });
});

/**
 * Exactly one surface offers the override, and the header is the last resort.
 *
 * A rule that fired once against the agent as a whole lists no components and no per-finding cards,
 * so the header menu is the only way to overrule it. It was unreachable before: the gate asked
 * whether components were listed, but the control behind it also required a rule instance, and the
 * rows that list no components are exactly the rows that often have none.
 */
describe('FindingDrawer - where the override is offered', () => {
  // The full attribute, because one label is a prefix of another: "…for Lookup order" would match
  // the card's "…for Lookup order overlaps Find order" and the assertion would prove nothing.
  const HEADER = 'aria-label="Change the outcome for Two tools answer the same request"';
  const CARD = 'aria-label="Change the outcome for Lookup order overlaps Find order"';
  const COMPONENT = 'aria-label="Change the outcome for Lookup order"';

  function at(overrides: Partial<ConsolidatedRow>): string {
    return render(
      createElement(FindingDrawer, {
        id: 'drawer-1',
        open: true,
        overlay: false,
        row: row({ affected: [], evidence: [], ...overrides }),
        index: 0,
        total: 3,
        onPrev: () => {},
        onNext: () => {},
        onClose: () => {},
        onSetAside: () => {},
      }),
    );
  }

  it('offers the header menu on a failure that lists nothing of its own', () => {
    expect(at({})).toContain(HEADER);
  });

  it('offers the header menu on a finding-only row, keyed against the row itself', () => {
    // These carry no rule outcome, so this menu is the only answer a reviewer has to them.
    expect(at({ key: 'finding::EXF-03::error', instanceKeys: ['finding::EXF-03::error'] }))
      .toContain(HEADER);
  });

  it('moves the decision onto each finding once the findings list names them apart', () => {
    const out = at({
      affected: [
        { id: 'tool-1', name: 'Lookup order', instanceKey: 'TOL-01:tool-1' },
        { id: 'tool-2', name: 'Find order', instanceKey: 'TOL-01:tool-2' },
      ],
      evidence: [
        { id: 'TOL-01', family: 'Tools', severity: 'warning', title: 'Lookup order overlaps Find order', componentIdUnique: 'tool-1', ai: true },
        { id: 'TOL-01', family: 'Tools', severity: 'warning', title: 'Find order overlaps Lookup order', componentIdUnique: 'tool-2', ai: true },
      ],
      instanceKeys: ['TOL-01:tool-1', 'TOL-01:tool-2'],
    });

    expect(out).toContain(CARD);
    expect(out).not.toContain(HEADER);
    expect(out).not.toContain(COMPONENT);
  });

  it('leaves the decision on the components list when no findings list is shown', () => {
    const out = at({
      affected: [{ id: 'tool-1', name: 'Lookup order', instanceKey: 'TOL-01:tool-1' }],
    });

    expect(out).toContain(COMPONENT);
    expect(out).not.toContain(HEADER);
  });

  it('still offers nothing at all on a row that passed', () => {
    expect(at({ tone: 'pass', bucket: 'pass' })).not.toContain(HEADER);
  });
});
