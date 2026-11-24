import { Button, Tooltip } from '@fluentui/react-components';
import { Chat20Regular } from '@fluentui/react-icons';

interface ViewChatButtonProps {
  onClick: () => void;
}

/** Grid row action that opens the conversation chat drawer. */
export function ViewChatButton({ onClick }: ViewChatButtonProps) {
  return (
    <Tooltip content="View chat" relationship="description">
      <Button size="small" appearance="subtle" icon={<Chat20Regular />} onClick={onClick}>View chat</Button>
    </Tooltip>
  );
}
