import { useLayoutEffect, useRef, useState } from "react";
import {
  makeStyles,
  tokens,
  mergeClasses,
  Caption1,
  Button,
} from "@fluentui/react-components";
import { Sparkle20Regular } from "@fluentui/react-icons";
import { MarkdownContent } from "./MarkdownContent";

const useStyles = makeStyles({
  // Shared layout + border box-model. Background, radius, elevation, width and
  // border color come from the variant classes so the block matches its sibling
  // activity cards in each context. Static (non-clickable): the reasoning text is
  // shown inline, not behind a click.
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    width: "100%",
    boxSizing: "border-box",
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    borderTopWidth: tokens.strokeWidthThin,
    borderBottomWidth: tokens.strokeWidthThin,
    borderInlineStartWidth: tokens.strokeWidthThin,
    borderInlineEndWidth: tokens.strokeWidthThin,
    borderTopStyle: "solid",
    borderBottomStyle: "solid",
    borderInlineStartStyle: "solid",
    borderInlineEndStyle: "solid",
  },
  // Parent flow: mirrors the parent activity cards (stepCard) — white fill,
  // extra-large radius, subtle elevation, constrained to the same 280–560px width.
  rootParent: {
    minWidth: "280px",
    maxWidth: "560px",
    paddingInlineStart: tokens.spacingHorizontalS,
    paddingInlineEnd: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    borderTopColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderInlineStartColor: tokens.colorNeutralStroke2,
    borderInlineEndColor: tokens.colorNeutralStroke2,
    boxShadow: tokens.shadow4,
  },
  // Inside a connected agent: mirrors the connected-agent child cards (topicCard)
  // — grey fill, medium radius, no elevation, fills the container width.
  rootConnected: {
    paddingInlineStart: tokens.spacingHorizontalM,
    paddingInlineEnd: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground4,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderInlineStartColor: "transparent",
    borderInlineEndColor: "transparent",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
  icon: {
    fontSize: "16px",
    color: tokens.colorNeutralForeground3,
  },
  body: {
    color: tokens.colorNeutralForeground2,
    overflow: "hidden",
    // Reasoning text is muted secondary content; markdown formatting is preserved
    // via MarkdownContent (`.message-text`). Rendered at the Base200 (12px) step —
    // two steps below the default 14px body — so the reasoning reads as lighter-
    // weight than the activity content.
    fontSize: tokens.fontSizeBase200,
  },
  bodyCollapsed: {
    maxHeight: "72px",
  },
  bodyFade: {
    // Fade the clamped bottom edge so it reads as truncated — applied ONLY when
    // the content actually overflows. Otherwise short reasoning (2–3 lines, no
    // "Show more") would have its last visible line blurred even though nothing
    // is hidden.
    maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
    WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
  },
  toggle: {
    alignSelf: "flex-start",
    minWidth: "auto",
    paddingInline: 0,
    height: "auto",
    color: tokens.colorNeutralForeground2Link,
  },
});

export interface ReasoningBlockProps {
  /** Reconstructed reasoning text (may contain markdown). */
  text: string;
  /** Optional label shown above the text. Defaults to "Reasoning". */
  label?: string;
  /**
   * Which surrounding context the block renders in — controls the box size and
   * background so the reasoning card matches its sibling activity cards:
   * - `"parent"` (default): white, elevated, 280–360px — like the parent flow's
   *   activity cards.
   * - `"connected"`: grey, medium-radius, full-width — like the child activity
   *   cards inside a connected-agent card.
   */
  variant?: "parent" | "connected";
}

/**
 * Renders an agent's reasoning ("chain of thought") as muted text inside a card
 * that matches its sibling activity cards — white/elevated in the parent flow
 * (`variant="parent"`) or grey/flat inside a connected-agent card
 * (`variant="connected"`). The block is static (non-clickable): the reasoning is
 * shown inline rather than behind a click. Long reasoning collapses with a Show
 * more/less toggle. Markdown is formatted via {@link MarkdownContent}.
 */
export function ReasoningBlock({ text, label = "Reasoning", variant = "parent" }: ReasoningBlockProps) {
  const styles = useStyles();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // When collapsed, the element is clamped to maxHeight; overflow means there
    // is more content to reveal.
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  if (!text?.trim()) return null;

  return (
    <div
      className={mergeClasses(
        styles.root,
        variant === "connected" ? styles.rootConnected : styles.rootParent
      )}
    >
      <div className={styles.header}>
        <Sparkle20Regular className={styles.icon} aria-hidden />
        <Caption1>{label}</Caption1>
      </div>
      <div
        ref={bodyRef}
        className={mergeClasses(
          styles.body,
          !expanded && styles.bodyCollapsed,
          !expanded && overflowing && styles.bodyFade
        )}
      >
        <MarkdownContent text={text} />
      </div>
      {(overflowing || expanded) && (
        <Button
          appearance="transparent"
          size="small"
          className={styles.toggle}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  );
}
