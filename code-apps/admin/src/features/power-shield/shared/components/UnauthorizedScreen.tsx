import { makeStyles, Text, tokens } from '@fluentui/react-components';
import { LockClosedRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXXL,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalXXL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow16,
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center',
  },
  icon: {
    color: tokens.colorNeutralForeground3,
    fontSize: '48px',
  },
  title: {
    color: tokens.colorNeutralForeground1,
  },
  message: {
    color: tokens.colorNeutralForeground2,
  },
});

export function UnauthorizedScreen() {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <LockClosedRegular className={styles.icon} />
        <Text size={500} weight="semibold" className={styles.title}>
          Access Required
        </Text>
        <Text size={300} className={styles.message}>
          You need the <strong>CSK - Administrator</strong> security role to use this app.
        </Text>
        <Text size={300} className={styles.message}>
          Contact your administrator to get the role assigned.
        </Text>
      </div>
    </div>
  );
}
