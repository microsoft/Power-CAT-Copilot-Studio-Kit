import { describe, expect, it } from 'vitest';
import type { StageBTopicComponent } from '../../contracts/StageOutputs';
import { isSystemTopic } from '../systemTopic';

function topic(overrides: Partial<StageBTopicComponent> = {}): StageBTopicComponent {
  return { TopicName: 'Workshop Booking', TriggerKind: 'OnRecognizedIntent', ...overrides };
}

describe('isSystemTopic', () => {
  it.each([
    'OnConversationStart',
    'OnUnknownIntent',
    'OnSelectIntent',
    'OnError',
    'OnEscalate',
    'OnSignIn',
    'OnSystemRedirect',
  ])('identifies a topic with the %s trigger kind as a system topic', (triggerKind) => {
    expect(isSystemTopic(topic({ TopicName: 'Any name', TriggerKind: triggerKind }))).toBe(true);
  });

  it('identifies the standard Greeting topic from its trigger phrases', () => {
    expect(isSystemTopic(topic({ TopicName: 'Greeting', triggerQueries: ['Hello', 'Hi', 'Hey'] }))).toBe(true);
  });

  it('does not identify a custom topic named Greeting as a system topic', () => {
    expect(isSystemTopic(topic({ TopicName: 'Greeting', triggerQueries: ['say hello to the team'] }))).toBe(false);
  });

  it.each(['OnRecognizedIntent', 'OnRedirect'])(
    'does not identify a custom topic with the %s trigger kind as a system topic',
    (triggerKind) => {
      expect(isSystemTopic(topic({ TriggerKind: triggerKind }))).toBe(false);
    },
  );

  it('does not identify a topic without a trigger kind as a system topic', () => {
    expect(isSystemTopic(topic({ TriggerKind: undefined }))).toBe(false);
  });
});
