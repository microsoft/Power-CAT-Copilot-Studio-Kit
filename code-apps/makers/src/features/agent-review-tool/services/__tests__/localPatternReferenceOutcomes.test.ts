import { describe, expect, it, vi } from 'vitest';
import { StageAService } from '../StageAService';
import { inputDescription, makeResource, makeTopic, syntheticBot } from './stageAFixtures';
import { parseStandardComponents } from '../../utils/stageAParser';
import { buildLocalPatterns } from '../../utils/localPatternBuilder';

vi.mock('../BotService', () => ({ botService: {} }));

describe('fresh local pattern reference outcomes', () => {
  it('records field absences while using the component authoring name as the effective model name', async () => {
    const result = await new StageAService().executeStageAFromData(syntheticBot, [makeTopic({
      modelDisplayName: undefined, modelDescription: undefined, inputs: undefined,
      inputType: undefined, inputVariables: [{ name: 'inputValue' }],
      outputType: undefined, outputVariables: [{ name: 'outputValue' }],
    })]);
    const modelName = result.localPatterns.find(pattern => pattern.patternName === 'Missing Model Name')!;
    expect(modelName.assessmentStatus).toBe('pass');
    expect(modelName.affectedItems).toEqual([]);
    const fields = result.localPatterns.filter(pattern => pattern.patternId.match(/^local-pattern-[2-6]$/));
    expect(fields).toHaveLength(5);
    for (const pattern of fields) {
      expect(pattern.affectedItems).toHaveLength(1);
      expect(pattern.affectedItems?.[0].assessmentStatus).toBe('fail');
      expect(pattern.affectedItems?.[0].assessmentReason?.trim()).toBeTruthy();
    }
  });

  it.each(['input', 'output'])('keeps a confirmed %s description absence separate from a malformed declaration', async direction => {
    const result = await new StageAService().executeStageAFromData(syntheticBot, [makeTopic({
      inputs: undefined, [`${direction}Type`]: undefined,
      [`${direction}Variables`]: [{ name: 'good', displayName: 'Good' }, null],
    })]);
    const label = direction === 'input' ? 'Input' : 'Output';
    const description = result.localPatterns.find(pattern => pattern.patternName === `Missing ${label} Variable Description`)!;
    expect(description.assessmentStatus).toBe('fail');
    expect(description.description).toContain(`1 ${direction} variable(s)`);
    expect(description.affectedItems).toMatchObject([
      { variable: 'good', assessmentStatus: 'fail', evidence: { status: 'verified' } },
      { variable: '', assessmentStatus: 'not-assessed', evidence: { status: 'unverified' } },
    ]);
    expect(description.affectedItems?.every(item => item.assessmentReason?.trim())).toBe(true);
    const name = result.localPatterns.find(pattern => pattern.patternName === `Missing ${label} Variable Name`)!;
    expect(name.assessmentStatus).toBe('not-assessed');
    expect(name.affectedItems?.[0].assessmentStatus).toBe('not-assessed');
  });

  it.each(['input', 'output'] as const)('adds specific maker guidance for each blank %s description', async direction => {
    const result = await new StageAService().executeStageAFromData(syntheticBot, [makeTopic({
      inputs: undefined,
      [`${direction}Type`]: undefined,
      [`${direction}Variables`]: [{
        name: direction === 'input' ? 'ticketNumber' : 'companyName',
        displayName: direction === 'input' ? 'Ticket number' : 'Company name',
      }],
    }, 'Ticket details')]);
    const label = direction === 'input' ? 'Input' : 'Output';
    const variable = direction === 'input' ? 'ticketNumber' : 'companyName';
    const reference = result.localPatterns
      .find(pattern => pattern.patternName === `Missing ${label} Variable Description`)
      ?.affectedItems?.[0];

    expect(reference).toMatchObject({
      item: 'Ticket details',
      variable,
      current: '',
      assessmentStatus: 'fail',
      assessmentReason: expect.stringMatching(/no readable nonblank text/i),
      remediation: {
        findingTitle: expect.stringContaining(variable),
        makerAction: expect.stringMatching(/Ticket details.*ticketNumber|Ticket details.*companyName/),
        suggestedText: expect.stringContaining(direction === 'input' ? 'ticket number' : 'company name'),
        acceptanceCheck: expect.stringContaining(variable),
      },
    });
  });

  it('resolves a renamed schema alias and its placeholders to the exact topic display name', () => {
    const target = {
      ...makeTopic({}, 'view/edit specific booking details'),
      schemaname: 'synthetic.topic.vieweditspecificbookingdetails',
    };
    const bookingList = makeTopic({
      modelDescription: [
        'Do not use this topic when a booking number is present.',
        'Use (UserPortalSpecificBookingsdetails) instead.',
        'Examples with a booking number must use Topic 2.',
      ].join(' '),
    }, 'Booking List');
    const updateBooking = makeTopic({
      modelDescription: 'If a booking number is present, use Topic 2 directly.',
    }, 'Update Booking');
    const parsed = parseStandardComponents(
      [target, bookingList, updateBooking],
      syntheticBot.botId,
      syntheticBot.name,
      'generative',
      'zip',
    );

    const pattern = buildLocalPatterns(parsed)
      .find(item => item.patternName === 'Invalid Topic Reference');

    expect(pattern).toMatchObject({
      assessmentStatus: 'fail',
      severity: 'Medium',
      topics: ['Booking List', 'Update Booking'],
    });
    expect(pattern?.affectedItems).toHaveLength(3);
    expect(pattern?.affectedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        item: 'Booking List',
        current: 'UserPortalSpecificBookingsdetails',
        remediation: expect.objectContaining({
          suggestedText: 'Use /view/edit specific booking details instead.',
        }),
      }),
      expect.objectContaining({
        item: 'Booking List',
        current: 'Topic 2',
        remediation: expect.objectContaining({
          suggestedText: 'Use /view/edit specific booking details instead.',
        }),
      }),
      expect.objectContaining({
        item: 'Update Booking',
        current: 'Topic 2',
        remediation: expect.objectContaining({
          suggestedText: 'Use /view/edit specific booking details instead.',
        }),
      }),
    ]));
  });

  it('reports an internal routing name without inventing an ambiguous target', () => {
    const source = makeTopic({
      modelDescription: 'Use (UserSpecificBookingDetails) instead.',
    }, 'Booking List');
    const parsed = parseStandardComponents([
      source,
      makeTopic({}, 'View specific booking details'),
      makeTopic({}, 'Edit specific booking details'),
    ], syntheticBot.botId, syntheticBot.name, 'generative', 'zip');

    const pattern = buildLocalPatterns(parsed)
      .find(item => item.patternName === 'Invalid Topic Reference');

    expect(pattern).toMatchObject({
      assessmentStatus: 'fail',
      affectedItems: [expect.objectContaining({
        item: 'Booking List',
        current: 'UserSpecificBookingDetails',
        remediation: expect.objectContaining({
          makerAction: expect.stringContaining('exact target selected through'),
        }),
      })],
    });
    expect(pattern?.affectedItems?.[0].remediation?.suggestedText).toBeUndefined();
  });

  it.each(['input', 'output'])('validates fresh %s references from a legacy missing-fields payload', direction => {
    const parsed = parseStandardComponents([makeTopic({
      inputs: undefined, [`${direction}Type`]: undefined,
      [`${direction}Variables`]: [{ name: 'good', displayName: 'Good' }, null],
    })], syntheticBot.botId, syntheticBot.name, 'generative', 'zip');
    const pattern = buildLocalPatterns({ ...parsed, missingFieldEvidence: undefined })
      .find(item => item.patternName === `Missing ${direction === 'input' ? 'Input' : 'Output'} Variable Description`)!;
    expect(pattern.description).toContain(`1 ${direction} variable(s)`);
    expect(pattern.affectedItems?.map(item => item.assessmentStatus)).toEqual(['fail', 'not-assessed']);
    expect(pattern.affectedItems?.[1].setting).toBe(`${direction === 'input' ? 'Input' : 'Output'} variable description`);
  });

  it('does not confirm a legacy missing-field claim contradicted by the reviewed description', () => {
    const component = makeTopic();
    const parsed = parseStandardComponents([component], syntheticBot.botId, syntheticBot.name, 'generative', 'zip');
    const pattern = buildLocalPatterns({
      ...parsed, missingFieldEvidence: undefined,
      missingFields: {
        ...parsed.missingFields,
        missingInputVariableDescriptions: [{ topic: component.name!, variable: 'minimumSeats' }],
      },
    }).find(item => item.patternName === 'Missing Input Variable Description')!;
    expect(pattern.assessmentStatus).toBe('not-assessed');
    expect(pattern.affectedItems?.[0]).toMatchObject({ current: inputDescription, assessmentStatus: 'not-assessed' });
  });

  it('does not borrow a current value from an ambiguous legacy declaration', () => {
    const component = makeTopic({
      inputs: undefined, inputType: undefined,
      inputVariables: [{ name: 'shared', description: 'First value.' }, { name: 'shared', description: 'Second value.' }],
    });
    const parsed = parseStandardComponents([component], syntheticBot.botId, syntheticBot.name, 'generative', 'zip');
    const pattern = buildLocalPatterns({
      ...parsed, missingFieldEvidence: undefined,
      missingFields: { ...parsed.missingFields, missingInputVariableDescriptions: [{ topic: component.name!, variable: 'shared' }] },
    }).find(item => item.patternName === 'Missing Input Variable Description')!;
    expect(pattern.assessmentStatus).toBe('not-assessed');
    expect(pattern.affectedItems?.[0].current).toBeUndefined();
    expect(pattern.affectedItems?.[0].evidence?.quote).toBeUndefined();
  });

  it.each([
    { mode: true, expected: 'fail' }, { mode: false, expected: 'not-applicable' },
    { mode: undefined, expected: 'not-assessed' },
  ] as const)('records explicit child-description outcomes for mode $mode', async example => {
    const resource = makeResource('Workshop child', { kind: 'AgentDialog', beginDialog: {} });
    const result = await new StageAService().executeStageAFromData({
      ...syntheticBot, configuration: JSON.stringify({ settings: { GenerativeActionsEnabled: example.mode } }),
    }, [resource]);
    const pattern = result.localPatterns.find(item => item.patternName === 'Missing Child Agent Description')!;
    expect(pattern.assessmentStatus).toBe(example.expected);
    expect(pattern.affectedItems?.[0]).toMatchObject({
      assessmentStatus: example.expected, componentId: resource.botcomponentid, schemaName: resource.schemaname,
    });
    expect(pattern.affectedItems?.[0].assessmentReason?.trim()).toBeTruthy();
  });

  it('does not confirm a child-description reference without resource identity', async () => {
    const result = await new StageAService().executeStageAFromData(syntheticBot, [{
      ...makeResource('Workshop child', { kind: 'AgentDialog', beginDialog: {} }),
      botcomponentid: '', schemaname: '',
    }]);
    const pattern = result.localPatterns.find(item => item.patternName === 'Missing Child Agent Description')!;
    expect(pattern.affectedItems?.[0]).toMatchObject({
      item: 'Workshop child', assessmentStatus: 'not-assessed', evidence: { status: 'unavailable' },
    });
  });
});
