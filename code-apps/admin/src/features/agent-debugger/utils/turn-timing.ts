import type { Activity, ProcessedTurn, StepExecution } from '../contracts/transcript';
import { execTimeToMs, resolveExecutionTimeString } from './step-classification';
import { activityTimestampMs, normalizeTimestampMs } from './transcript/timestamp';
import { GENERATIVE_THINKING_TASK_ID } from '../contracts/generative-markers';

/** Whether a duration was recorded or can be derived, including a recorded zero. */
export function hasStepTiming(exec: Pick<StepExecution, 'executionTime' | 'triggeredAt' | 'finishedAt'>): boolean {
  if (exec.executionTime && /^\d+:[0-5]\d:[0-5]\d(?:\.\d+)?$/.test(exec.executionTime.trim())) return true;
  const start = normalizeTimestampMs(exec.triggeredAt);
  const end = normalizeTimestampMs(exec.finishedAt);
  return start !== undefined && end !== undefined && end >= start;
}

/** Uses explicit session records, not an arbitrary inactivity threshold. */
function followingSessionStart(activities: Activity[], userStart: number | undefined): number | undefined {
  if (userStart === undefined) return undefined;
  const sessions = activities.flatMap((activity) => {
    if ((activity.name ?? activity.valueType) !== 'SessionInfo') return [];
    const value = activity.value;
    if (!value || typeof value !== 'object') return [];
    const start = normalizeTimestampMs('startTimeUtc' in value ? value.startTimeUtc : undefined);
    const end = normalizeTimestampMs('endTimeUtc' in value ? value.endTimeUtc : undefined);
    return start !== undefined && end !== undefined && end >= start ? [{ start, end }] : [];
  });
  const session = sessions.find(({ start, end }) => start <= userStart && end >= userStart);
  if (!session) return undefined;
  const laterStarts = sessions.filter(({ start }) => start > session.end).map(({ start }) => start);
  return laterStarts.length ? Math.min(...laterStarts) : undefined;
}

/** Bounds an exchange by its user message and recorded response/completion, not user think time. */
export function turnTimeBounds(turns: ProcessedTurn[]): { startMs: number; endMs: number } {
  const user = turns.find((turn) => turn.role === 'user');
  const userActivity = user?.activities.find((activity) => activity.id === user.id && activity.type === 'message');
  const userStart = activityTimestampMs(userActivity) ?? normalizeTimestampMs(user?.timestamp);
  const activities = turns.flatMap((turn) => turn.activities);
  const sessionKey = userActivity?.mergedSessionKey;
  const nextSessionStart = followingSessionStart(activities, userStart);
  const isStandardTranscript = activities.some(
    (activity) => activity.type === 'message' && activity.from?.role === 0,
  );
  const starts: number[] = [];
  const ends: number[] = [];

  for (const turn of turns) {
    const turnSessionKey = turn.activities.find((activity) => activity.mergedSessionKey)?.mergedSessionKey;
    if (sessionKey && turnSessionKey && turnSessionKey !== sessionKey) continue;
    for (const exec of turn.debugInfo?.stepExecutions ?? []) {
      if (['P:CaptureContextTool', 'P:SendMessageTool', GENERATIVE_THINKING_TASK_ID].includes(exec.taskDialogId)) continue;
      const duration = execTimeToMs(resolveExecutionTimeString(exec));
      const finish = normalizeTimestampMs(exec.finishedAt);
      const start = normalizeTimestampMs(exec.triggeredAt) ?? (finish !== undefined ? finish - duration : undefined);
      if (start === undefined) continue;
      if (nextSessionStart !== undefined && start >= nextSessionStart) continue;
      starts.push(start);
      if (userStart === undefined || start >= userStart) ends.push(Math.max(start + duration, finish ?? start));
    }
  }
  for (const activity of activities) {
    if (sessionKey && activity.mergedSessionKey && activity.mergedSessionKey !== sessionKey) continue;
    const time = activityTimestampMs(activity);
    if (time === undefined || (userStart !== undefined && time < userStart)) continue;
    if (nextSessionStart !== undefined && time >= nextSessionStart) continue;
    const kind = activity.name ?? activity.valueType;
    const role = activity.from?.role;
    // Connected-agent transcripts use role 1 for both senders; only the user has aadObjectId.
    const isBot = role === 0 || role === 'bot' ||
      (role === 1 && !isStandardTranscript && !activity.from?.aadObjectId && activity.id !== user?.id);
    if (
      (activity.type === 'message' && isBot) ||
      kind === 'DynamicPlanFinished' || kind === 'turn.complete' || kind === 'DynamicServerToolsList'
    ) ends.push(time);
  }

  const startMs = userStart ?? (starts.length ? Math.min(...starts) :
    activities.map(activityTimestampMs).find((time) => time !== undefined) ??
    normalizeTimestampMs(turns[0]?.timestamp) ?? 0);
  return { startMs, endMs: Math.max(startMs, ...ends) };
}

/** Returns uncovered wall-clock intervals; absence of a measured span is not proof of inactivity. */
export function unattributedIntervals(
  entries: Array<{ startMs: number; endMs: number }>,
  startMs: number,
  endMs: number,
): Array<[number, number]> {
  const active = entries
    .map((entry): [number, number] => [Math.max(startMs, entry.startMs), Math.min(endMs, entry.endMs)])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort(([a], [b]) => a - b);
  const gaps: Array<[number, number]> = [];
  let cursor = startMs;
  for (const [start, end] of active) {
    if (start > cursor) gaps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (endMs > cursor) gaps.push([cursor, endMs]);
  return gaps;
}
