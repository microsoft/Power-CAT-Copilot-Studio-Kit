import { useMemo } from 'react';
import {
  Badge,
  Button,
  Caption1,
  Dropdown,
  Field,
  Option,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  Add20Regular,
  Delete16Regular,
  Edit16Regular,
  Info16Regular,
} from '@fluentui/react-icons';
import { BasicDataGrid } from '../../components/shared/BasicDataGrid';
import type { BasicDataGridColumn } from '../../components/shared/BasicDataGrid';
import type { EnvironmentGroup } from '../contracts/types';
import { SettingsSectionCard } from './SettingsSectionCard';

const useStyles = makeStyles({
  selector: {
    width: '100%',
    '@media (min-width: 900px)': {
      maxWidth: `calc(50% - ${tokens.spacingHorizontalXXL})`,
    },
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  guidance: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    marginBottom: tokens.spacingVerticalS,
    color: tokens.colorNeutralForeground3,
  },
  guidanceIcon: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  gridCard: {
    padding: 0,
    gap: tokens.spacingVerticalM,
    border: 0,
    boxShadow: 'none',
    backgroundColor: 'transparent',
  },
  gridWrapper: {
    maxHeight: '388px',
    padding: 0,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    overflowX: 'hidden',
    overflowY: 'auto',
    '@media (max-width: 1100px)': {
      overflowX: 'auto',
    },
    '& [role="rowgroup"]:first-child [role="row"]': {
      minHeight: '34px',
      position: 'sticky',
      top: 0,
      zIndex: 1,
      backgroundColor: tokens.colorNeutralBackground1,
    },
    '& [role="rowgroup"]:last-child [role="row"]': {
      minHeight: '59px',
    },
  },
  gridWrapperEmpty: {
    maxHeight: 'none',
    overflowX: 'hidden',
    overflowY: 'hidden',
  },
  searchBox: {
    width: '280px',
    maxWidth: '280px',
  },
});

function formatModifiedOn(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface EnvironmentGroupsCardProps {
  groups: EnvironmentGroup[];
  enabledGroupIds: string[];
  disabled: boolean;
  onEnabledChange: (ids: string[]) => void;
  onCreate: () => void;
  onEdit: (group: EnvironmentGroup) => void;
  onDelete: (group: EnvironmentGroup) => void;
}

export function EnvironmentGroupsCard({
  groups,
  enabledGroupIds,
  disabled,
  onEnabledChange,
  onCreate,
  onEdit,
  onDelete,
}: EnvironmentGroupsCardProps) {
  const styles = useStyles();
  const guidanceId = 'active-environment-groups-guidance';
  const columns = useMemo<BasicDataGridColumn<EnvironmentGroup>[]>(() => [
    { key: 'name', label: 'Group name', width: '520px', sortable: true },
    {
      key: 'environmentCount',
      label: 'Environments',
      width: '260px',
      sortable: true,
      render: (group) => <Badge appearance="tint" color="brand" shape="rounded">{group.environmentCount.toLocaleString()}</Badge>,
    },
    {
      key: 'modifiedOn',
      label: 'Last updated',
      width: '260px',
      sortable: true,
      render: (group) => formatModifiedOn(group.modifiedOn),
      searchValue: (group) => formatModifiedOn(group.modifiedOn),
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '140px',
      render: (group) => (
        <div className={styles.actions}>
          <Button appearance="subtle" size="small" icon={<Edit16Regular />} aria-label={`Edit ${group.name}`} onClick={() => onEdit(group)} disabled={disabled} />
          <Button appearance="subtle" size="small" icon={<Delete16Regular />} aria-label={`Delete ${group.name}`} onClick={() => onDelete(group)} disabled={disabled} />
        </div>
      ),
      searchValue: () => '',
      truncate: false,
    },
  ], [disabled, onDelete, onEdit, styles.actions]);

  return (
    <SettingsSectionCard
      title="Environment groups"
      description="Create reusable groups of environments, then pick which groups to scope the sync to."
    >
      <Field label="Active groups">
        <Dropdown
          className={styles.selector}
          multiselect
          inlinePopup
          value={enabledGroupIds.length === 0 ? 'All environments (default)' : `${enabledGroupIds.length} active groups`}
          selectedOptions={enabledGroupIds}
          disabled={disabled}
          onOptionSelect={(_, data) => onEnabledChange(data.selectedOptions)}
          aria-describedby={guidanceId}
        >
          {groups.map((group) => (
            <Option
              key={group.id}
              value={group.id}
              text={`${group.name} (${group.environmentCount} environments)`}
            >
              {group.name} ({group.environmentCount} environments)
            </Option>
          ))}
        </Dropdown>
      </Field>

      <div className={styles.guidance} id={guidanceId}>
        <Info16Regular className={styles.guidanceIcon} aria-hidden="true" />
        <Caption1>
          <strong>If no group is selected, all environments are scanned by default.</strong>{' '}
          Otherwise only environments in the selected groups are scanned.
        </Caption1>
      </div>

      <BasicDataGrid
        title="Environment groups"
        columns={columns}
        records={groups}
        getRecordId={(group) => group.id}
        pageSize={Math.max(groups.length, 1)}
        searchPlaceholder="Search environment groups"
        emptyMessage="No environment groups found."
        searchBoxClassName={styles.searchBox}
        actions={(
          <Button appearance="outline" size="medium" icon={<Add20Regular />} onClick={onCreate} disabled={disabled}>
            Create group
          </Button>
        )}
        cardClassName={styles.gridCard}
        gridWrapperClassName={mergeClasses(styles.gridWrapper, groups.length === 0 && styles.gridWrapperEmpty)}
        headerLayout="search-actions"
        showPagination={false}
      />
    </SettingsSectionCard>
  );
}
