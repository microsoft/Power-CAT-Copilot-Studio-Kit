export interface ConversationTranscriptRecord {
  conversationtranscriptid: string;
  name?: string;
  conversationstarttime?: string;
  content?: string;
  metadata?: string;
  schematype?: string;
  schemaversion?: string;
  statecode?: number;
  createdon?: string;
}

interface TranscriptActivity {
  id?: string;
  mergedSessionKey?: string;
  [key: string]: unknown;
}

interface TranscriptContent {
  activities?: TranscriptActivity[];
}

interface TranscriptMetadata {
  BatchId?: number;
  [key: string]: unknown;
}

function parseJson<T>(value: string, field: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Invalid conversation transcript ${field}.`, { cause: error });
  }
}

function batchId(record: ConversationTranscriptRecord): number {
  if (!record.metadata) return 0;
  const metadata = parseJson<TranscriptMetadata>(record.metadata, "metadata");
  return typeof metadata?.BatchId === "number" && Number.isFinite(metadata.BatchId)
    ? metadata.BatchId
    : 0;
}

export function mergeConversationTranscriptRecords(
  records: ConversationTranscriptRecord[],
  fallbackId: string,
): ConversationTranscriptRecord {
  if (records.length === 0) {
    return {
      conversationtranscriptid: fallbackId,
      content: JSON.stringify({ activities: [] } satisfies TranscriptContent),
    };
  }

  const sessions = new Map<string, ConversationTranscriptRecord[]>();
  for (const record of records) {
    const key = record.conversationstarttime ?? "__missing_start__";
    const session = sessions.get(key);
    if (session) session.push(record);
    else sessions.set(key, [record]);
  }

  const startTimes = [...sessions.keys()].sort((left, right) => {
    if (left === "__missing_start__") return 1;
    if (right === "__missing_start__") return -1;
    return left.localeCompare(right);
  });

  const activities: TranscriptActivity[] = [];
  startTimes.forEach((startTime, sessionIndex) => {
    const sessionKey = `${startTime}__seg${sessionIndex}`;
    const batches = [...(sessions.get(startTime) ?? [])]
      .sort((left, right) => batchId(left) - batchId(right));

    for (const record of batches) {
      if (!record.content) continue;
      const content = parseJson<TranscriptContent>(record.content, "content");
      if (!Array.isArray(content.activities)) {
        throw new Error("Invalid conversation transcript content.");
      }
      for (const activity of content.activities) {
        activities.push({ ...activity, mergedSessionKey: sessionKey });
      }
    }
  });

  const nameCounts = new Map<string, number>();
  for (const record of records) {
    if (!record.name) continue;
    nameCounts.set(record.name, (nameCounts.get(record.name) ?? 0) + 1);
  }
  const name = [...nameCounts.entries()]
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? records[0].name;
  const firstWithStart = records.find((record) => record.conversationstarttime);
  const conversationstarttime = firstWithStart?.conversationstarttime
    ?? records[0].conversationstarttime;
  const conversationtranscriptid = name && conversationstarttime
    ? `${name}_${conversationstarttime}`
    : records[0].conversationtranscriptid ?? fallbackId;

  return {
    ...records[0],
    conversationtranscriptid,
    name,
    conversationstarttime,
    metadata: records.find((record) => batchId(record) === 0)?.metadata
      ?? records[0].metadata,
    content: JSON.stringify({ activities } satisfies TranscriptContent),
  };
}
