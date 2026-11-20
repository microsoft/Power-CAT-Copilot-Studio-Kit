/**
 * ActionToolbar Component
 *
 * Toolbar with primary actions (Export All) on left and utility actions on right.
 * Based on Figma node-id=25-88 and ui-specification.md Section 3.5
 *
 * Layout:
 * - Height: 32px
 * - Gap between buttons: 4px
 * - Left section: Primary actions with labels
 * - Right section: Icon-only buttons (32px width)
 * - Button styling: transparent border, 4px border-radius, #424242 text
 */

import React, { useState } from 'react';
import {
  Toolbar,
  ToolbarButton,
  Tooltip,
  Combobox,
  Option,
  Spinner,
  makeStyles,
  Text,
} from '@fluentui/react-components';
import {
  ArrowExportRegular,
  SettingsRegular,
  QuestionCircleRegular,
  BuildingRegular,
} from '@fluentui/react-icons';
import { useOrganizations } from '../../hooks/useOrganizations';
import { useFilterContext } from '../../context/FilterContext';

/**
 * ActionToolbar props
 */
export interface ActionToolbarProps {
  /** Callback when Export All button is clicked */
  onExportAll: () => void;

  /** Whether export is in progress — shows spinner and disables button */
  isExporting?: boolean;

  /** Optional callback when Help button is clicked */
  onHelp?: () => void;

  /** Optional callback when Settings button is clicked */
  onSettings?: () => void;
}

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    height: '32px',
  },
  section: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  toolbarButton: {
    border: '0.8px solid rgba(0,0,0,0)',
    borderRadius: '4px',
    color: '#424242',
    height: '32px',
    '&:hover': {
      backgroundColor: '#f5f5f5',
    },
  },
  iconOnlyButton: {
    border: '0.8px solid rgba(0,0,0,0)',
    borderRadius: '4px',
    width: '32px',
    height: '32px',
    minWidth: '32px',
    '&:hover': {
      backgroundColor: '#f5f5f5',
    },
  },
  envSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  envLabel: {
    fontSize: '12px',
    color: '#616161',
    whiteSpace: 'nowrap',
  },
  envDropdown: {
    minWidth: '180px',
    maxWidth: '240px',
    height: '28px',
  },
});

/**
 * ActionToolbar component
 *
 * Displays primary actions (Export All) and utility actions (Settings, Help).
 *
 * @example
 * ```tsx
 * <ActionToolbar
 *   onExportAll={() => exportData()}
 *   onHelp={() => window.open('/docs')}
 * />
 * ```
 */
export function ActionToolbar({
  onExportAll,
  isExporting = false,
  onHelp,
  onSettings,
}: ActionToolbarProps) {
  const styles = useStyles();
  const { data: organizations = [] } = useOrganizations();
  const { selectedOrgLabel, setSelectedOrgUrl } = useFilterContext();
  const [inputValue, setInputValue] = useState<string>(selectedOrgLabel);

  const filteredOrgs = organizations.filter((org) =>
    !inputValue || (org.FriendlyName ?? '').toLowerCase().includes(inputValue.toLowerCase())
  );

  return (
    <Toolbar size="small" className={styles.toolbar}>
      {/* Left Actions - Primary */}
      <div className={styles.section}>
        <Tooltip content="Export all review data" relationship="label">
          <ToolbarButton
            icon={isExporting ? <Spinner size="tiny" /> : <ArrowExportRegular />}
            onClick={onExportAll}
            disabled={isExporting}
            className={styles.toolbarButton}
          >
            {isExporting ? 'Exporting...' : 'Export All'}
          </ToolbarButton>
        </Tooltip>
      </div>

      {/* Right Actions - Utility */}
      <div className={styles.section}>
        {/* Environment selector */}
        <div className={styles.envSection}>
          <BuildingRegular fontSize={16} color="#616161" />
          <Text className={styles.envLabel}>Environment:</Text>
          <Combobox
            className={styles.envDropdown}
            placeholder="Current environment"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onOptionSelect={(_, data) => {
              const label = data.optionText ?? '';
              const selected = organizations.find((org) => org.Url === data.optionValue);
              setInputValue(label);
              setSelectedOrgUrl(
                selected?.Url ?? null,
                selected?.EnvironmentId ?? null,
                label,
              );
            }}
            size="small"
          >
            {filteredOrgs.map((org) => (
              <Option key={org.Url ?? org.FriendlyName} value={org.Url ?? ''}>
                {org.FriendlyName ?? org.Url ?? 'Unknown'}
              </Option>
            ))}
          </Combobox>
        </div>

        {onSettings && (
          <Tooltip content="Settings" relationship="label">
            <ToolbarButton
              icon={<SettingsRegular />}
              onClick={onSettings}
              className={styles.iconOnlyButton}
            />
          </Tooltip>
        )}

        {onHelp && (
          <Tooltip content="Help & Documentation" relationship="label">
            <ToolbarButton
              icon={<QuestionCircleRegular />}
              onClick={onHelp}
              className={styles.iconOnlyButton}
            />
          </Tooltip>
        )}
      </div>
    </Toolbar>
  );
}
