import { makeStyles, tokens, Card, CardHeader, Body1, Subtitle2, Text } from '@fluentui/react-components';
import { HexagonThree24Regular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXL}`,
  },
  sectionTitle: {
    marginBottom: tokens.spacingVerticalS,
  },
  cardsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
  card: {
    width: '240px',
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusLarge,
    ':hover': {
      boxShadow: tokens.shadow8,
    },
  },
  iconWrap: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: tokens.colorBrandBackground,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForegroundOnBrand,
  },
  cardDescription: {
    color: tokens.colorNeutralForeground2,
  },
});

export default function HomePage() {
  const styles = useStyles();
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <div>
        <h1>Home</h1>
        <p>Welcome to Copilot Agent Kit.</p>
      </div>

      <div>
        <Subtitle2 className={styles.sectionTitle}>Productivity</Subtitle2>
        <div className={styles.cardsRow}>
          <Card
            className={styles.card}
            appearance="filled"
            onClick={() => navigate('/component-library')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate('/component-library');
            }}
            aria-label="Navigate to Component Library"
          >
            <CardHeader
              image={
                <div className={styles.iconWrap} aria-hidden="true">
                  <HexagonThree24Regular />
                </div>
              }
              header={<Text weight="semibold">Component Library</Text>}
              description={
                <Body1 className={styles.cardDescription}>
                  Browse, evaluate, and install reusable agent component solutions.
                </Body1>
              }
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
