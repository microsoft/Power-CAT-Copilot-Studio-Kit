import React from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
  BreadcrumbDivider,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useNavigate } from '../hooks/useNavigate';

const useStyles = makeStyles({
  breadcrumb: {
    alignSelf: 'flex-start',
    marginBottom: '-4px',
  },
  breadcrumbButton: {
    backgroundColor: 'transparent',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  currentItem: {
    color: tokens.colorNeutralForeground1,
    fontWeight: 600,
    backgroundColor: 'transparent',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
});

export interface BreadcrumbSegment {
  label: string;
  /** Route to navigate to. Omit for the current (last) segment. */
  route?: string;
  /** Custom click handler (used instead of route navigation). */
  onClick?: () => void;
}

interface PowerShieldBreadcrumbProps {
  /** Breadcrumb path segments after "Home". Last segment is rendered as current (non-clickable). */
  segments: BreadcrumbSegment[];
}

/**
 * System-wide breadcrumb for PowerShield screens.
 * Always renders "Home" as the first clickable item, followed by the provided segments.
 */
export function PowerShieldBreadcrumb({ segments }: PowerShieldBreadcrumbProps) {
  const styles = useStyles();
  const navigate = useNavigate();

  return (
    <Breadcrumb className={styles.breadcrumb} aria-label="Navigation">
      {/* Home — always first */}
      <BreadcrumbItem>
        <BreadcrumbButton onClick={() => void navigate('/')} className={styles.breadcrumbButton}>
          Home
        </BreadcrumbButton>
      </BreadcrumbItem>

      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <React.Fragment key={segment.label}>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              {isLast ? (
                <BreadcrumbButton current className={styles.currentItem}>
                  {segment.label}
                </BreadcrumbButton>
              ) : (
                <BreadcrumbButton onClick={() => {
                  if (segment.onClick) {
                    segment.onClick();
                  } else if (segment.route) {
                    void navigate(segment.route);
                  }
                }} className={styles.breadcrumbButton}>
                  {segment.label}
                </BreadcrumbButton>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        );
      })}
    </Breadcrumb>
  );
}
