import {
  Body1,
  Body1Strong,
  Caption1,
  Card,
  CardHeader,
  Link,
  makeStyles,
  mergeClasses,
  Subtitle2,
  tokens,
} from '@fluentui/react-components';
import type { AgentMetadataRow } from '../../contracts/types';
import { useAgentInventorySurfaceStyles } from '../../styles/surfaceStyles';

const useStyles = makeStyles({
  card: {
    width: '100%',
    boxSizing: 'border-box',
    padding: 0,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 0`,
  },
  table: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
  },
  row: {
    minHeight: '41px',
    display: 'grid',
    gridTemplateColumns: '240px minmax(0, 1fr)',
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 640px)': { gridTemplateColumns: '1fr' },
  },
  label: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  value: {
    minWidth: 0,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    overflowWrap: 'anywhere',
  },
});

function safeHttps(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function AgentMetadataTab({ rows }: { rows: AgentMetadataRow[] }) {
  const styles = useStyles();
  const surfaceStyles = useAgentInventorySurfaceStyles();
  return (
    <Card className={mergeClasses(surfaceStyles.section, styles.card)}>
      <CardHeader
        className={styles.header}
        header={<Subtitle2 as="h2">Inventory metadata</Subtitle2>}
        description={<Caption1>Dataverse and One Inventory identifiers and collection details.</Caption1>}
      />
      <div className={styles.table}>
        {rows.map((row) => {
          const url = safeHttps(row.url);
          return (
            <div key={row.label} className={styles.row}>
              <Body1Strong className={styles.label}>{row.label}</Body1Strong>
              <Body1 className={styles.value}>
                {url ? <Link href={url} target="_blank" rel="noopener noreferrer">{row.value}</Link> : row.value}
              </Body1>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
