/**
 * FeedbackButton — outline button that opens the feedback form in a new tab.
 * Accepts an optional `feedbackUrl` override.
 */
import { Button } from '@fluentui/react-components';
import { Send20Regular } from '@fluentui/react-icons';

const DEFAULT_FEEDBACK_URL = 'https://forms.office.com/r/U615CdBVdD';

interface FeedbackButtonProps {
  feedbackUrl?: string;
}

/** Opens the Microsoft Forms feedback URL in a new tab. */
export function FeedbackButton({ feedbackUrl }: FeedbackButtonProps) {
  const url = feedbackUrl ?? DEFAULT_FEEDBACK_URL;

  const handleClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Button
      appearance="outline"
      icon={<Send20Regular />}
      onClick={handleClick}
      aria-label="Submit feedback"
    >
      Feedback
    </Button>
  );
}

export default FeedbackButton;
