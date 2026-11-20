import { Badge, makeStyles } from '@fluentui/react-components';

const useStyles = makeStyles({
  badge: { flexShrink: 0, whiteSpace: 'nowrap' },
});

export function ConversationLabel() {
  const styles = useStyles();
  return <Badge className={styles.badge} appearance="tint" color="informative">Multi-turn</Badge>;
}
