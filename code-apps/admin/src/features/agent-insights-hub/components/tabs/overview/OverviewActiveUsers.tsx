/**
 * OverviewActiveUsers - Displays active users as InteractionTags.
 *
 * Extracts unique users from cat_topusersdisplay JSON.
 * Includes a "Copy all users" button for clipboard export.
 */

import React, { useCallback } from "react";
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Subtitle2,
  Button,
  InteractionTag,
  InteractionTagPrimary,
  TagGroup,
  Tooltip,
} from "@fluentui/react-components";
import { Copy24Regular, Info16Regular } from "@fluentui/react-icons";
import { HOME_METRICS } from "../../../utils/metricDescriptions";

export interface OverviewActiveUsersProps {
  users: string[];
}

const useStyles = makeStyles({
  tagRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalM,
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  infoIcon: {
    color: tokens.colorNeutralForeground3,
    cursor: "help",
    display: "flex",
    alignItems: "center",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
  },
});

/** Active users card with InteractionTag badges and clipboard copy. */
const OverviewActiveUsers: React.FC<OverviewActiveUsersProps> = ({ users }) => {
  const styles = useStyles();

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(users.join(", "));
  }, [users]);

  if (users.length === 0) return null;

  return (
    <Card appearance="filled">
      <CardHeader
        header={
          <div className={styles.headerTitle}>
            <Subtitle2>{`Unique users (${users.length})`}</Subtitle2>
            <Tooltip content={HOME_METRICS.activeUsers} relationship="description">
              <span className={styles.infoIcon}>
                <Info16Regular />
              </span>
            </Tooltip>
          </div>
        }
        action={
          <div className={styles.headerActions}>
            <Button
              appearance="transparent"
              icon={<Copy24Regular />}
              size="small"
              onClick={handleCopy}
            >
              Copy all users
            </Button>
          </div>
        }
      />
      <div className={styles.tagRow}>
        <TagGroup aria-label="Unique users">
          {users.map((user) => (
            <InteractionTag key={user} appearance="brand" size="small">
              <InteractionTagPrimary>{user}</InteractionTagPrimary>
            </InteractionTag>
          ))}
        </TagGroup>
      </div>
    </Card>
  );
};

export default React.memo(OverviewActiveUsers);
