/**
 * CapabilityToggleRow — A memoized row for a single capability toggle.
 *
 * Renders a product SVG icon + display name on the left,
 * and a Fluent UI Switch on the right.
 */

import React from 'react';
import { makeStyles, Switch } from '@fluentui/react-components';
import type { SwitchOnChangeData } from '@fluentui/react-components';

// Product SVG icon imports
import iconCopilot from '../assets/capability-copilot.svg';
import iconGlobe from '../assets/capability-globe.svg';
import iconTeams from '../assets/capability-teams.svg';
import iconOutlook from '../assets/capability-outlook.svg';
import iconOneDrive from '../assets/capability-onedrive.svg';
import iconPeople from '../assets/capability-people.svg';

export interface CapabilityToggleRowProps {
  capabilityName: string;
  displayName: string;
  checked: boolean;
  onChange: (name: string, checked: boolean) => void;
}

/** Map capability name → SVG asset */
const CAPABILITY_ICON_MAP: Record<string, string> = {
  CodeInterpreter: iconCopilot,
  WebSearch: iconGlobe,
  TeamsMessages: iconTeams,
  Email: iconOutlook,
  Meetings: iconOutlook,
  OneDriveAndSharePoint: iconOneDrive,
  People: iconPeople,
};

const useStyles = makeStyles({
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '36px',
    paddingLeft: '4px',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  icon: {
    width: '28px',
    height: '28px',
    flexShrink: 0,
  },
});

export const CapabilityToggleRow: React.FC<CapabilityToggleRowProps> = React.memo(
  ({ capabilityName, displayName, checked, onChange }) => {
    const styles = useStyles();

    const handleChange = React.useCallback(
      (_ev: React.ChangeEvent<HTMLInputElement>, data: SwitchOnChangeData) => {
        onChange(capabilityName, data.checked);
      },
      [capabilityName, onChange],
    );

    const iconSrc = CAPABILITY_ICON_MAP[capabilityName];

    return (
      <div className={styles.row}>
        <div className={styles.left}>
          {iconSrc && <img src={iconSrc} alt="" className={styles.icon} aria-hidden="true" />}
          <span>{displayName}</span>
        </div>
        <Switch checked={checked} onChange={handleChange} />
      </div>
    );
  },
);

CapabilityToggleRow.displayName = 'CapabilityToggleRow';
