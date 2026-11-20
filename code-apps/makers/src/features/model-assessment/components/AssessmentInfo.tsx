import { Button, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { Info20Regular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  button: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
  icon: { width: '16px', height: '16px', color: tokens.colorNeutralForeground3 },
});

export function AssessmentInfo({ content }: { content: string }) {
  const styles = useStyles();
  return (
    <Tooltip content={content} relationship="label" withArrow>
      <Button
        appearance="subtle"
        size="small"
        className={styles.button}
        icon={<Info20Regular className={styles.icon} />}
      />
    </Tooltip>
  );
}
