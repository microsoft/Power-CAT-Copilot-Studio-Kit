import type { ReactNode } from 'react';
import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';

interface RetryMessageBarProps {
  title: string;
  message?: ReactNode;
  intent?: 'error' | 'warning';
  onRetry?: () => void;
  retryDisabled?: boolean;
  className?: string;
}

/** Announces a failed request and offers a Retry action when the caller can recover. */
export function RetryMessageBar({
  title,
  message,
  intent = 'error',
  onRetry,
  retryDisabled = false,
  className,
}: RetryMessageBarProps) {
  return (
    <div className={className} role="alert">
      <MessageBar intent={intent}>
        <MessageBarBody>
          <MessageBarTitle>{title}</MessageBarTitle>
          {message}
        </MessageBarBody>
        {onRetry && (
          <MessageBarActions>
            <Button appearance="subtle" size="small" onClick={onRetry} disabled={retryDisabled}>
              Retry
            </Button>
          </MessageBarActions>
        )}
      </MessageBar>
    </div>
  );
}
