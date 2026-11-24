import { makeStyles, tokens, Card, CardHeader, Body1, Caption1 } from '@fluentui/react-components';
import {
  PeopleTeam24Regular, ChatMultiple24Regular, ShieldCheckmark24Regular,
  Gauge24Regular, Wrench24Regular, BookOpen24Regular,
  LockClosed24Regular, Star24Regular, Money24Regular, Bot24Regular,
  Beaker24Regular,
} from '@fluentui/react-icons';
import type { MetricDomain } from '../../services/suggestedMetrics';
import type { MetricDefinition } from '../../types';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalL,
    marginBottom: tokens.spacingVerticalL,
    '@media (max-width: 900px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
    '@media (max-width: 600px)': {
      gridTemplateColumns: '1fr',
    },
  },
  card: {
    cursor: 'pointer',
    padding: tokens.spacingVerticalL,
    transition: 'box-shadow 0.15s ease',
    ':hover': {
      boxShadow: tokens.shadow8,
    },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: tokens.colorStrokeFocus2,
      borderRadius: tokens.borderRadiusMedium,
    },
  },
  iconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
  },
});

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  PeopleTeam: PeopleTeam24Regular,
  ChatMultiple: ChatMultiple24Regular,
  ShieldCheckmark: ShieldCheckmark24Regular,
  Gauge: Gauge24Regular,
  Wrench: Wrench24Regular,
  BookOpen: BookOpen24Regular,
  LockClosed: LockClosed24Regular,
  Star: Star24Regular,
  Money: Money24Regular,
  Bot: Bot24Regular,
  Beaker: Beaker24Regular,
};

interface DomainCardsProps {
  domains: MetricDomain[];
  /** @deprecated Progress badges removed; retained for caller compatibility. */
  existingMetrics: MetricDefinition[];
  onDomainClick: (domain: MetricDomain) => void;
}

export function DomainCards({ domains, onDomainClick }: DomainCardsProps) {
  const s = useStyles();

  return (
    <div className={s.grid}>
      {domains.map(domain => {
        const Icon = ICON_MAP[domain.icon] ?? Bot24Regular;

        return (
          <Card
            key={domain.id}
            className={s.card}
            role="button"
            tabIndex={0}
            onClick={() => onDomainClick(domain)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onDomainClick(domain);
              }
              if (e.key === ' ') e.preventDefault();
            }}
            onKeyUp={(e: React.KeyboardEvent) => {
              if (e.key === ' ') {
                e.preventDefault();
                onDomainClick(domain);
              }
            }}
          >
            <CardHeader
              image={
                <div className={s.iconContainer} aria-hidden="true">
                  <Icon />
                </div>
              }
              header={<Body1><b>{domain.label}</b></Body1>}
              description={<Caption1>{domain.description}</Caption1>}
            />
          </Card>
        );
      })}
    </div>
  );
}
