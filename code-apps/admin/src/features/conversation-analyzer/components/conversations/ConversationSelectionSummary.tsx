import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import { SelectionLimitMeter } from '../shared/SelectionLimitMeter';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

interface ConversationSelectionSummaryProps {
  selectedCount: number;
  onClear: () => void;
  clearDisabled?: boolean;
}

/** Selection summary above the grid with the 300 limit meter and Clear (CV-13). */
export function ConversationSelectionSummary({ selectedCount, onClear, clearDisabled }: ConversationSelectionSummaryProps) {
  const styles = useStyles();
  if (selectedCount === 0) return null;
  return (
    <div className={styles.root}>
      <Text weight="semibold">{selectedCount.toLocaleString()} selected</Text>
      <SelectionLimitMeter count={selectedCount} />
      <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={onClear} disabled={clearDisabled}>
        Clear
      </Button>
    </div>
  );
}
