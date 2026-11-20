import { dump } from 'js-yaml';
import type { BotComponent } from '../../contracts/ServiceContracts';

export const syntheticBot = {
  botId: 'workshop-agent', name: 'Workshop Agent',
  configuration: JSON.stringify({ settings: { GenerativeActionsEnabled: true } }),
};
export const inputDescription =
  'The minimum number of seats required. For example, 6 or 12.';

/** Create a synthetic resource; raw string payloads support unreadable-source cases. */
export function makeResource(name: string, value: Record<string, unknown> | string): BotComponent {
  return {
    ...makeTopic({}, name), content: '',
    data: typeof value === 'string' ? value : dump(value),
  };
}

/** Create a synthetic standard topic without executable external actions. */
export function makeTopic(
  metadata: Record<string, unknown> = {},
  name = 'Workshop Lookup',
): BotComponent {
  return {
    botcomponentid: `component-${name}`,
    componentidunique: `unique-${name}`,
    botid: syntheticBot.botId,
    componenttype: '9',
    name,
    schemaname: `synthetic_workshopagent.topic.${name.replaceAll(' ', '')}`,
    content: dump({
      kind: 'AdaptiveDialog',
      modelDisplayName: name,
      modelDescription: 'Find workshops with enough seats for the requested group.',
      inputs: [{
        kind: 'AutomaticTaskInput',
        propertyName: 'minimumSeats',
        description: inputDescription,
        entity: 'NumberPrebuiltEntity',
        shouldPromptUser: false,
      }],
      beginDialog: {
        kind: 'OnRecognizedIntent',
        id: 'main',
        intent: {},
        actions: [{
          kind: 'SendActivity',
          id: 'reply',
          activity: 'Workshop search complete.',
        }],
      },
      inputType: {
        properties: {
          minimumSeats: { displayName: 'Minimum seats', type: 'Number' },
          workshopCode: { displayName: 'Workshop code', type: 'String' },
        },
      },
      outputType: {
        properties: {
          workshopCount: {
            displayName: 'Workshop count',
            description: 'The number of workshops found.',
            type: 'Number',
          },
        },
      },
      ...metadata,
    }),
  };
}
