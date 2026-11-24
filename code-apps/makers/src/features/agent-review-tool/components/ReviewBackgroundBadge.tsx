import type { ReactNode } from 'react';
import {
  FluentProvider,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { copilotStudioReviewLightTheme } from '../agents-experience/components/copilotStudioReviewTheme';

const useStyles = makeStyles({
  badge: {
    position: 'fixed',
    right: '24px',
    bottom: '24px',
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    maxWidth: '380px',
    '& + &': {
      bottom: '80px',
    },
    '& + & + &': {
      bottom: '136px',
    },
  },
});

/** Displays a persistent review status above page content and below dialogs. */
export function ReviewBackgroundBadge({
  children,
  announce = true,
}: {
  children: ReactNode;
  announce?: boolean;
}) {
  const styles = useStyles();

  return (
    <FluentProvider
      className={styles.badge}
      theme={copilotStudioReviewLightTheme}
      role={announce ? 'status' : undefined}
      aria-live={announce ? 'polite' : undefined}
    >
      {children}
    </FluentProvider>
  );
}
