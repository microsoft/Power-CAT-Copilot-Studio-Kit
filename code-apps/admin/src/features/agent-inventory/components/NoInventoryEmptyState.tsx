import { makeStyles, tokens, Title3, Body1, Button, Spinner, Tooltip } from '@fluentui/react-components';
import { ArrowSync20Regular, ArrowClockwise20Regular, Settings20Regular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    paddingTop: '40px',
    paddingRight: '24px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    maxWidth: '640px',
    marginLeft: 'auto',
    marginRight: 'auto',
    marginTop: '24px',
  },
  illustration: {
    width: '100%',
    maxWidth: '460px',
    marginBottom: '12px',
    '& svg': {
      width: '100%',
      height: 'auto',
      display: 'block',
    },
  },
  title: {
    marginTop: '8px',
    marginBottom: '12px',
    color: tokens.colorNeutralForeground1,
    letterSpacing: '-0.01em',
  },
  description: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '460px',
    marginBottom: '24px',
    lineHeight: '1.5',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalS,
  },
});

/** Hero illustration for the Agent Inventory empty state. Decorative — `aria-hidden`. */
function EmptyIllustration() {
  return (
    <svg viewBox="0 0 460 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Background panel */}
      <rect x="0" y="20" width="460" height="220" rx="12" fill="#F5F8FC" />

      {/* Floating chat bubbles / sparkles / cog */}
      <g opacity="0.85">
        <rect x="60" y="40" width="56" height="22" rx="11" fill="#FFFFFF" stroke="#D6E4F4" />
        <circle cx="72" cy="51" r="2.5" fill="#0F6CBD" />
        <circle cx="82" cy="51" r="2.5" fill="#0F6CBD" />
        <circle cx="92" cy="51" r="2.5" fill="#0F6CBD" />

        <rect x="340" y="44" width="46" height="20" rx="10" fill="#FFFFFF" stroke="#D6E4F4" />
        <path
          d="M348 54 l4 4 l8 -10"
          stroke="#0E7A0B"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <g transform="translate(395,80)">
          <path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z" fill="#5B5FC7" opacity="0.55" />
        </g>
        <g transform="translate(48,140)">
          <path d="M0 -6 L1.5 -1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5 -1.5 Z" fill="#0F6CBD" opacity="0.5" />
        </g>

        {/* Settings cog top right */}
        <g transform="translate(330,90)">
          <circle cx="0" cy="0" r="10" fill="none" stroke="#9DBBDD" strokeWidth="2" />
          <circle cx="0" cy="0" r="3" fill="#9DBBDD" />
          <g stroke="#9DBBDD" strokeWidth="2" strokeLinecap="round">
            <line x1="0" y1="-14" x2="0" y2="-11" />
            <line x1="0" y1="11" x2="0" y2="14" />
            <line x1="-14" y1="0" x2="-11" y2="0" />
            <line x1="11" y1="0" x2="14" y2="0" />
            <line x1="-10" y1="-10" x2="-8" y2="-8" />
            <line x1="8" y1="8" x2="10" y2="10" />
            <line x1="10" y1="-10" x2="8" y2="-8" />
            <line x1="-8" y1="8" x2="-10" y2="10" />
          </g>
        </g>
      </g>

      {/* Dashboard screen behind robot */}
      <g transform="translate(230,80)">
        <rect x="0" y="0" width="170" height="120" rx="8" fill="#FFFFFF" stroke="#CDDCEE" strokeWidth="1.5" />
        <rect x="0" y="0" width="170" height="18" rx="8" fill="#EBF3FC" />
        <circle cx="10" cy="9" r="2" fill="#0F6CBD" opacity="0.5" />
        <circle cx="18" cy="9" r="2" fill="#0F6CBD" opacity="0.5" />
        <circle cx="26" cy="9" r="2" fill="#0F6CBD" opacity="0.5" />

        {/* Bar chart */}
        <g transform="translate(14,34)">
          <rect x="0" y="40" width="10" height="20" fill="#5B5FC7" rx="2" />
          <rect x="16" y="24" width="10" height="36" fill="#0F6CBD" rx="2" />
          <rect x="32" y="10" width="10" height="50" fill="#0F6CBD" rx="2" />
          <rect x="48" y="32" width="10" height="28" fill="#5B5FC7" rx="2" />
        </g>

        {/* Donut + line area */}
        <g transform="translate(96,40)">
          <circle cx="22" cy="22" r="18" fill="none" stroke="#E0E0E0" strokeWidth="6" />
          <path
            d="M22 4 a18 18 0 0 1 15.6 27"
            fill="none"
            stroke="#0F6CBD"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </g>

        {/* Bottom line trend */}
        <polyline
          points="14,108 36,98 58,104 80,86 102,94 124,78 146,88"
          fill="none"
          stroke="#0F6CBD"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Robot body */}
      <g transform="translate(80,90)">
        {/* Antenna */}
        <line x1="55" y1="2" x2="55" y2="-12" stroke="#0F6CBD" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="55" cy="-14" r="3.5" fill="#5B5FC7" />

        {/* Head */}
        <rect x="22" y="0" width="66" height="56" rx="14" fill="#FFFFFF" stroke="#0F6CBD" strokeWidth="2.5" />
        {/* Face plate */}
        <rect x="30" y="12" width="50" height="32" rx="8" fill="#E8F2FC" />
        {/* Eyes */}
        <circle cx="44" cy="28" r="5" fill="#0F6CBD" />
        <circle cx="66" cy="28" r="5" fill="#0F6CBD" />
        <circle cx="45" cy="27" r="1.5" fill="#FFFFFF" />
        <circle cx="67" cy="27" r="1.5" fill="#FFFFFF" />
        {/* Smile */}
        <path d="M48 38 Q55 43 62 38" stroke="#0F6CBD" strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* Ear pods */}
        <rect x="14" y="20" width="10" height="16" rx="4" fill="#5B5FC7" />
        <rect x="86" y="20" width="10" height="16" rx="4" fill="#5B5FC7" />

        {/* Neck */}
        <rect x="48" y="56" width="14" height="6" fill="#CDDCEE" />

        {/* Body */}
        <rect x="14" y="62" width="82" height="48" rx="12" fill="#FFFFFF" stroke="#0F6CBD" strokeWidth="2.5" />
        <rect x="26" y="74" width="58" height="24" rx="6" fill="#E8F2FC" />
        {/* Mini indicators on chest */}
        <circle cx="38" cy="86" r="3" fill="#0E7A0B" />
        <circle cx="55" cy="86" r="3" fill="#BC4B09" />
        <circle cx="72" cy="86" r="3" fill="#5B5FC7" />
      </g>

      {/* Magnifying glass (front) */}
      <g transform="translate(150,160)">
        <circle cx="0" cy="0" r="34" fill="#FFFFFF" fillOpacity="0.6" stroke="#0F6CBD" strokeWidth="4" />
        <circle cx="0" cy="0" r="30" fill="#EBF3FC" fillOpacity="0.55" />
        {/* Inner reflection */}
        <path
          d="M-18 -10 Q-22 -22 -8 -24"
          stroke="#FFFFFF"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity="0.9"
        />
        {/* Handle */}
        <line x1="24" y1="24" x2="50" y2="50" stroke="#0F6CBD" strokeWidth="8" strokeLinecap="round" />
        <line x1="24" y1="24" x2="50" y2="50" stroke="#5B5FC7" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

interface NoInventoryEmptyStateProps {
  onSyncAgents: () => void;
  onOpenSettings: () => void;
  onRefreshData: () => void;
  syncPending: boolean;
  syncDisabled: boolean;
  syncInProgress: boolean;
  syncInProgressTooltip: string;
  refreshInProgress: boolean;
}

/** Empty state shown on the Agent Inventory dashboard when no agent records exist yet. */
export function NoInventoryEmptyState({
  onSyncAgents,
  onOpenSettings,
  onRefreshData,
  syncPending,
  syncDisabled,
  syncInProgress,
  syncInProgressTooltip,
  refreshInProgress,
}: NoInventoryEmptyStateProps) {
  const styles = useStyles();

  return (
    <div className={styles.root} role="region" aria-label="No agents found">
      <div className={styles.illustration}>
        <EmptyIllustration />
      </div>
      <Title3 className={styles.title}>No agents found</Title3>
      <Body1 className={styles.description}>
        Sync agents to build your Agent Inventory and monitor adoption, usage, ownership, and
        governance across every Copilot Studio and Microsoft 365 agent in your tenant.
      </Body1>
      <div className={styles.actions}>
        <Tooltip
          content={syncDisabled
            ? syncInProgressTooltip
            : 'Sync agents to run the agent data load and build the inventory.'}
          relationship="description"
        >
          <Button
            appearance="primary"
            icon={syncPending ? <Spinner size="tiny" /> : <ArrowSync20Regular />}
            onClick={onSyncAgents}
            disabledFocusable={syncDisabled}
          >
            Sync agents
          </Button>
        </Tooltip>
        <Tooltip
          content={refreshInProgress
            ? 'Refreshing dashboard data from source tables.'
            : 'Refresh dashboard data from source tables.'}
          relationship="label"
        >
          <Button
            appearance="outline"
            icon={refreshInProgress ? <Spinner size="tiny" /> : <ArrowClockwise20Regular />}
            aria-label="Refresh dashboard data from source tables"
            onClick={onRefreshData}
            disabledFocusable={refreshInProgress}
          />
        </Tooltip>
        <Tooltip
          content={syncInProgress ? syncInProgressTooltip : 'Sync configuration and settings for the Agent Inventory.'}
          relationship="label"
        >
          <Button
            appearance="outline"
            icon={<Settings20Regular />}
            aria-label="Open Agent Inventory settings"
            onClick={onOpenSettings}
            disabledFocusable={syncInProgress}
          />
        </Tooltip>
      </div>
    </div>
  );
}
