import { useMemo, useState } from 'react';
import {
  makeStyles,
  tokens,
  Body1Strong,
  Body1,
  Badge,
  Caption1,
  Subtitle2,
  Button,
  Spinner,
  Avatar,
  Combobox,
  Option,
  OptionGroup,
  Tag,
  TagGroup,
  Tooltip,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  MessageBar,
  MessageBarBody,
  mergeClasses,
} from '@fluentui/react-components';
import { AddRegular, AppsListRegular, DismissRegular, EyeTrackingOffRegular } from '@fluentui/react-icons';
import { AddAgentDialog } from './AddAgentDialog';
import {
  PENDING_TRACKING_CONFIG_PREFIX,
  useAllAgentsChangeLog,
  useTrackingConfigs,
  useRemoveTrackingConfig,
  useTrackableAgents,
  useAgentIcons,
  useDeletedTrackingConfigs,
} from '../hooks/useChangeTracker';
import { type TrackingConfig } from '../contracts/change-tracker';

/** Stable empty list, so the change-log queries stay disabled between renders. */
const EMPTY_CONFIGS: TrackingConfig[] = [];

/**
 * Icon edge length, matched to the height of the two text lines beside it:
 * lineHeightBase300 (name, 20px) + lineHeightBase200 (environment, 16px), with
 * no gap between them. Also a valid Fluent `Avatar` size, so the image and the
 * initials fallback render identically.
 */
const ICON_SIZE = '36px';
const AVATAR_SIZE = 36;

const useStyles = makeStyles({
  removeError: {
    marginTop: tokens.spacingVerticalM,
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    width: '30%',
    minWidth: '280px',
    maxWidth: '380px',
    flex: '0 0 30%',
    // Stretch to the card's full height so the right-hand divider runs the
    // whole way down. `height: 100%` cannot be used here: the page sizes itself
    // with `min-height`, so there is no definite parent height to resolve
    // against and the panel would collapse to its content.
    alignSelf: 'stretch',
    boxSizing: 'border-box',
    padding: tokens.spacingVerticalL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 639px)': {
      width: '100%',
      minWidth: 0,
      maxWidth: 'none',
      height: '40%',
      minHeight: '220px',
      flexBasis: 'auto',
      borderRight: 'none',
      borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  // "Tracked agents" is a real <h2>; Fluent's Text keeps the UA heading margin,
  // which would apply here because the heading is a flex item.
  heading: {
    margin: 0,
  },
  filterHintRow: {
    // Caption and its clear button sit together, so the control is next to the
    // criteria it clears rather than beside the search box.
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalXS,
    width: '100%',
    flexShrink: 0,
  },
  selectionTag: {
    // Fills the rail like the search box it replaces, with the label taking the
    // space and the dismiss control sitting at its right edge.
    width: '100%',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  search: {
    width: '100%',
    flexShrink: 0,
    // Combobox is inline-grid by default and would not fill the rail.
    minWidth: 0,
  },
  optionBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  optionName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  optionMeta: {
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userSearchHint: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
  scroll: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    paddingRight: tokens.spacingHorizontalXS,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    // No gap: rows are separated by a divider rule, not whitespace.
    gap: 0,
  },
  item: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalS,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    transitionProperty: 'background-color',
    transitionDuration: tokens.durationFaster,
    transitionTimingFunction: tokens.curveEasyEase,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    // The trailing rule would double up with the panel edge.
    ':last-child': {
      borderBottomWidth: 0,
    },
  },
  // The row's primary action. It is a real button and a *sibling* of the remove
  // button rather than its ancestor: ARIA forbids focusable descendants inside
  // a button, and nesting them made the remove control unreachable in a screen
  // reader's browse mode.
  itemMain: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flex: '1 1 auto',
    minWidth: 0,
    cursor: 'pointer',
    textAlign: 'left',
    // Strip the UA button chrome so the row looks exactly as it did.
    appearance: 'none',
    backgroundColor: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '-2px',
      borderRadius: tokens.borderRadiusMedium,
    },
    ':disabled': {
      cursor: 'default',
    },
  },
  itemSelected: {
    backgroundColor: tokens.colorNeutralBackground3,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  avatar: {
    flexShrink: 0,
  },
  iconImage: {
    flexShrink: 0,
    width: ICON_SIZE,
    height: ICON_SIZE,
    objectFit: 'contain',
    backgroundColor: 'transparent',
  },
  itemBody: {
    display: 'flex',
    flexDirection: 'column',
    // No gap: the icon is sized to line-height(name) + line-height(environment),
    // so any gap here would make the text block taller than the icon.
    minWidth: 0,
    flex: '1 1 auto',
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
  },
  deletedBadge: {
    flexShrink: 0,
  },
  env: {
    display: 'block',
    color: tokens.colorNeutralForeground3,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  menuWrap: {
    flexShrink: 0,
    alignSelf: 'center',
  },
  dangerText: {
    color: tokens.colorNeutralForeground3,
    ':hover': {
      color: tokens.colorPaletteRedForeground1,
    },
    ':hover:active': {
      color: tokens.colorPaletteRedForeground1,
    },
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
  },
  loadError: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalS,
  },
  bootstrapContent: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: tokens.spacingVerticalL,
    paddingBottom: tokens.spacingVerticalL,
  },
  screenReaderOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
  },
});

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

interface TrackedAgentsPanelProps {
  /**
   * Tracking configuration row id of the selected agent — NOT the agent id,
   * which is not unique across environments. `'all'` selects the aggregate
   * across every tracked agent.
   */
  selectedConfigId: string | 'all' | undefined;
  onSelectAgent: (agent: TrackingConfig) => void;
  onSelectAllAgents: () => void;
  /** Clears the right pane back to the "No agent selected" prompt. */
  onSelectNone: () => void;
  onRemoveAgent: (agent: TrackingConfig) => void;
}

/** Left rail: configured agents, tracking status, search and selection. */
export function TrackedAgentsPanel({
  selectedConfigId,
  onSelectAgent,
  onSelectAllAgents,
  onSelectNone,
  onRemoveAgent,
}: TrackedAgentsPanelProps) {
  const styles = useStyles();
  const {
    data: configs,
    error: configsError,
    isError: isConfigsError,
    isFirstRunBootstrapPending,
    isLoading: isConfigsLoading,
    refetch: refetchConfigs,
  } = useTrackingConfigs();
  const persistedConfigs = useMemo(
    () => configs?.filter((config) => !config.id.startsWith(PENDING_TRACKING_CONFIG_PREFIX)),
    [configs],
  );
  const deletedConfigs = useDeletedTrackingConfigs(persistedConfigs);
  const { data: trackable } = useTrackableAgents();
  const icons = useAgentIcons(persistedConfigs);
  const remove = useRemoveTrackingConfig();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** Contributor picked from the dropdown; filters the rail to their agents. */
  const [selectedUser, setSelectedUser] = useState<string | undefined>(undefined);
  /** Agent picked from the dropdown; filters the rail to just that agent. */
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [comboOpen, setComboOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TrackingConfig | undefined>(undefined);
  const isConfigsPending = isConfigsLoading || isFirstRunBootstrapPending;

  const confirmRemove = () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(undefined);
    onRemoveAgent(target);
    remove.mutate(target);
  };

  const count = configs?.length ?? 0;
  const countLabel = useMemo(
    () => (count === 0 ? 'No agents yet' : `${count} ${count === 1 ? 'agent' : 'agents'}`),
    [count],
  );

  const environmentNames = useMemo(() => {
    const map = new Map<string, string>();
    (trackable ?? []).forEach((a) => {
      if (!a.environmentName) return;
      if (a.environmentId) map.set(`id:${a.environmentId.toLowerCase()}`, a.environmentName);
      if (a.environmentUrl) {
        map.set(`url:${a.environmentUrl.trim().replace(/\/+$/g, '').toLowerCase()}`, a.environmentName);
      }
    });
    return map;
  }, [trackable]);

  const environmentNameFor = (config: TrackingConfig): string | undefined => {
    if (config.environmentId) {
      const byId = environmentNames.get(`id:${config.environmentId.toLowerCase()}`);
      if (byId) return byId;
    }
    if (config.environmentUrl) {
      return environmentNames.get(`url:${config.environmentUrl.trim().replace(/\/+$/g, '').toLowerCase()}`);
    }
    return undefined;
  };

  // Change history is needed to list contributors and to resolve which agents a
  // person changed, and it costs one query per tracked agent — so it stays
  // switched off until the dropdown is opened, the box is typed in, or a user
  // is selected. Dropping `selectedUser` from this gate empties the contributor
  // map the moment the dropdown closes, which made every user selection report
  // "No matches".
  const search = useMemo(() => query.trim().toLowerCase(), [query]);
  const needsChangeLog = comboOpen || Boolean(search) || Boolean(selectedUser);
  const { entries: searchEntries, isLoading: isUserSearchLoading } = useAllAgentsChangeLog(
    needsChangeLog ? persistedConfigs : EMPTY_CONFIGS,
  );

  /** Every contributor per agent, keyed by both config id and agent id. */
  const usersByAgent = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of searchEntries) {
      const name = entry.changedByName?.trim();
      if (!name) continue;
      // Dataverse entries carry the config id; local preview only the agent id.
      for (const key of [entry.configId, entry.agentId]) {
        if (!key) continue;
        const names = map.get(key) ?? new Set<string>();
        names.add(name);
        map.set(key, names);
      }
    }
    return map;
  }, [searchEntries]);

  /** Distinct contributor names across every tracked agent. */
  const allUsers = useMemo(() => {
    const names = new Set<string>();
    for (const set of usersByAgent.values()) for (const name of set) names.add(name);
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [usersByAgent]);

  const changedBy = (config: TrackingConfig): Set<string> =>
    new Set<string>([
      ...(usersByAgent.get(config.id) ?? []),
      ...(usersByAgent.get(config.agentId) ?? []),
    ]);

  const matchesName = (config: TrackingConfig): boolean => {
    const name = (config.agentName || config.agentId).toLowerCase();
    const host = config.environmentUrl ? safeHostname(config.environmentUrl).toLowerCase() : '';
    return name.includes(search) || host.includes(search);
  };

  /** Agents section of the dropdown: matched on the agent's own name. */
  const agentMatches = useMemo(() => {
    const list = configs ?? [];
    return search ? list.filter(matchesName) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs, search]);

  /** Users section of the dropdown. */
  const userMatches = useMemo(
    () => (search ? allUsers.filter((name) => name.toLowerCase().includes(search)) : allUsers),
    [allUsers, search],
  );

  const filtered = useMemo(() => {
    const list = configs ?? [];
    // A picked agent narrows the rail to itself, mirroring the tag on screen.
    if (selectedAgentId) return list.filter((c) => c.id === selectedAgentId);
    // A picked user filters the rail to the agents they changed.
    if (selectedUser) {
      return list.filter((c) => changedBy(c).has(selectedUser));
    }
    if (!search) return list;
    // While typing, match either the agent's own name or one of its contributors.
    return list.filter(
      (c) =>
        matchesName(c) ||
        [...changedBy(c)].some((name) => name.toLowerCase().includes(search)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs, search, selectedUser, selectedAgentId, usersByAgent]);

  /** Label shown on the selection tag, or undefined when nothing is picked. */
  const selectionLabel = useMemo(() => {
    if (selectedUser) return selectedUser;
    if (!selectedAgentId) return undefined;
    const match = (configs ?? []).find((c) => c.id === selectedAgentId);
    return match ? match.agentName || match.agentId : undefined;
  }, [configs, selectedUser, selectedAgentId]);

  /** Return to the unfiltered rail and the aggregate view. */
  const clearSelection = () => {
    setQuery('');
    setSelectedUser(undefined);
    setSelectedAgentId(undefined);
    setComboOpen(false);
    onSelectAllAgents();
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <Subtitle2 as="h2" className={styles.heading}>Tracked agents</Subtitle2>
          <Caption1>{countLabel}</Caption1>
        </div>
        <Button
          appearance="primary"
          icon={<AddRegular />}
          disabled={isConfigsPending}
          onClick={() => setDialogOpen(true)}
        >
          Track Agent
        </Button>
      </div>

      {count > 0 && (
        selectionLabel ? (
          // Once something is picked it becomes a single dismissible token
          // rather than editable text, with the clear control on the token.
          // Dismiss is a TagGroup concern in Fluent v9, not a Tag prop.
          <TagGroup
            className={styles.selectionTag}
            onDismiss={clearSelection}
            aria-label="Active filter"
          >
            <Tag
              dismissible
              value="selection"
              dismissIcon={{ 'aria-label': 'Clear selection' }}
              secondaryText={selectedUser ? 'User' : 'Agent'}
            >
              {/* Fluent truncates the tag's primary text, so the full name has
                  to stay reachable on hover. */}
              <Tooltip content={selectionLabel} relationship="label" withArrow>
                <span>{selectionLabel}</span>
              </Tooltip>
            </Tag>
          </TagGroup>
        ) : (
        <>
          <Combobox
            className={styles.search}
            freeform
            placeholder="Search by agent or user…"
            value={query}
            selectedOptions={[]}
            open={comboOpen}
            onOpenChange={(_, data) => setComboOpen(data.open)}
            onChange={(event) => {
              setQuery(event.target.value);
              // Typing replaces a picked user rather than compounding with it.
              setSelectedUser(undefined);
            }}
            onOptionSelect={(_, data) => {
              const value = data.optionValue ?? '';
              if (value.startsWith('agent:')) {
                const match = (configs ?? []).find((c) => c.id === value.slice(6));
                if (!match) {
                  onSelectNone();
                  return;
                }
                // Show the pick as a tag and open the agent.
                setSelectedAgentId(match.id);
                setSelectedUser(undefined);
                setQuery('');
                setComboOpen(false);
                onSelectAgent(match);
                return;
              }
              if (value.startsWith('user:')) {
                const name = value.slice(5);
                // Picking a person filters the rail to the agents they changed
                // and opens the first of them, rather than leaving the
                // previously opened agent on screen.
                setSelectedUser(name);
                setSelectedAgentId(undefined);
                setQuery('');
                setComboOpen(false);
                const first = (configs ?? []).find(
                  (c) =>
                    !c.id.startsWith(PENDING_TRACKING_CONFIG_PREFIX) && changedBy(c).has(name),
                );
                if (first) onSelectAgent(first);
                else onSelectNone();
              }
            }}
            aria-label="Search agents by name, or by the person who changed them"
          >
            {agentMatches.length > 0 && (
              <OptionGroup label="Agents">
                {agentMatches.map((config) => {
                  const label = config.agentName || config.agentId;
                  const secondary =
                    environmentNameFor(config) ??
                    (config.environmentUrl ? safeHostname(config.environmentUrl) : undefined);
                  return (
                    <Option key={config.id} value={`agent:${config.id}`} text={label}>
                      <span className={styles.optionBody}>
                        <Body1 className={styles.optionName}>{label}</Body1>
                        {secondary && (
                          <Caption1 className={styles.optionMeta}>{secondary}</Caption1>
                        )}
                      </span>
                    </Option>
                  );
                })}
              </OptionGroup>
            )}
            {userMatches.length > 0 && (
              <OptionGroup label="Users">
                {userMatches.map((name) => {
                  const agentCount = (configs ?? []).filter((c) => changedBy(c).has(name)).length;
                  return (
                    <Option key={`user:${name}`} value={`user:${name}`} text={name}>
                      <span className={styles.optionBody}>
                        <Body1 className={styles.optionName}>{name}</Body1>
                        <Caption1 className={styles.optionMeta}>
                          {agentCount === 1 ? 'Changed 1 agent' : `Changed ${agentCount} agents`}
                        </Caption1>
                      </span>
                    </Option>
                  );
                })}
              </OptionGroup>
            )}
            {agentMatches.length === 0 && userMatches.length === 0 && (
              <Option key="__none" value="__none" text="" disabled>
                {isUserSearchLoading ? 'Loading…' : 'No matching agents or users'}
              </Option>
            )}
          </Combobox>
          {query && (
            <div className={styles.filterHintRow}>
              <Caption1 className={styles.userSearchHint}>
                {`Showing agents matching “${query}”`}
              </Caption1>
              <Tooltip content="Clear search" relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<DismissRegular />}
                  aria-label="Clear search"
                  onClick={clearSelection}
                />
              </Tooltip>
            </div>
          )}
        </>
        )
      )}

      {isConfigsError && (
        <div className={styles.loadError}>
          <MessageBar intent="error">
            <MessageBarBody>
              {configsError instanceof Error
                ? configsError.message
                : 'Tracked agents could not be loaded or set up automatically.'}
            </MessageBarBody>
          </MessageBar>
          <Button appearance="secondary" onClick={() => void refetchConfigs()}>
            Retry
          </Button>
        </div>
      )}

      {!isConfigsError && (!configs || configs.length === 0) ? (
        <div className={styles.empty}>
          <Body1Strong>No agents tracked</Body1Strong>
          <Caption1>Use “Track Agent” to opt an agent into change tracking.</Caption1>
        </div>
      ) : !isConfigsError && filtered.length === 0 && isUserSearchLoading ? (
        <div className={styles.empty}>
          <Spinner size="tiny" label="Finding agents…" />
        </div>
      ) : !isConfigsError && filtered.length === 0 ? (
        <div className={styles.empty}>
          <Body1Strong>No matches</Body1Strong>
          <Caption1>
            {selectedUser
              ? `No tracked agent has changes by “${selectedUser}”.`
              : `No tracked agent matches “${query}” by name or contributor.`}
          </Caption1>
        </div>
      ) : !isConfigsError ? (
        <div className={styles.scroll}>
          <div className={styles.list} role="list">
            {count > 1 && (
              <div
                className={mergeClasses(styles.item, selectedConfigId === 'all' && styles.itemSelected)}
                role="listitem"
              >
                <button
                  type="button"
                  className={styles.itemMain}
                  aria-current={selectedConfigId === 'all' ? 'true' : undefined}
                  onClick={onSelectAllAgents}
                >
                  <Avatar
                    className={styles.avatar}
                    icon={<AppsListRegular />}
                    size={AVATAR_SIZE}
                    shape="square"
                    color="neutral"
                  />
                  <span className={styles.itemBody}>
                    <span className={styles.nameRow}>
                      <Body1Strong className={styles.name}>All agents</Body1Strong>
                    </span>
                    <Caption1 className={styles.env}>{`${count} tracked`}</Caption1>
                  </span>
                </button>
              </div>
            )}
            {filtered.map((config) => {
              const isPending = config.id.startsWith(PENDING_TRACKING_CONFIG_PREFIX);
              const isSelected = config.id === selectedConfigId;
              const isDeleted = deletedConfigs.has(config.id);
              const iconSrc = icons.get(config.id);
              const envLabel =
                environmentNameFor(config) ??
                (config.environmentUrl ? safeHostname(config.environmentUrl) : undefined);
              return (
                <div
                  key={config.id}
                  className={mergeClasses(styles.item, isSelected && styles.itemSelected)}
                  role="listitem"
                >
                  <button
                    type="button"
                    className={styles.itemMain}
                    disabled={isPending}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => onSelectAgent(config)}
                  >
                    {iconSrc ? (
                      <img
                        className={styles.iconImage}
                        src={iconSrc}
                        alt=""
                      />
                    ) : (
                      <Avatar
                        className={styles.avatar}
                        name={config.agentName || config.agentId}
                        size={AVATAR_SIZE}
                        shape="square"
                        color="neutral"
                        aria-hidden
                      />
                    )}
                    <span className={styles.itemBody}>
                      <span className={styles.nameRow}>
                        <Tooltip content={config.agentName || config.agentId} relationship="label" withArrow>
                          <Body1Strong className={styles.name}>{config.agentName || config.agentId}</Body1Strong>
                        </Tooltip>
                        {isDeleted && (
                          <Badge className={styles.deletedBadge} appearance="tint" color="danger" size="small">
                            Deleted
                          </Badge>
                        )}
                      </span>
                      {envLabel && (
                        <Tooltip content={envLabel} relationship="label" withArrow>
                          <Caption1 className={styles.env}>{envLabel}</Caption1>
                        </Tooltip>
                      )}
                    </span>
                  </button>
                  {isPending ? (
                    <Spinner className={styles.menuWrap} size="tiny" label="Adding" />
                  ) : (
                    <span className={styles.menuWrap}>
                      <Tooltip
                        content={`Remove ${config.agentName || config.agentId} from tracking`}
                        relationship="label"
                        withArrow
                      >
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={<EyeTrackingOffRegular />}
                          className={styles.dangerText}
                          aria-label={`Remove ${config.agentName || config.agentId} from tracking`}
                          onClick={() => setRemoveTarget(config)}
                        />
                      </Tooltip>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <span
        className={styles.screenReaderOnly}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {!isConfigsPending && !isConfigsError
          ? count === 0
            ? 'Tracked agents loaded. No agents are tracked.'
            : `${countLabel} loaded.`
          : ''}
      </span>

      {isFirstRunBootstrapPending && (
        <Dialog open modalType="alert">
          <DialogSurface aria-describedby={undefined}>
            <DialogBody>
              <DialogTitle>Setting up agent tracking</DialogTitle>
              <DialogContent className={styles.bootstrapContent} tabIndex={0}>
                <Spinner
                  size="medium"
                  label="Discovering and adding up to 5 agents with recent transcript activity..."
                />
              </DialogContent>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}

      <AddAgentDialog open={dialogOpen} onOpenChange={setDialogOpen} configuredAgents={configs ?? []} />

      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(_, data) => {
          if (!data.open && !remove.isPending) {
            setRemoveTarget(undefined);
            remove.reset();
          }
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Remove this agent from tracking?</DialogTitle>
            <DialogContent>
              <Body1>
                This permanently deletes tracking for{' '}
                <strong>{removeTarget?.agentName || removeTarget?.agentId}</strong> agent, including its current
                tracked state, change history, and pending outbox records. This action cannot be undone.
              </Body1>
              {remove.isError && (
                <MessageBar intent="error" className={styles.removeError}>
                  <MessageBarBody>
                    {remove.error instanceof Error
                      ? remove.error.message
                      : 'Tracking records could not be deleted.'}{' '}
                    Some cleanup may have completed. Try the removal again.
                  </MessageBarBody>
                </MessageBar>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                disabled={remove.isPending}
                onClick={() => {
                  setRemoveTarget(undefined);
                  remove.reset();
                }}
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                icon={remove.isPending ? <Spinner size="tiny" /> : <EyeTrackingOffRegular />}
                disabled={remove.isPending}
                onClick={confirmRemove}
              >
                {remove.isPending ? 'Removing\u2026' : 'Remove tracking'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
