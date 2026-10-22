// Types for FluentUI 9 based Conversation Preview components

import type { Activity as BaseActivity } from "../../contracts/transcript";

// Extend the canonical Activity type with UI-specific fields needed by fluent components
export interface Activity extends BaseActivity {
  type: "message" | "event" | "trace";
  timestamp: string;
  from: {
    id: string;
    name?: string;
    role: "user" | "bot" | "channel" | number;
  };
  localTimestamp?: string;
  conversation?: { id: string };
  textFormat?: string;
  locale?: string;
  inputHint?: string;
  attachments?: Attachment[];
  suggestedActions?: SuggestedActions;
}

export interface Attachment {
  contentType: string;
  content?: AdaptiveCardContent | OAuthCardContent | Record<string, unknown>;
  contentUrl?: string;
  name?: string;
  thumbnailUrl?: string;
}

export interface OAuthCardContent {
  text?: string;
  buttons?: Array<{ type?: string; title?: string; value?: string }>;
  tokenExchangeResource?: Record<string, unknown>;
}

export interface AdaptiveCardContent {
  type: "AdaptiveCard";
  version?: string;
  body?: AdaptiveCardElement[];
  actions?: AdaptiveCardAction[];
  $schema?: string;
}

export interface AdaptiveCardElement {
  type: string;
  text?: string;
  size?: string;
  weight?: string;
  color?: string;
  wrap?: boolean;
  spacing?: string;
  separator?: boolean;
  items?: AdaptiveCardElement[];
  columns?: AdaptiveCardColumn[];
  id?: string;
  placeholder?: string;
  style?: string;
  value?: string;
  title?: string;
  choices?: AdaptiveCardChoice[];
  isMultiSelect?: boolean;
  label?: string;
  isRequired?: boolean;
}

export interface AdaptiveCardColumn {
  type: "Column";
  width?: string | number;
  items?: AdaptiveCardElement[];
}

export interface AdaptiveCardChoice {
  title: string;
  value: string;
}

export interface AdaptiveCardAction {
  type: string;
  title?: string;
  data?: Record<string, unknown>;
  url?: string;
  style?: string;
}

export interface SuggestedActions {
  actions: SuggestedAction[];
}

export interface SuggestedAction {
  type: string;
  title: string;
  value: string;
  image?: string;
}

export interface TranscriptData {
  activities: Activity[];
}

export interface FeedbackData {
  reaction: "thumbsUp" | "thumbsDown";
  replyToId?: string;
  comment?: string;
  feedback?: {
    text?: string;
    rating?: number;
  };
}

// Parsed message for display
export interface ParsedMessage {
  id: string;
  type: "user" | "bot" | "system";
  text?: string;
  timestamp: string;
  attachments?: Attachment[];
  suggestedActions?: SuggestedActions;
  feedback?: FeedbackData;
  hasFeedback?: boolean;
}
