import { Button, Text, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { CheckmarkCircleRegular, CopyRegular, DismissRegular } from '@fluentui/react-icons';
import type { PolicyRequestSummary } from '../../../models/policyRequest';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorBrandBackground2,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorBrandStroke1,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    overflow: 'hidden',
    transitionProperty: 'max-height, opacity',
    transitionDuration: tokens.durationFaster,
    transitionTimingFunction: 'ease',
  },
  selectedLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    flexShrink: 0,
  },
  separator: {
    width: '1px',
    height: '14px',
    backgroundColor: tokens.colorBrandStroke1,
    flexShrink: 0,
  },
  hintText: {
    color: tokens.colorBrandForeground2,
    flexShrink: 0,
    marginLeft: 'auto',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface ContextualToolbarProps {
  selectedRequest: PolicyRequestSummary | null;
  onDismiss: () => void;
  onCloneClick: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ContextualToolbar({
  selectedRequest,
  onDismiss,
  onCloneClick,
}: ContextualToolbarProps) {
  const styles = useStyles();
  const isVisible = selectedRequest !== null;

  return (
    <div
      className={styles.toolbar}
      style={{
        maxHeight: isVisible ? '38px' : '0px',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
      aria-hidden={!isVisible}
    >
      {selectedRequest && (
        <>
          {/* Selected label */}
          <Text size={200} className={styles.selectedLabel}>
            <CheckmarkCircleRegular />
            {selectedRequest.requestNumber} selected
          </Text>

          <div className={styles.separator} />

          {/* Clone button */}
          <Button
            appearance="primary"
            size="small"
            icon={<CopyRegular />}
            onClick={onCloneClick}
            aria-label={`Clone ${selectedRequest.requestNumber}`}
          >
            Clone
          </Button>

          {/* Hint text */}
          <Text size={100} className={styles.hintText}>Double-click to view details</Text>

          {/* Dismiss */}
          <Tooltip content="Deselect" relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<DismissRegular />}
              onClick={onDismiss}
              aria-label="Deselect request"
            />
          </Tooltip>
        </>
      )}
    </div>
  );
}

export default ContextualToolbar;
