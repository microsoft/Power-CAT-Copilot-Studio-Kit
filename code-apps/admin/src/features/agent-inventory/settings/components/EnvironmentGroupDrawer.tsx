import { useEffect, useMemo, useState } from 'react';
import {
  Body1,
  Button,
  Checkbox,
  Dropdown,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  SearchBox,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import type {
  EnvironmentCatalogItem,
  EnvironmentGroup,
  EnvironmentGroupInput,
} from '../contracts/types';
import { validateGroupName } from '../utils/settingsUtils';

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  filters: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 1fr) 160px 160px',
    gap: tokens.spacingHorizontalM,
    '@media (max-width: 700px)': {
      gridTemplateColumns: '1fr',
    },
  },
  environmentList: {
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    maxHeight: '420px',
    overflowY: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  headerRow: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    display: 'grid',
    gridTemplateColumns: '44px minmax(180px, 1fr) 140px 140px',
    alignItems: 'center',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '44px minmax(180px, 1fr) 140px 140px',
    alignItems: 'center',
    minHeight: '44px',
    padding: `0 ${tokens.spacingHorizontalM}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
  },
  cell: {
    minHeight: '44px',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    textAlign: 'left',
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
  },
  count: {
    color: tokens.colorNeutralForeground3,
  },
});

interface EnvironmentGroupDrawerProps {
  open: boolean;
  group?: EnvironmentGroup;
  groups: EnvironmentGroup[];
  environments: EnvironmentCatalogItem[];
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (input: EnvironmentGroupInput) => void;
}

export function EnvironmentGroupDrawer({
  open,
  group,
  groups,
  environments,
  isSaving,
  error,
  onClose,
  onSave,
}: EnvironmentGroupDrawerProps) {
  const styles = useStyles();
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [region, setRegion] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [dispatched, setDispatched] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset the modal editor whenever it opens for a different group.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(group?.name ?? '');
    setSelectedIds(group?.environmentIds ?? []);
    setSearch('');
    setType('');
    setRegion('');
    setSubmitted(false);
    setDispatched(false);
  }, [group, open]);

  const types = useMemo(
    () => [...new Set(environments.map((item) => item.type))].sort(),
    [environments],
  );
  const regions = useMemo(
    () => [...new Set(environments.map((item) => item.region))].sort(),
    [environments],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return environments.filter((item) => (
      (!term || item.name.toLowerCase().includes(term))
      && (!type || item.type === type)
      && (!region || item.region === region)
    ));
  }, [environments, region, search, type]);

  const nameError = submitted && !dispatched ? validateGroupName(name, groups, group?.id) : undefined;
  const selected = new Set(selectedIds);
  const allVisibleSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));

  const toggle = (id: string, checked: boolean) => {
    setSelectedIds((current) => (
      checked
        ? [...new Set([...current, id])]
        : current.filter((value) => value !== id)
    ));
  };

  const handleSave = () => {
    setSubmitted(true);
    if (validateGroupName(name, groups, group?.id)) return;
    setDispatched(true);
    onSave({ id: group?.id, name: name.trim(), environmentIds: selectedIds });
  };

  return (
    <Drawer open={open} position="end" size="large" onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DrawerHeader>
        <DrawerHeaderTitle
          action={<Button appearance="subtle" icon={<Dismiss24Regular />} aria-label="Close environment group editor" onClick={onClose} />}
        >
          {group ? 'Edit environment group' : 'New environment group'}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <div className={styles.body}>
          <Field label="Group name" required validationMessage={nameError}>
            <Input
              value={name}
              onChange={(_, data) => { setName(data.value); setDispatched(false); }}
              placeholder="North America teams"
              disabled={Boolean(group)}
            />
          </Field>

          <Field label="Select environments">
            <div className={styles.filters}>
              <SearchBox
                value={search}
                onChange={(_, data) => setSearch(data.value)}
                placeholder="Search by name"
                aria-label="Search environments by name"
              />
              <Dropdown
                value={type || 'All types'}
                selectedOptions={type ? [type] : []}
                onOptionSelect={(_, data) => setType(String(data.optionValue ?? ''))}
                aria-label="Filter environments by type"
              >
                <Option value="">All types</Option>
                {types.map((value) => <Option key={value} value={value}>{value}</Option>)}
              </Dropdown>
              <Dropdown
                value={region || 'All regions'}
                selectedOptions={region ? [region] : []}
                onOptionSelect={(_, data) => setRegion(String(data.optionValue ?? ''))}
                aria-label="Filter environments by region"
              >
                <Option value="">All regions</Option>
                {regions.map((value) => <Option key={value} value={value}>{value}</Option>)}
              </Dropdown>
            </div>
          </Field>

          <div className={styles.environmentList}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.headerRow}>
                  <th className={styles.cell} scope="col">
                    <Checkbox
                      checked={allVisibleSelected}
                      aria-label="Select all visible environments"
                      onChange={(_, data) => {
                        const visibleIds = new Set(filtered.map((item) => item.id));
                        setSelectedIds((current) => data.checked
                          ? [...new Set([...current, ...visibleIds])]
                          : current.filter((id) => !visibleIds.has(id)));
                      }}
                    />
                  </th>
                  <th className={styles.cell} scope="col">Name</th>
                  <th className={styles.cell} scope="col">Type</th>
                  <th className={styles.cell} scope="col">Region</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr className={styles.row} key={item.id}>
                    <td className={styles.cell}>
                      <Checkbox
                        checked={selected.has(item.id)}
                        aria-label={`Select ${item.name}`}
                        onChange={(_, data) => toggle(item.id, Boolean(data.checked))}
                      />
                    </td>
                    <td className={styles.cell}>{item.name}</td>
                    <td className={styles.cell}>{item.type}</td>
                    <td className={styles.cell}>{item.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Body1 className={styles.count} role="status" aria-live="polite">
            {filtered.length} environments shown (tenant total: {environments.length}); {selectedIds.length} selected
          </Body1>

          {error && (
            <MessageBar intent="error">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}
        </div>
      </DrawerBody>
      <DrawerFooter>
        <div className={styles.actions}>
          <Button appearance="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <><Spinner size="tiny" /> Saving</> : 'Save'}
          </Button>
          <Button appearance="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
        </div>
      </DrawerFooter>
    </Drawer>
  );
}
