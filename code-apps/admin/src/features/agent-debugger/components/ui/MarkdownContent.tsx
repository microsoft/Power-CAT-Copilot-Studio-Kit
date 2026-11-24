import type { CSSProperties } from "react";
import { formatMessageText } from "./format-message-text";
import "./MessageBubble.css";

export interface MarkdownContentProps {
  /** Raw markdown text (e.g. an agent's ThinkingTrace reasoning). */
  text: string;
  /** Optional extra class applied alongside the shared `.message-text` markdown styles. */
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders markdown-formatted text as safe HTML using the shared
 * {@link formatMessageText} converter (headings, lists, tables, code, bold,
 * italic, links) and the Fluent-token-based `.message-text` styles from
 * MessageBubble.css. Use anywhere a stored markdown string (reasoning,
 * descriptions) must render with proper formatting instead of raw syntax.
 */
export function MarkdownContent({ text, className, style }: MarkdownContentProps) {
  if (!text) return null;
  return (
    <div
      className={className ? `message-text ${className}` : "message-text"}
      style={style}
      dangerouslySetInnerHTML={{ __html: formatMessageText(text) }}
    />
  );
}
