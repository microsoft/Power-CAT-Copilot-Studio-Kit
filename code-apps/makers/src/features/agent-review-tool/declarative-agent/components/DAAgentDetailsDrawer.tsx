/**
 * Agent details drawer body for a declarative review (spec 017, FR-14 corrected).
 *
 * FR-14 originally said declarative needs no drawer because "manifest content
 * already sits in the tabs". It does not: `DAReviewDialog` keeps Instructions,
 * descriptions, starters, capabilities, actions and App Metadata here, and the
 * Content Inventory requires all of them. This is a faithful port of that body,
 * every empty state included.
 *
 * Behaviour matches Standard's drawer — an `InlineDrawer` mounted by the page,
 * with the summary rail yielding its column while it is open — but the content
 * is declarative-specific, so `CSAgentDetailsDrawer` stays unmodified (SC-5).
 */

import {
  Button, InlineDrawer, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import type { DAManifest } from '../contracts/DAManifest';

const useStyles = makeStyles({
  /**
   * The card chrome — radius, stroke, elevation, stickiness — is supplied by
   * `ReviewPageShell`'s drawer column, so that Standard's unmodifiable
   * `CSAgentDetailsDrawer` gets the same treatment from one place. This
   * component only sizes itself and lays out its own contents.
   */
  drawer: {
    width: '460px',
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM} 18px`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    flexShrink: 0,
  },
  // Same 15px/600 as the rail's heading — both are card titles.
  title: { fontSize: '15px', fontWeight: 600 },
  body: {
    overflowY: 'auto',
    padding: `${tokens.spacingVerticalM} 18px ${tokens.spacingVerticalXL}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  /**
   * Section headings share the rail's caption treatment: 12px, secondary
   * foreground. The count rides in the same line rather than in a badge — it
   * is a fact about the heading, not a status.
   */
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground2,
  },
  value: { fontSize: '13px', lineHeight: 1.5 },
  /**
   * Instructions are the one field a maker reads as authored text, so they keep
   * the monospace block — but capped, because a 4,000-character instruction set
   * otherwise pushes every other section below the fold.
   */
  valueMono: {
    fontSize: '12px',
    lineHeight: 1.6,
    fontFamily: tokens.fontFamilyMonospace,
    whiteSpace: 'pre-wrap',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalS,
    maxHeight: '260px',
    overflowY: 'auto',
  },
  empty: { fontSize: '12px', fontStyle: 'italic', color: tokens.colorNeutralForeground3 },
  startersList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  starterItem: {
    borderLeft: `2px solid ${tokens.colorNeutralStroke2}`,
    paddingLeft: tokens.spacingHorizontalS,
  },
  starterTitle: { fontSize: '12px', fontWeight: 600 },
  starterText: { fontSize: '12px', color: tokens.colorNeutralForeground2, lineHeight: 1.45 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS },
  chip: {
    fontSize: '12px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusCircular,
    padding: `2px ${tokens.spacingHorizontalS}`,
  },
  actionsList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  actionItem: { display: 'flex', flexDirection: 'column' },
  actionId: { fontSize: '12px', fontWeight: 600 },
  actionFile: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    fontFamily: tokens.fontFamilyMonospace,
  },
  /**
   * Same key/value rhythm as the rail's facts list, so the two read as one
   * family rather than two different tables.
   */
  metadataRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalM,
    padding: '5px 0',
    fontSize: '12px',
  },
  metadataLabel: { color: tokens.colorNeutralForeground2, whiteSpace: 'nowrap' },
  metadataValue: {
    color: tokens.colorNeutralForeground1,
    wordBreak: 'break-all',
    textAlign: 'right',
  },
});

export interface DAAgentDetailsDrawerProps {
  open: boolean;
  manifest: DAManifest | undefined;
  onClose: () => void;
}

export function DAAgentDetailsDrawer({ open, manifest, onClose }: DAAgentDetailsDrawerProps) {
  const styles = useStyles();
  if (!manifest) return null;

  const starters = manifest.conversationStarters ?? [];
  const capabilities = manifest.capabilities ?? [];
  const actions = manifest.actions ?? [];

  // Only populated fields render, matching the dialog. Each entry keeps its own
  // key — the dialog wrapped these in an unkeyed fragment, which React warns on.
  const metadata = [
    { label: 'App ID', value: manifest.appId },
    { label: 'Version', value: manifest.appVersion },
    { label: 'Schema Version', value: manifest.schemaVersion },
    { label: 'Developer', value: manifest.developerName },
  ].filter((entry) => Boolean(entry.value));

  return (
    <InlineDrawer
      open={open}
      position="end"
      separator
      className={styles.drawer}
      id="review-agent-details-drawer"
      role="region"
      aria-label="Agent details"
    >
      <div className={styles.header}>
        <Text className={styles.title}>Agent Details</Text>
        <Button
          appearance="subtle"
          size="small"
          icon={<DismissRegular />}
          onClick={onClose}
          aria-label="Close Agent Details"
        />
      </div>

      <div className={styles.body}>
        {/*
          Identity first, then configuration, then the authored text.

          The dialog led with Instructions, which is the longest field on the
          screen — often several thousand characters — so everything factual
          about the agent sat below it and was reached by scrolling past a wall
          of prose. Identity is what a maker checks first and it is three short
          rows, so it now opens the drawer.
        */}
        <div className={styles.section}>
          <Text className={styles.label} block>App metadata</Text>
          <div>
            {metadata.map(({ label, value }) => (
              <div key={label} className={styles.metadataRow}>
                <span className={styles.metadataLabel}>{label}</span>
                <span className={styles.metadataValue}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <Text className={styles.label} block>Short description</Text>
          {manifest.shortDescription
            ? <Text className={styles.value} block>{manifest.shortDescription}</Text>
            : <Text className={styles.empty}>Not provided</Text>}
        </div>

        {manifest.fullDescription && (
          <div className={styles.section}>
            <Text className={styles.label} block>Full description</Text>
            <Text className={styles.value} block>{manifest.fullDescription}</Text>
          </div>
        )}

        <div className={styles.section}>
          <Text className={styles.label} block>Capabilities ({capabilities.length})</Text>
          {capabilities.length > 0 ? (
            <div className={styles.chips}>
              {capabilities.map((capability, i) => (
                <span key={`${capability.name}-${i}`} className={styles.chip}>{capability.name}</span>
              ))}
            </div>
          ) : (
            <Text className={styles.empty}>No capabilities configured</Text>
          )}
        </div>

        <div className={styles.section}>
          <Text className={styles.label} block>Actions / plugins ({actions.length})</Text>
          {actions.length > 0 ? (
            <div className={styles.actionsList}>
              {actions.map((action, i) => (
                <div key={`${action.id}-${i}`} className={styles.actionItem}>
                  <Text className={styles.actionId}>{action.id}</Text>
                  <Text className={styles.actionFile}>{action.file}</Text>
                </div>
              ))}
            </div>
          ) : (
            <Text className={styles.empty}>No actions configured</Text>
          )}
        </div>

        <div className={styles.section}>
          <Text className={styles.label} block>
            Conversation starters ({starters.length})
          </Text>
          {starters.length > 0 ? (
            <div className={styles.startersList}>
              {starters.map((starter, i) => (
                <div key={`${starter.title ?? ''}-${starter.text}-${i}`} className={styles.starterItem}>
                  {starter.title && <Text className={styles.starterTitle} block>{starter.title}</Text>}
                  <Text className={styles.starterText}>{starter.text}</Text>
                </div>
              ))}
            </div>
          ) : (
            <Text className={styles.empty}>No conversation starters defined</Text>
          )}
        </div>

        <div className={styles.section}>
          <Text className={styles.label} block>Instructions</Text>
          {manifest.instructions
            ? <Text className={styles.valueMono} block>{manifest.instructions}</Text>
            : <Text className={styles.empty}>No instructions defined</Text>}
        </div>
      </div>
    </InlineDrawer>
  );
}
