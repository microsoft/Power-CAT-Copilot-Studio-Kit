import type { Activity } from '../../contracts/transcript';
import { extractActivityText, isNonConversationalUserResponse } from './extract-activity-text';
import { isUserMessage } from './parse-transcript';

/** Identifies conversational user messages without mistaking connected-agent replies for users. */
export function isUserMessageActivity(activity: Activity, isStandardTranscript: boolean): boolean {
  if (!isUserMessage(activity, isStandardTranscript)) return false;
  return !isNonConversationalUserResponse(
    activity.value,
    extractActivityText({
      text: activity.text,
      speak: activity.speak,
      value: activity.value,
      channelData: activity.channelData,
      attachments: activity.attachments as
        | Array<{ contentType?: string; content?: unknown }>
        | undefined,
    }),
    activity.channelData,
  );
}

/** Selects one user exchange, preserving its replies and first-turn MCP initialization. */
export function activitiesForUserTurn(allActivities: Activity[], startIdx: number): Activity[] {
  const isStandardTranscript = allActivities.some(
    (activity) => activity.type === 'message' && activity.from?.role === 0,
  );
  const nextUserOffset = allActivities
    .slice(startIdx + 1)
    .findIndex((activity) => isUserMessageActivity(activity, isStandardTranscript));
  const endIdx = nextUserOffset >= 0 ? startIdx + 1 + nextUserOffset : allActivities.length;
  const selectedActivity = allActivities[startIdx];
  const selectedSessionKey = selectedActivity?.mergedSessionKey;
  const firstUserInSession = allActivities.findIndex(
    (activity) =>
      isUserMessageActivity(activity, isStandardTranscript) &&
      (selectedSessionKey ? activity.mergedSessionKey === selectedSessionKey : true),
  );
  if (startIdx === firstUserInSession) return allActivities.slice(startIdx, endIdx);

  return allActivities.slice(startIdx, endIdx).filter(
    (activity) =>
      activity.name !== 'DynamicServerInitialize' &&
      activity.name !== 'DynamicServerInitializeConfirmation' &&
      activity.name !== 'DynamicServerToolsList',
  );
}
