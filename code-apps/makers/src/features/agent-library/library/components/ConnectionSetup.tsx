/**
 * ConnectionSetupView — Inline connection rows for the Agent Template Dialog.
 *
 * Renders connection status rows directly within the dialog's "Connect to data" section.
 * Each row shows: connector icon + name + status (checkmark/menu or error/create link).
 *
 * Figma node: 1589:10709 (inline within 1540:12011)
 */

import React from 'react';
import {
  makeStyles,
  tokens,
  Body1,
  Link,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Spinner,
} from '@fluentui/react-components';
import {
  Checkmark20Regular,
  CheckmarkCircle20Filled,
  ErrorCircle20Regular,
  MoreHorizontal20Regular,
} from '@fluentui/react-icons';
import type { ConnectionSetupItem } from '../contracts/types';

// Connector product icons (32px)
import iconSharePoint from '../assets/connector-sharepoint.svg';
import iconDataverse from '../assets/connector-dataverse.svg';
import iconM365Mcp from '../assets/connector-m365-mcp.svg';
import iconExcel from '../assets/connector-excel.svg';
import iconOneDrive from '../assets/connector-onedrive.svg';
import iconWordOnline from '../assets/connector-word-online.svg';
import iconServiceNow from '../assets/connector-servicenow.svg';

/** Maps short connector name → product icon asset */
const CONNECTOR_ICON_MAP: Record<string, string> = {
  shared_sharepointonline: iconSharePoint,
  shared_commondataserviceforapps: iconDataverse,
  shared_a365mcpservers: iconM365Mcp,
  shared_a365memcp: iconM365Mcp,
  shared_a365copilotchatmcp: iconM365Mcp,
  shared_excelonlinebusiness: iconExcel,
  shared_excelonline: iconExcel,
  shared_onedriveforbusiness: iconOneDrive,
  shared_onedrive: iconOneDrive,
  shared_wordonlinebusiness: iconWordOnline,
  'shared_service-now': iconServiceNow,
  shared_servicenow: iconServiceNow,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConnectionSetupViewProps {
  items: ConnectionSetupItem[];
  onConnectionChange: (logicalName: string, connectionId: string) => void;
  onCreateConnection: (connectorName: string) => void;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  connectionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  connectionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingLeft: '0',
  },
  connectorIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: tokens.colorNeutralBackground3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  connectorName: {
    flex: '1 1 0',
    minWidth: 0,
  },
  statusArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  connectedIcon: {
    color: tokens.colorPaletteGreenForeground1,
  },
  errorIcon: {
    color: tokens.colorPaletteRedForeground1,
  },
  moreButton: {
    minWidth: '24px',
    width: '24px',
    height: '24px',
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ConnectionSetupView: React.FC<ConnectionSetupViewProps> = ({
  items,
  onConnectionChange,
  onCreateConnection,
}) => {
  const styles = useStyles();

  return (
    <div className={styles.connectionList}>
      {items.map((item) => {
        const displayName = item.reference.connectorDisplayName || item.reference.connectorName;
        const firstLetter = displayName.charAt(0).toUpperCase();
        const hasConnections = item.availableConnections.length > 0;
        const iconSrc = CONNECTOR_ICON_MAP[item.reference.connectorName];

        return (
          <div key={item.reference.logicalName} className={styles.connectionRow}>
            {iconSrc ? (
              <img src={iconSrc} alt="" width={32} height={32} style={{ flexShrink: 0 }} />
            ) : (
              <div className={styles.connectorIcon}>{firstLetter}</div>
            )}

            <Body1 className={styles.connectorName}>{displayName}</Body1>

            <div className={styles.statusArea}>
              {item.loading ? (
                <Spinner size="tiny" />
              ) : hasConnections ? (
                <>
                  <CheckmarkCircle20Filled className={styles.connectedIcon} />
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <MenuButton
                        className={styles.moreButton}
                        appearance="subtle"
                        size="small"
                        icon={<MoreHorizontal20Regular />}
                      />
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList>
                        {item.availableConnections.map((conn) => {
                          const isSelected = conn.connectionId === item.selectedConnectionId;
                          return (
                            <MenuItem
                              key={conn.connectionId}
                              icon={isSelected ? <Checkmark20Regular /> : undefined}
                              onClick={() =>
                                onConnectionChange(item.reference.logicalName, conn.connectionId)
                              }
                            >
                              {conn.displayName || conn.connectionId}
                            </MenuItem>
                          );
                        })}
                        <MenuItem onClick={() => onCreateConnection(item.reference.connectorName)}>
                          Create new
                        </MenuItem>
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                </>
              ) : (
                <>
                  <ErrorCircle20Regular className={styles.errorIcon} />
                  <Link onClick={() => onCreateConnection(item.reference.connectorName)}>
                    Create
                  </Link>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
