import { makeStyles, tokens, Title2, Body1, Tooltip, Button, Badge } from '@fluentui/react-components';
import { CoinStackRegular, QuestionCircle24Regular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  text: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  description: {
    color: tokens.colorNeutralForeground2,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
  creditsBadge: {
    position: 'relative',
    top: tokens.spacingVerticalXXS,
    backgroundColor: tokens.colorNeutralBackground5,
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightRegular,
    cursor: 'help',
    '::after': {
      borderTopStyle: 'none',
      borderRightStyle: 'none',
      borderBottomStyle: 'none',
      borderLeftStyle: 'none',
    },
    '& svg': {
      opacity: 0.75,
    },
  },
  helpIcon: {
    color: tokens.colorNeutralForeground2,
  },
});

interface PageHeaderProps {
  title: string;
  description: string;
  helpUrl?: string;
  creditsDescription?: string;
}

/** Renders the feature heading with optional help and credit usage information. */
export function PageHeader({ title, description, helpUrl, creditsDescription }: PageHeaderProps) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <div className={styles.text}>
        <div className={styles.titleRow}>
          <Title2 as="h1">{title}</Title2>
          {creditsDescription && (
            <Tooltip relationship="description" content={creditsDescription} withArrow>
              <Badge
                appearance="outline"
                shape="circular"
                size="medium"
                icon={<CoinStackRegular />}
                className={styles.creditsBadge}
                tabIndex={0}
                aria-label={`Uses Copilot Credits. ${creditsDescription}`}
              >
                Uses Copilot Credits
              </Badge>
            </Tooltip>
          )}
        </div>
        <Body1 className={styles.description}>{description}</Body1>
      </div>
      {helpUrl ? (
        <Tooltip content="Help" relationship="label">
          <Button
            appearance="transparent"
            icon={<QuestionCircle24Regular />}
            aria-label="Help"
            onClick={() => window.open(helpUrl, '_blank', 'noopener,noreferrer')}
          />
        </Tooltip>
      ) : (
        <QuestionCircle24Regular className={styles.helpIcon} aria-hidden />
      )}
    </div>
  );
}
