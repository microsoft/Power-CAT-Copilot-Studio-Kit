import type { Activity } from "../contracts/transcript";
import {
  asRecord,
  extractCapiResourceUsage,
  readNumber,
  readString,
} from "./build-flow-steps";

type ResponseGeneratorCitation = {
  Title?: string;
  Url?: string;
  Text?: string;
};

export type ResponseGeneratorSupport = {
  query?: string;
  response?: string;
  citations?: ResponseGeneratorCitation[];
};

export type UniversalSearchTrace = {
  knowledgeSources?: string[];
  outputKnowledgeSources?: string[];
};

export type GPTAnswerTrace = {
  gptAnswerState?: string;
  timestamp?: number;
  text?: string;
  promptTokens?: number;
  completionTokens?: number;
  activityIndex?: number;
};

export function getLatestResponseGeneratorSupport(
  activities: Activity[]
): ResponseGeneratorSupport | undefined {
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const activity = activities[i];
    if (activity?.name !== "ResponseGeneratorSupportData") continue;
    const value = asRecord(activity.value);
    if (!value) continue;

    const citationsValue = value["citations"];
    const citations = Array.isArray(citationsValue) ? citationsValue : undefined;
    return {
      query: readString(value, "query"),
      response: readString(value, "response"),
      citations: citations
        ? citations.map((citation) => ({
            Title: readString(asRecord(citation), "Title"),
            Url: readString(asRecord(citation), "Url"),
            Text: readString(asRecord(citation), "Text"),
          }))
        : undefined,
    };
  }

  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const activity = activities[i];
    if (
      activity?.name !== "GenerativeAnswersSupportData" &&
      activity?.valueType !== "GenerativeAnswersSupportData"
    ) {
      continue;
    }
    const value = asRecord(activity.value);
    if (!value) continue;

    const result = asRecord(
      asRecord(value["summarizationOpenAIResponse"])?.["Result"]
    );
    if (!result) continue;

    const citationsValue = result["TextCitations"];
    const citations = Array.isArray(citationsValue) ? citationsValue : undefined;

    return {
      query:
        readString(value, "rewrittenMessage") ??
        readString(value, "screenedMessage") ??
        readString(value, "message") ??
        undefined,
      response:
        readString(result, "TextSummary") ??
        readString(result, "Summary") ??
        undefined,
      citations: citations
        ? citations.map((citation) => {
            const record = asRecord(citation);
            return {
              Title: readString(record, "Title") ?? readString(record, "title"),
              Url: readString(record, "Url") ?? readString(record, "url"),
              Text:
                readString(record, "Text") ??
                readString(record, "OriginalSnippet") ??
                readString(record, "originalSnippet") ??
                readString(record, "text"),
            };
          })
        : undefined,
    };
  }

  return undefined;
}

export function getLatestUniversalSearchTrace(
  activities: Activity[]
): UniversalSearchTrace | undefined {
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const activity = activities[i];
    if (activity?.name !== "UniversalSearchToolTraceData") continue;
    const value = asRecord(activity.value);
    if (!value) continue;

    const knowledgeSources = value["knowledgeSources"];
    const outputKnowledgeSources = value["outputKnowledgeSources"];
    return {
      knowledgeSources: Array.isArray(knowledgeSources)
        ? knowledgeSources.map((source: unknown) => String(source))
        : undefined,
      outputKnowledgeSources: Array.isArray(outputKnowledgeSources)
        ? outputKnowledgeSources.map((source: unknown) => String(source))
        : undefined,
    };
  }

  return undefined;
}

export function getLatestGPTAnswerTrace(
  activities: Activity[]
): GPTAnswerTrace | undefined {
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const activity = activities[i];
    const channelData = asRecord(activity.channelData);
    const feedback = asRecord(channelData?.["pva:gpt-feedback"]);

    if (activity?.type === "message" && feedback) {
      const gptAnswerState = readString(feedback, "gptAnswerState");
      if (!gptAnswerState) continue;

      const usage = extractCapiResourceUsage(feedback);
      return {
        gptAnswerState,
        timestamp:
          typeof activity.timestamp === "number" ? activity.timestamp : undefined,
        text: typeof activity.text === "string" ? activity.text : "",
        promptTokens: usage ? readNumber(usage, "PromptTokens") ?? 0 : 0,
        completionTokens: usage ? readNumber(usage, "CompletionTokens") ?? 0 : 0,
        activityIndex: i,
      };
    }
  }

  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const activity = activities[i];
    if (activity?.name !== "GPTAnswer" && activity?.valueType !== "GPTAnswer") {
      continue;
    }
    const value = asRecord(activity.value);
    if (!value) continue;

    let text = "";
    let promptTokens = 0;
    let completionTokens = 0;

    for (let j = i + 1; j < activities.length && j < i + 5; j += 1) {
      const nextActivity = activities[j];
      if (
        nextActivity?.type === "message" &&
        typeof nextActivity.text === "string"
      ) {
        text = nextActivity.text;
        break;
      }
    }

    for (let j = i; j < activities.length && j < i + 5; j += 1) {
      const nextActivity = activities[j];
      const channelData = asRecord(nextActivity.channelData);
      const feedback = asRecord(channelData?.["pva:gpt-feedback"]);
      if (nextActivity?.type !== "message" || !feedback) continue;

      const usage = extractCapiResourceUsage(feedback);
      if (usage) {
        promptTokens = readNumber(usage, "PromptTokens") ?? 0;
        completionTokens = readNumber(usage, "CompletionTokens") ?? 0;
      }
    }

    return {
      gptAnswerState: readString(value, "gptAnswerState"),
      timestamp:
        typeof activity.timestamp === "number" ? activity.timestamp : undefined,
      text,
      promptTokens,
      completionTokens,
      activityIndex: i,
    };
  }

  return undefined;
}
