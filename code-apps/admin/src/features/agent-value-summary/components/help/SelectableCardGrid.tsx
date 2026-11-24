/**
 * SelectableCardGrid — 2-column grid of selectable Fluent UI Cards.
 * Used on both the Agent Type and Agent Behavior help screens.
 */
import { makeStyles, tokens, Card } from '@fluentui/react-components';
import { Body1, Caption1, Subtitle2 } from '@fluentui/react-components';

interface SelectableCardItem {
  name: string;
  description: string;
  example?: string;
}

interface SelectableCardGridProps {
  items: SelectableCardItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingVerticalM,
  },
  card: {
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusLarge,
    padding: tokens.spacingVerticalL,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  cardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  exampleText: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
});

/**
 * Renders a 2-column grid of selectable cards. The selected card is
 * highlighted with a brand-blue border; others have a subtle shadow.
 */
export function SelectableCardGrid({
  items,
  selectedIndex,
  onSelect,
}: SelectableCardGridProps) {
  const styles = useStyles();

  return (
    <div className={styles.grid} role="listbox" aria-label="Select an item">
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Card
            key={item.name}
            role="option"
            aria-selected={isSelected}
            className={styles.card}
            style={{
              border: isSelected
                ? `2px solid ${tokens.colorBrandStroke1}`
                : `2px solid transparent`,
              boxShadow: isSelected ? 'none' : tokens.shadow4,
            }}
            onClick={() => onSelect(index)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(index);
              }
            }}
            tabIndex={0}
            appearance="filled"
          >
            <div className={styles.cardContent}>
              <Subtitle2>{item.name}</Subtitle2>
              <Body1>{item.description}</Body1>
              {item.example && (
                <Caption1 className={styles.exampleText}>
                  Example: &lsquo;{item.example}&rsquo;
                </Caption1>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default SelectableCardGrid;
