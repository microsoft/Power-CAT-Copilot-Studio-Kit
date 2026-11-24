import type { ReactNode } from 'react';
import {
  Card,
  CardHeader,
  Caption1,
  Subtitle2,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { useAgentInventorySurfaceStyles } from '../../styles/surfaceStyles';

const useStyles = makeStyles({
  card: {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
  },
  description: {
    color: tokens.colorNeutralForeground2,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
});

interface SettingsSectionCardProps {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}

export function SettingsSectionCard({
  title,
  description,
  children,
  className,
}: SettingsSectionCardProps) {
  const styles = useStyles();
  const surfaceStyles = useAgentInventorySurfaceStyles();
  return (
    <Card className={mergeClasses(surfaceStyles.section, styles.card, className)}>
      <CardHeader
        header={<Subtitle2 as="h2">{title}</Subtitle2>}
        description={<Caption1 className={styles.description}>{description}</Caption1>}
      />
      <div className={styles.body}>{children}</div>
    </Card>
  );
}
