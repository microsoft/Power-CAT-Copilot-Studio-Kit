import React from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import type { DialogSectionProps } from '../contracts/types';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0',
    height: '21px',
    position: 'relative',
  },
  iconWrapper: {
    position: 'absolute',
    left: '3px',
    top: '2px',
    width: '20px',
    height: '20px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    backgroundImage: 'linear-gradient(135deg, #6264A7 0%, #464EB8 100%)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: '#6264A7',
  },
  label: {
    position: 'absolute',
    left: '24px',
    top: '0',
    fontSize: '14px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '21px',
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
  },
  action: {
    position: 'absolute',
    right: '0',
    top: '0',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    paddingLeft: '24px',
  },
});

export const DialogSection: React.FC<DialogSectionProps> = ({ icon, label, children, action }) => {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div className={styles.iconWrapper} aria-hidden="true">
          {icon}
        </div>
        <span className={styles.label}>{label}</span>
        {action && <div className={styles.action}>{action}</div>}
      </div>
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
};
