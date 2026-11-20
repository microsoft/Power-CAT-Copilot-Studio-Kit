import {
  Caption1,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Spinner,
  Switch,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { SelectAllOnRegular } from '@fluentui/react-icons';

export const QUICK_SELECT_COUNTS = [50, 100, 300] as const;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  greeting: { display: 'inline-flex', alignItems: 'center' },
  muted: { color: tokens.colorNeutralForeground3 },
  spacer: { flexGrow: 1 },
});

interface ConversationGridToolsProps {
  totalLabel: string;
  hideGreetingOnly: boolean;
  hiddenGreetingCount: number;
  onHideGreetingOnlyChange: (value: boolean) => void;
  selectingCount?: number;
  disabled: boolean;
  onSelectFirst: (count: number) => void;
}

/** Total count, greeting-only switch (CV-6) and "Select first N matching" (CV-12). */
export function ConversationGridTools({
  totalLabel,
  hideGreetingOnly,
  hiddenGreetingCount,
  onHideGreetingOnlyChange,
  selectingCount,
  disabled,
  onSelectFirst,
}: ConversationGridToolsProps) {
  const styles = useStyles();
  const selecting = selectingCount !== undefined;
  return (
    <div className={styles.root}>
      <Text weight="semibold" role="status" aria-live="polite">{totalLabel}</Text>
      <span className={styles.greeting}>
        <Tooltip content="Conversations where the user never replied to the greeting and has no user message" relationship="description">
          <Switch
            label="Hide greeting-only"
            checked={hideGreetingOnly}
            onChange={(_e, data) => onHideGreetingOnlyChange(data.checked)}
          />
        </Tooltip>
        {hideGreetingOnly && hiddenGreetingCount > 0 && (
          <Caption1 className={styles.muted}>({hiddenGreetingCount.toLocaleString()} hidden)</Caption1>
        )}
      </span>
      <span className={styles.spacer} />
      <Menu positioning="below-end">
        <MenuTrigger disableButtonEnhancement>
          <MenuButton
            size="small"
            appearance="subtle"
            disabled={disabled || selecting}
            icon={selecting ? <Spinner size="extra-tiny" /> : <SelectAllOnRegular />}
          >
            {selecting ? `Selecting ${selectingCount}…` : 'Quick select'}
          </MenuButton>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {QUICK_SELECT_COUNTS.map((count) => (
              <MenuItem key={count} onClick={() => onSelectFirst(count)}>
                {`First ${count} matching conversations`}
              </MenuItem>
            ))}
          </MenuList>
        </MenuPopover>
      </Menu>
    </div>
  );
}
