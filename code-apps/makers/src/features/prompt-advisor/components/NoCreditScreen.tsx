import { makeStyles, Body1, Subtitle2, tokens } from '@fluentui/react-components';
import { Warning20Regular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalL,
    height: '100%',
    minHeight: '400px',
    padding: tokens.spacingHorizontalXXL,
    textAlign: 'center',
  },
  icon: {
    color: tokens.colorPaletteYellowForeground1,
    fontSize: '48px',
    width: '48px',
    height: '48px',
  },
  message: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '500px',
  },
});

export function NoCreditScreen() {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <Warning20Regular className={styles.icon} />
      <Subtitle2>No credits available</Subtitle2>
      <Body1 className={styles.message}>
        AI Builder credits are exhausted or the entitlement is not available in this environment.
        Please contact your administrator to restore AI Builder credits.
      </Body1>
    </div>
  );
}
