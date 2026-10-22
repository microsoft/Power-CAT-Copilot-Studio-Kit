/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, type FC } from "react";
import {
  Avatar,
  Button,
  tokens,
  makeStyles,
  Text,
} from "@fluentui/react-components";
import {
  BotSparkle24Filled,
  Person24Filled,
  ChevronDown20Regular,
  ChevronUp20Regular,
  Document20Regular,
  DocumentPdf20Regular,
  Image20Regular,
} from "@fluentui/react-icons";
import AdaptiveCardRenderer from "./AdaptiveCardRenderer";
import FeedbackControls from "./FeedbackControls";
import { formatMessageText } from "./format-message-text";
import type { FeedbackData, Attachment, SuggestedActions, SuggestedAction, AdaptiveCardContent, OAuthCardContent } from "./types";
import { isRenderableAttachment } from "../../utils/transcript/extract-activity-text";
import "./MessageBubble.css";

const useStyles = makeStyles({
  botAvatar: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  userAvatar: {
    backgroundColor: tokens.colorNeutralBackground5,
    color: tokens.colorNeutralForeground1,
  },
  referencesSection: {
    marginTop: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  referencesHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalXXS,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    backgroundColor: "transparent",
    border: "none",
    padding: "0",
    width: "100%",
    minWidth: 0,
    minHeight: "unset",
    textAlign: "left",
    cursor: "pointer",
    "&:hover": {
      color: tokens.colorNeutralForeground1,
    },
  },
  referencesList: {
    marginTop: tokens.spacingVerticalXXS,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
  },
  referenceItem: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  referenceIcon: {
    color: tokens.colorBrandForeground1,
  },
  referenceNumber: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
  },
  clickableUserMessage: {
    cursor: "pointer",
    transition: "all 0.15s ease",
    "&:hover": {
      backgroundColor: `${tokens.colorNeutralBackground4} !important` as never,
      transform: "translateX(-2px)",
    },
  },
  selectedUserMessage: {
    backgroundColor: `${tokens.colorBrandBackground2} !important` as any,
    boxShadow: "none !important" as any,
    border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    "&:hover": {
      backgroundColor: `${tokens.colorBrandBackground2Hover} !important` as never,
    },
  },
  attachmentChip: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalSNudge,
    marginTop: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    maxWidth: "100%",
    boxSizing: "border-box",
  },
  attachmentChipIcon: {
    flexShrink: 0,
    color: tokens.colorBrandForeground1,
  },
  attachmentChipTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
});

interface MessageBubbleProps {
  message: {
    id: string;
    type: "user" | "bot" | "system";
    text?: string;
    timestamp: string;
    attachments?: Attachment[];
    suggestedActions?: SuggestedActions;
    feedback?: FeedbackData | null;
    references?: string[];
  };
  onUserMessageClick?: (messageId: string) => void;
  isSelected?: boolean;
}

/**
 * Determines whether an attachment is a generic file (PDF, image, document, …)
 * as opposed to a rich card (adaptive / OAuth / sign-in) that is rendered
 * elsewhere. Reuses the shared renderable check so non-renderable payloads
 * (e.g. `application/json`) are excluded.
 */
function isFileAttachment(att: Attachment): boolean {
  if (!att?.contentType) return false;
  if (att.contentType.startsWith("application/vnd.microsoft.card.")) return false;
  return isRenderableAttachment(att);
}

/** Renders a file-type icon element based on the attachment's content type. */
function renderAttachmentIcon(contentType: string, className: string) {
  if (contentType === "application/pdf")
    return <DocumentPdf20Regular className={className} aria-hidden="true" />;
  if (contentType.startsWith("image/"))
    return <Image20Regular className={className} aria-hidden="true" />;
  return <Document20Regular className={className} aria-hidden="true" />;
}

/**
 * Derives a friendly label for a file attachment — prefers the file name, then a
 * known content-type label (e.g. `application/pdf` → "PDF file"), then a generic
 * fallback.
 */
function describeAttachment(att: Attachment): string {
  if (att.name && att.name.trim()) return att.name.trim();
  const ct = (att.contentType || "").toLowerCase();
  const known: Record<string, string> = {
    "application/pdf": "PDF file",
    "application/msword": "Word document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
    "application/vnd.ms-excel": "Excel spreadsheet",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel spreadsheet",
    "application/vnd.ms-powerpoint": "PowerPoint file",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint file",
    "text/plain": "Text file",
    "text/csv": "CSV file",
    "application/zip": "Zip archive",
  };
  if (known[ct]) return known[ct];
  if (ct.startsWith("image/")) {
    const sub = ct.split("/").pop() || "";
    return sub ? `${sub.toUpperCase()} image` : "Image";
  }
  const subtype = ct.split("/").pop() || ct;
  if (subtype && subtype.length > 0 && subtype.length <= 5) return `${subtype.toUpperCase()} file`;
  return "File attachment";
}

/** Compact chip indicating a file attached to a chat message. */
const AttachmentChip: FC<{ attachment: Attachment }> = ({ attachment }) => {
  const styles = useStyles();
  const label = describeAttachment(attachment);
  return (
    <div className={styles.attachmentChip}>
      {renderAttachmentIcon(attachment.contentType || "", styles.attachmentChipIcon)}
      <Text className={styles.attachmentChipTitle} title={label}>
        {label}
      </Text>
    </div>
  );
};

const MessageBubble: FC<MessageBubbleProps> = ({
  message,
  onUserMessageClick,
  isSelected,
}) => {
  const [showReferences, setShowReferences] = useState(false);
  const styles = useStyles();

  const isUser = message.type === "user";
  const isBot = message.type === "bot";

  const renderMessageContent = () => {
    const attachments = message.attachments ?? [];

    // Adaptive card attachments — rendered via AdaptiveCardRenderer.
    const adaptiveCards = attachments.filter(
      (att) => att.contentType === "application/vnd.microsoft.card.adaptive"
    );

    // OAuth / sign-in cards — skip empty token-exchange cards that have no
    // visible text and no buttons (they render as blank bubbles).
    const oauthCards = attachments.filter((att) => {
      const isOAuthType =
        att.contentType === "application/vnd.microsoft.card.oauth" ||
        att.contentType === "application/vnd.microsoft.card.signin";
      if (!isOAuthType) return false;
      const content = att.content as OAuthCardContent | undefined;
      const hasText = typeof content?.text === "string" && content.text.trim().length > 0;
      const hasButtons = Array.isArray(content?.buttons) && content.buttons.length > 0;
      return hasText || hasButtons;
    });

    // Generic file attachments (PDF, images, documents, …). These must render
    // alongside any message text: a message that has BOTH text and a file
    // attachment previously showed only the text, hiding the attachment even
    // though it was present in the transcript payload.
    const fileAttachments = attachments.filter(isFileAttachment);

    // "[Attachment: …]" / "[Adaptive Card Message]" is a synthetic placeholder used
    // only when a message had no real text; render the actual attachment chips
    // instead of the placeholder string.
    const isPlaceholderText =
      !!message.text &&
      /^\[(Adaptive Card Message|Attachment[^\]]*)\]$/i.test(message.text.trim());
    const showText = !!message.text && !isPlaceholderText;

    if (
      !showText &&
      adaptiveCards.length === 0 &&
      oauthCards.length === 0 &&
      fileAttachments.length === 0
    ) {
      return null;
    }

    return (
      <>
        {showText && (
          <div
            className="message-text"
            dangerouslySetInnerHTML={{ __html: formatMessageText(message.text ?? "") }}
          />
        )}
        {adaptiveCards.map((card, index) => {
          const ac = card.content as AdaptiveCardContent | undefined;
          return ac ? <AdaptiveCardRenderer key={`ac-${index}`} card={ac} /> : null;
        })}
        {oauthCards.map((card, index) => {
          const oauthContent =
            card.content && typeof card.content === "object"
              ? (card.content as OAuthCardContent)
              : undefined;
          return (
            <div key={`oauth-${index}`} className="oauth-signin-card">
              {oauthContent?.text && (
                <p className="oauth-signin-text">{oauthContent.text}</p>
              )}
              <div className="oauth-signin-actions">
                {oauthContent?.buttons?.map(
                  (btn: { type?: string; title?: string; value?: string }, btnIdx: number) => (
                    <Button
                      type="button"
                      appearance="transparent"
                      disabled
                      key={btnIdx}
                      className="oauth-signin-button oauth-signin-button--disabled"
                    >
                      {btn.title || "Sign In"}
                    </Button>
                  )
                ) ?? (
                  <Button type="button" appearance="transparent" disabled className="oauth-signin-button oauth-signin-button--disabled">
                    Sign In
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {fileAttachments.map((att, index) => (
          <AttachmentChip key={`file-${index}`} attachment={att} />
        ))}
      </>
    );
  };

  const renderSuggestedActions = () => {
    if (!message.suggestedActions?.actions?.length) return null;

    return (
      <div className="suggested-actions">
        {message.suggestedActions.actions.map((action: SuggestedAction, index: number) => (
          <Button key={index} appearance="transparent" className="suggested-action-btn" disabled>
            {action.image && (
              <img src={action.image} alt="" className="action-image" />
            )}
            {action.title}
          </Button>
        ))}
      </div>
    );
  };

  const handleUserMessageClick = () => {
    if (isUser && onUserMessageClick) {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      onUserMessageClick(message.id);
    }
  };

  // Only apply interactive button role/attributes when the click handler exists
  const isInteractiveButton = isUser && !!onUserMessageClick;
  const userMessageClasses = isUser
    ? `${styles.clickableUserMessage} ${
        isSelected ? styles.selectedUserMessage : ""
      }`
    : "";

  return (
    <div className={`message-container ${message.type}`} data-message-id={message.id}>
      {/* Bot Avatar — decorative, adjacent message text conveys sender */}
      {isBot && (
        <div className="message-avatar">
          <Avatar
            icon={<BotSparkle24Filled aria-hidden="true" />}
            className={styles.botAvatar}
            size={32}
            aria-hidden="true"
          />
        </div>
      )}

      <div className="message-content">
        <div
          className={`message-bubble ${message.type} ${userMessageClasses}`}
          onClick={handleUserMessageClick}
          role={isInteractiveButton ? "button" : undefined}
          tabIndex={isInteractiveButton ? 0 : undefined}
          onKeyDown={
            isInteractiveButton
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserMessageClick();
                  }
                }
              : undefined
          }
          aria-label={isInteractiveButton ? `View debug information for: ${(message.text ?? "").slice(0, 80) || "message"}` : undefined}
        >
          {renderMessageContent()}

          {/* References section for bot messages */}
          {isBot && message.references && message.references.length > 0 && (
            <div className={styles.referencesSection}>
              <Button
                type="button"
                appearance="transparent"
                className={styles.referencesHeader}
                onClick={() => setShowReferences(!showReferences)}
                aria-expanded={showReferences}
                aria-label={`${message.references.length} source reference${message.references.length > 1 ? "s" : ""}, ${showReferences ? "collapse" : "expand"}`}
              >
                <Text size={200}>
                  {message.references.length} reference
                  {message.references.length > 1 ? "s" : ""}
                </Text>
                {showReferences ? (
                  <ChevronUp20Regular />
                ) : (
                  <ChevronDown20Regular />
                )}
              </Button>
              {showReferences && (
                <div className={styles.referencesList}>
                  {message.references.map((ref, index) => (
                    <div key={index} className={styles.referenceItem}>
                      <span className={styles.referenceNumber}>
                        {index + 1}
                      </span>
                      <Document20Regular className={styles.referenceIcon} />
                      <Text size={200}>{ref}</Text>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Feedback controls for bot messages */}
          {isBot && (
            <FeedbackControls
              feedback={message.feedback}
            />
          )}
        </div>

        {/* Suggested actions */}
        {renderSuggestedActions()}

        {/* Timestamp */}
        {message.timestamp && (
          <div className="message-timestamp">{message.timestamp}</div>
        )}
      </div>

      {/* User Avatar — decorative, message structure conveys sender */}
      {isUser && (
        <div className="message-avatar">
          <Avatar
            icon={<Person24Filled aria-hidden="true" />}
            className={styles.userAvatar}
            size={32}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
