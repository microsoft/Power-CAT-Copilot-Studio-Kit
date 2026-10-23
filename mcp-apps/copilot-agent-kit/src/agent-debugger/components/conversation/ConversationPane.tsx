import { forwardRef, useState, type Ref } from 'react';
import { Button } from '@fluentui/react-components';

import {
  Attach20Regular,
  Bot20Regular,
  ChevronDown16Regular,
  ChevronUp16Regular,
  Document20Regular,
  Person20Regular,
  ThumbDislike16Filled,
  ThumbDislike16Regular,
  ThumbLike16Filled,
  ThumbLike16Regular,
} from '@fluentui/react-icons';

import type { TranscriptData, Attachment, FeedbackData } from '../ui/types';
import type { AdaptiveCardContent } from '../ui/types';
import AdaptiveCardRenderer from '../ui/AdaptiveCardRenderer';
import { formatMessageText } from '../ui/format-message-text';
import { parseConversation, type DisplayMessage } from '../../utils/parse-chat-preview';
import { fmtMs as formatDuration } from '../../utils/format-ms';
import { isRenderableAttachment } from '../../utils/transcript/extract-activity-text';

type ConversationPaneProps = {
  data: TranscriptData;
  selectedUserMessageId?: string;
  /** Measured turn span keyed by opening user message id — renders "Turn N · 1m 50s". */
  turnDurationByMessageId?: Record<string, number>;
  onUserMessageClick: (messageId: string) => void;
};

function isAdaptiveCard(attachment: Attachment): boolean {
  return (
    attachment.contentType === 'application/vnd.microsoft.card.adaptive' &&
    Boolean(attachment.content && typeof attachment.content === 'object' && 'type' in attachment.content && attachment.content.type === 'AdaptiveCard')
  );
}

function adaptiveCardContent(attachment: Attachment): AdaptiveCardContent | undefined {
  return isAdaptiveCard(attachment) ? (attachment.content as AdaptiveCardContent) : undefined;
}

function attachmentLabel(attachment: Attachment): string {
  if (attachment.name?.trim()) return attachment.name.trim();
  const type = attachment.contentType || 'attachment';
  return type.split('/').pop() || type;
}

type OAuthCardContent = {
  text?: string;
  buttons?: Array<{ type?: string; title?: string; value?: string }>;
};

/**
 * OAuth filter: sign-in cards are only rendered when
 * they carry visible text or buttons, since empty token-exchange cards would
 * otherwise show up as blank bubbles.
 */
function isOAuthCard(attachment: Attachment): boolean {
  const isOAuthType =
    attachment.contentType === 'application/vnd.microsoft.card.oauth' ||
    attachment.contentType === 'application/vnd.microsoft.card.signin';
  if (!isOAuthType) return false;
  const content = attachment.content as OAuthCardContent | undefined;
  const hasText = typeof content?.text === 'string' && content.text.trim().length > 0;
  const hasButtons = Array.isArray(content?.buttons) && content.buttons.length > 0;
  return hasText || hasButtons;
}

/** Collapsible knowledge-source citation list. */
function References({ references }: { references?: string[] }) {
  const [open, setOpen] = useState(false);
  if (!references?.length) return null;
  const plural = references.length > 1 ? 's' : '';
  return (
    <div className="w-refs">
      <Button
        appearance="transparent"
        type="button"
        className="w-refs-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${references.length} source reference${plural}, ${open ? 'collapse' : 'expand'}`}
      >
        <span>{references.length} reference{plural}</span>
        {open ? <ChevronUp16Regular className="w-ic" aria-hidden="true" /> : <ChevronDown16Regular className="w-ic" aria-hidden="true" />}
      </Button>
      {open && (
        <div className="w-refs-list">
          {references.map((reference, index) => (
            <div key={`${reference}-${index}`} className="w-ref">
              <span className="n">{index + 1}</span>
              <Document20Regular className="w-ic" aria-hidden="true" />
              <span>{reference}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mirrors `feedbackHtml()` — the `.w-fb` thumbs/rating block under a bot bubble. */
function Feedback({ feedback }: { feedback?: FeedbackData | null }) {
  if (!feedback) return null;
  const up = feedback.reaction === 'thumbsUp';
  const down = feedback.reaction === 'thumbsDown';
  const text = feedback.feedback?.text || feedback.comment || '';
  const rating = feedback.feedback?.rating;

  return (
    <div className="w-fb">
      <div className="btns">
        <span className={up ? 'on' : ''} role="img" aria-label={up ? 'Liked' : 'Like'}>
          {up ? <ThumbLike16Filled className="w-ic" /> : <ThumbLike16Regular className="w-ic" />}
        </span>
        <span className={down ? 'on' : ''} role="img" aria-label={down ? 'Disliked' : 'Dislike'}>
          {down ? <ThumbDislike16Filled className="w-ic" /> : <ThumbDislike16Regular className="w-ic" />}
        </span>
      </div>
      {text ? (
        <>
          <div className="lbl">Tell us about your experience</div>
          <div className="txt">{text}</div>
        </>
      ) : null}
      {rating ? (
        <div className="stars" role="img" aria-label={`Rating: ${rating} out of 5`}>
          <span>Rating:</span>
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} className={star <= rating ? 'on' : 'off'} aria-hidden="true">
              ★
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Mirrors `msgRow()` — `.w-msgrow > .av + .w-msgcol > (.w-bub, .w-msgmeta)`. */
function MessageRow({
  message,
  isSelected,
  onUserMessageClick,
}: {
  message: DisplayMessage;
  isSelected: boolean;
  onUserMessageClick: (messageId: string) => void;
}) {
  const isUser = message.type === 'user';
  const attachments = message.attachments ?? [];
  const adaptiveCards = attachments.filter(isAdaptiveCard);
  const oauthCards = attachments.filter(isOAuthCard);
  const fileAttachments = attachments.filter(
    (attachment) =>
      !isAdaptiveCard(attachment) &&
      !isOAuthCard(attachment) &&
      isRenderableAttachment(attachment),
  );
  const showText = Boolean(message.text?.trim()) && !/^\[(Adaptive Card Message|Attachment[^\]]*)\]$/i.test(message.text?.trim() ?? '');

  const handleClick = () => {
    if (isUser) onUserMessageClick(message.id);
  };

  return (
    <div className={isUser ? 'w-msgrow user' : 'w-msgrow bot'} data-message-id={message.id}>
      <span className="av" aria-hidden="true">
        {isUser ? <Person20Regular className="w-ic" /> : <Bot20Regular className="w-ic" />}
      </span>
      <div className="w-msgcol">
        <div
          className="w-bub"
          onClick={isUser ? handleClick : undefined}
          role={isUser ? 'button' : undefined}
          tabIndex={isUser ? 0 : undefined}
          style={isUser ? { cursor: 'pointer', ...(isSelected ? { outline: '2px solid var(--colorBrandBackground)', outlineOffset: '1px' } : {}) } : undefined}
          onKeyDown={
            isUser
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleClick();
                  }
                }
              : undefined
          }
        >
          {showText ? (
            <div
              className="message-text"
              dangerouslySetInnerHTML={{ __html: formatMessageText(message.text ?? '') }}
            />
          ) : null}
          {adaptiveCards.map((attachment, index) => {
            const card = adaptiveCardContent(attachment);
            return card ? <AdaptiveCardRenderer key={`card-${index}`} card={card} /> : null;
          })}
          {oauthCards.map((attachment, index) => {
            const content =
              attachment.content && typeof attachment.content === 'object'
                ? (attachment.content as OAuthCardContent)
                : undefined;
            const buttons = content?.buttons?.length ? content.buttons : [{ title: 'Sign In' }];
            return (
              <div key={`oauth-${index}`} className="w-oauth">
                {content?.text && <p className="w-oauth-text">{content.text}</p>}
                <div className="w-oauth-actions">
                  {buttons.map((button, buttonIndex) => (
                    <Button key={buttonIndex} appearance="transparent" type="button" className="w-oauth-btn" disabled>
                      {button.title || 'Sign In'}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
          {fileAttachments.length ? (
            <div className="w-atts">
              {fileAttachments.map((attachment, index) => (
                <span key={`${attachment.contentType}-${index}`} className="w-att">
                  <Attach20Regular className="w-ic" aria-hidden="true" />
                  <span>{attachmentLabel(attachment)}</span>
                </span>
              ))}
            </div>
          ) : null}
          {!isUser ? <References references={message.references} /> : null}
          {!isUser ? <Feedback feedback={message.feedback} /> : null}
        </div>
        {!isUser && message.suggestedActions?.actions?.length ? (
          <div className="w-sugg">
            {message.suggestedActions.actions.map((action, index) => (
              <Button key={index} appearance="transparent" type="button" className="w-sugg-btn" disabled>
                {action.image && <img src={action.image} alt="" className="w-sugg-img" />}
                {action.title}
              </Button>
            ))}
          </div>
        ) : null}
        {message.timestamp ? (
          <div className="w-msgmeta">
            <span>{message.timestamp}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Mirrors `renderConversation()` — the `.w-chat` message list, including `.w-turnmark` dividers. */
export const ConversationPane = forwardRef(function ConversationPane(
  { data, selectedUserMessageId, turnDurationByMessageId, onUserMessageClick }: ConversationPaneProps,
  ref: Ref<HTMLDivElement>,
) {
  const conversation = parseConversation(data);

  return (
    <div ref={ref} className="w-chat">
      {conversation.messages.map((message, messageIndex) => {
        const startsTurn = message.type === 'user';
        const turnNumber = startsTurn
          ? conversation.messages
              .slice(0, messageIndex + 1)
              .filter((candidate) => candidate.type === 'user').length
          : 0;
        const isSelected = message.type === 'user' && message.id === selectedUserMessageId;
        return (
          <div key={message.id}>
            {startsTurn ? (
              <div className="w-turnmark">
                <Button
                  appearance="transparent"
                  type="button"
                  aria-current={isSelected}
                  onClick={() => onUserMessageClick(message.id)}
                >
                  Turn {turnNumber}
                  {turnDurationByMessageId?.[message.id]
                    ? ` · ${formatDuration(turnDurationByMessageId[message.id])}`
                    : ''}
                </Button>
              </div>
            ) : null}
            <MessageRow message={message} isSelected={isSelected} onUserMessageClick={onUserMessageClick} />
          </div>
        );
      })}
    </div>
  );
});
