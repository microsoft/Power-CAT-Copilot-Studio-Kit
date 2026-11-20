import { useMemo, type FC } from "react";
import { tokens, makeStyles } from "@fluentui/react-components";
import type { TranscriptData } from "./types";
import MessageBubble from "./MessageBubble";
import { parseConversation } from "../../utils/parse-chat-preview";
const useStyles = makeStyles({
  chatPreview: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  chatMessages: {
    flex: "1",
    overflowY: "auto",
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  chatInputArea: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  },
  sendBoxContainer: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
    "&:focus-within": {
      borderTopColor: tokens.colorBrandStroke1,
      borderRightColor: tokens.colorBrandStroke1,
      borderBottomColor: tokens.colorBrandStroke1,
      borderLeftColor: tokens.colorBrandStroke1,
    },
  },
  inputField: {
    flex: 1,
    border: "none",
    backgroundColor: "transparent",
    "& input": {
      backgroundColor: "transparent !important",
    },
  },
  actions: {
    display: "flex",
    gap: "2px",
    flexShrink: 0,
  },
  disclaimer: {
    padding: "8px 16px",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    textAlign: "center" as const,
    backgroundColor: tokens.colorNeutralBackground2,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
});

interface ChatPreviewProps {
  data: TranscriptData;
  onUserMessageClick?: (messageId: string) => void;
  selectedUserMessageId?: string | null;
}

const ChatPreview: FC<ChatPreviewProps> = ({
  data,
  onUserMessageClick,
  selectedUserMessageId,
}) => {
  const styles = useStyles();
  const conversation = useMemo(() => parseConversation(data), [data]);

  return (
    <div className={styles.chatPreview}>
      <div className={styles.chatMessages}>
        {conversation.messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onUserMessageClick={onUserMessageClick}
            isSelected={
              message.type === "user" && message.id === selectedUserMessageId
            }
          />
        ))}
      </div>
    </div>
  );
};

export default ChatPreview;
