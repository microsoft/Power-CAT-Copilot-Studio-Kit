import type { PatternTopic, StageBTopicComponent } from '../contracts/StageOutputs';

const STANDARD_SYSTEM_TOPIC_TRIGGERS: Readonly<Record<string, readonly string[]>> = {
  Greeting: ['hello', 'hi', 'hey', 'good morning', 'good afternoon'],
  'Thank you': ['thank you', 'thanks', 'much appreciated'],
  Goodbye: ['goodbye', 'good bye', 'bye', 'see you later', 'have a great day'],
  'Start Over': ['start over', 'restart', "let's begin again"],
};

function normalizeTrigger(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Identify a standard conversational system topic from its name and trigger signature.
 *
 * A name alone is not enough because makers can create a custom topic named
 * Greeting, Goodbye, Thank you, or Start Over.
 */
export function isStandardConversationalSystemTopic(
  topic: StageBTopicComponent,
): boolean {
  if (topic.TriggerKind !== 'OnRecognizedIntent') return false;
  const expected = STANDARD_SYSTEM_TOPIC_TRIGGERS[topic.TopicName];
  if (!expected || !Array.isArray(topic.triggerQueries)) return false;
  const actual = new Set(topic.triggerQueries.map(normalizeTrigger));
  return expected.filter((trigger) => actual.has(normalizeTrigger(trigger))).length >= 2;
}

/**
 * Create a matcher for finding items that belong to a standard conversational system topic.
 *
 * An item with a component ID matches only the ID of a standard topic. An item
 * without an ID matches by name only when no custom topic has the same name,
 * because a name alone cannot identify the component in that case.
 */
export function createStandardSystemTopicMatcher(
  topics: readonly StageBTopicComponent[],
): (item: Pick<PatternTopic, 'item' | 'componentId'>) => boolean {
  const standard = topics.filter(isStandardConversationalSystemTopic);
  const ids = new Set(standard.map((topic) => topic.TopicId?.trim()).filter((id): id is string => !!id));
  const customNames = new Set(topics
    .filter((topic) => !isStandardConversationalSystemTopic(topic))
    .map((topic) => topic.TopicName));
  const names = new Set(standard.map((topic) => topic.TopicName).filter((name) => !customNames.has(name)));
  return (item) => {
    const id = item.componentId?.trim();
    return id ? ids.has(id) : names.has(item.item);
  };
}

/**
 * Trigger kinds that only system topics use.
 *
 * Assumption: the list comes from the trigger kinds of the built-in Copilot Studio
 * system topics. Custom topics can also use OnRecognizedIntent or OnRedirect, so
 * these two kinds are not in the list.
 */
const SYSTEM_TOPIC_TRIGGER_KINDS: ReadonlySet<string> = new Set([
  'OnConversationStart',
  'OnUnknownIntent',
  'OnSelectIntent',
  'OnError',
  'OnEscalate',
  'OnSignIn',
  'OnSystemRedirect',
]);

/**
 * Identify a system topic.
 *
 * A topic is a system topic when it is a standard conversational system topic, or
 * when its trigger kind is a kind that only system topics use.
 */
export function isSystemTopic(topic: StageBTopicComponent): boolean {
  return isStandardConversationalSystemTopic(topic)
    || (topic.TriggerKind !== undefined && SYSTEM_TOPIC_TRIGGER_KINDS.has(topic.TriggerKind));
}
