import { useCallback, useEffect, useRef, useState } from 'react';
import {
  makeStyles, tokens, Text, Button, Tooltip,
  Input, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
  useToastController, Toast, ToastTitle, ToastBody, Toaster, useId,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Field, Spinner,
} from '@fluentui/react-components';
import {
  Save20Regular, ArrowDownload24Regular,
  ChevronDown20Regular, MoreHorizontal24Regular, Rename24Regular, Delete24Regular,
  Checkmark16Regular,
  DismissCircle16Regular, DocumentAdd24Regular,
  LayoutCellFour20Regular,
} from '@fluentui/react-icons';
import { useAppStore } from '../../store/appStore';
import type { DashboardLayout } from '../../types';
import { FilterStrip } from '../filters/FilterStrip';

const useStyles = makeStyles({
  root: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground1,
  },
  commandRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  leftFlow: {
    display: 'flex', alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  actions: {
    display: 'flex', alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
    justifySelf: 'end',
  },
  dashboardGroup: {
    display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS,
    whiteSpace: 'nowrap',
  },
  groupLabel: { fontSize: '13px', fontWeight: 600, color: tokens.colorNeutralForeground1 },
  dashboardName: {
    fontSize: '13px', fontWeight: 600, color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    padding: `2px ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover, textDecorationLine: 'underline' },
  },
  dashboardNameEditing: { maxWidth: '240px' },
  layoutRow: { display: 'flex', alignItems: 'center' },
  layoutRowInner: { flex: '1', minWidth: 0 },
  saveStateSaving: {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    color: tokens.colorNeutralForeground3,
    fontSize: '12px', fontWeight: 400,
  },
  saveStateError: {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    color: tokens.colorPaletteRedForeground1,
    fontSize: '12px', fontWeight: 500,
  },
});

type SaveState = 'clean' | 'dirty' | 'saving' | 'error';

interface DashboardCommandBarProps {
  onExportExcel: () => void;
  onExportPdf: () => void;
  onExportPptx: () => void;
}

export function DashboardCommandBar({ onExportExcel, onExportPdf, onExportPptx }: DashboardCommandBarProps) {
  const s = useStyles();
  const currentLayout = useAppStore(st => st.currentLayout);
  const layouts = useAppStore(st => st.layouts);
  const layoutDirty = useAppStore(st => st.layoutDirty);
  const cards = useAppStore(st => st.currentLayout.cards);
  const saveLayout = useAppStore(st => st.saveLayout);
  const loadLayout = useAppStore(st => st.loadLayout);
  const newLayout = useAppStore(st => st.newLayout);
  const deleteLayout = useAppStore(st => st.deleteLayout);
  const renameLayout = useAppStore(st => st.renameLayout);
  const resetLayout = useAppStore(st => st.resetLayout);

  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(currentLayout.name);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setName(currentLayout.name); }, [currentLayout.id, currentLayout.name]);
  useEffect(() => { setSaveState(layoutDirty ? 'dirty' : 'clean'); }, [layoutDirty]);

  const toasterId = useId('cmd-bar-toaster');
  const { dispatchToast } = useToastController(toasterId);

  const toastErr = (title: string, body?: string) =>
    dispatchToast(
      <Toast><ToastTitle>{title}</ToastTitle>{body ? <ToastBody>{body}</ToastBody> : null}</Toast>,
      { intent: 'error' },
    );
  const toastOk = (title: string) =>
    dispatchToast(<Toast><ToastTitle>{title}</ToastTitle></Toast>, { intent: 'success' });

  const [renameTarget, setRenameTarget] = useState<DashboardLayout | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DashboardLayout | null>(null);

  // Unsaved changes confirmation dialog
  type PendingAction = { type: 'switch'; id: string } | { type: 'new' };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [discardSaving, setDiscardSaving] = useState(false);

  const guardedLoadLayout = useCallback((id: string) => {
    if (layoutDirty) { setPendingAction({ type: 'switch', id }); return; }
    loadLayout(id);
  }, [layoutDirty, loadLayout]);

  const guardedNewLayout = useCallback(() => {
    if (layoutDirty) { setPendingAction({ type: 'new' }); return; }
    newLayout();
    setIsEditingName(true);
    setTimeout(() => { nameInputRef.current?.focus(); nameInputRef.current?.select(); }, 50);
  }, [layoutDirty, newLayout]);

  const executePendingAction = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'switch') loadLayout(pendingAction.id);
    else {
      newLayout();
      setIsEditingName(true);
      setTimeout(() => { nameInputRef.current?.focus(); nameInputRef.current?.select(); }, 50);
    }
    setPendingAction(null);
  };

  const handleDiscardSave = async () => {
    setDiscardSaving(true);
    const res = await saveLayout(name);
    setDiscardSaving(false);
    if (!res.ok) {
      toastErr("Can't save dashboard", res.reason);
      return;
    }
    toastOk('Dashboard saved');
    setSaveState('clean');
    executePendingAction();
  };

  const handleDiscardDontSave = () => {
    useAppStore.setState({ layoutDirty: false });
    executePendingAction();
  };

  // beforeunload guard for unsaved changes
  useEffect(() => {
    if (!layoutDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [layoutDirty]);

  const openRename = (l: DashboardLayout) => { setRenameTarget(l); setRenameValue(l.name); };
  const submitRename = async () => {
    if (!renameTarget?.id) return;
    const res = await renameLayout(renameTarget.id, renameValue);
    if (!res.ok) { toastErr("Can't rename dashboard", res.reason); return; }
    toastOk('Dashboard renamed');
    setRenameTarget(null);
  };

  const submitDelete = async () => {
    if (!deleteTarget?.id) return;
    const res = await deleteLayout(deleteTarget.id);
    if (!res.ok) { toastErr("Can't delete dashboard", res.reason); return; }
    toastOk('Dashboard deleted');
    setDeleteTarget(null);
  };

  const handleSave = async () => {
    setSaveState('saving');
    const res = await saveLayout(name);
    if (!res.ok) {
      setSaveState('error');
      toastErr("Can't save dashboard", res.reason);
      return;
    }
    setSaveState('clean');
    toastOk('Dashboard saved');
  };

  const commitName = () => {
    setIsEditingName(false);
    if (name.trim() && name !== currentLayout.name) {
      useAppStore.setState(st => ({
        currentLayout: { ...st.currentLayout, name: name.trim() },
        layoutDirty: true,
      }));
    } else {
      setName(currentLayout.name);
    }
  };

  const startEditingName = () => {
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const renderSaveState = () => {
    switch (saveState) {
      case 'clean':
      case 'dirty':
        return null;
      case 'saving':
        return (
          <span className={s.saveStateSaving}>
            <Spinner size="extra-tiny" /> Saving…
          </span>
        );
      case 'error':
        return (
          <span className={s.saveStateError}>
            <DismissCircle16Regular /> Save failed
          </span>
        );
    }
  };

  return (
    <>
      <Toaster toasterId={toasterId} position="top-end" />
      <div className={s.root}>
        {/* All controls in one responsive row: Dashboard + Filters + Actions */}
        <div className={s.commandRow} data-tour-id="filter-strip">
          <div className={s.leftFlow}>
            {/* Dashboard selector */}
            <div className={s.dashboardGroup}>
              <Text className={s.groupLabel}>Dashboard:</Text>
              {isEditingName ? (
                <Input
                  className={s.dashboardNameEditing}
                  ref={nameInputRef}
                  value={name}
                  onChange={(_, d) => setName(d.value)}
                  onBlur={commitName}
                  onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setName(currentLayout.name); setIsEditingName(false); } }}
                  placeholder="Dashboard name"
                  aria-label="Dashboard name"
                  size="small"
                />
              ) : (
                <Tooltip content="Click to rename" relationship="description" positioning="below">
                  <span className={s.dashboardName} onClick={startEditingName} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') startEditingName(); }}>
                    {currentLayout.name || 'Untitled'}
                  </span>
                </Tooltip>
              )}
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Tooltip content="Switch or manage dashboards" relationship="description">
                    <Button appearance="subtle" size="small" icon={<ChevronDown20Regular />} aria-label="Switch dashboard" />
                  </Tooltip>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem icon={<DocumentAdd24Regular />} onClick={guardedNewLayout}>New dashboard</MenuItem>
                    {layouts.length > 0 && <MenuItem disabled>— Saved dashboards —</MenuItem>}
                    {layouts.map(l => (
                      <div key={l.id} className={s.layoutRow}>
                        <div className={s.layoutRowInner}>
                          <MenuItem onClick={() => l.id && guardedLoadLayout(l.id)}>
                            {l.name}{l.isDefault ? ' (default)' : ''}
                          </MenuItem>
                        </div>
                        <Menu>
                          <MenuTrigger disableButtonEnhancement>
                            <Button size="small" appearance="transparent"
                              icon={<MoreHorizontal24Regular />}
                              aria-label={`Manage ${l.name}`}
                              onClick={(e) => e.stopPropagation()} />
                          </MenuTrigger>
                          <MenuPopover>
                            <MenuList>
                              <MenuItem icon={<Rename24Regular />} onClick={() => openRename(l)}>Rename…</MenuItem>
                              <MenuItem icon={<Delete24Regular />} onClick={() => setDeleteTarget(l)}>Delete…</MenuItem>
                            </MenuList>
                          </MenuPopover>
                        </Menu>
                      </div>
                    ))}
                  </MenuList>
                </MenuPopover>
              </Menu>
            </div>

            {/* Inline filters */}
            <FilterStrip />
          </div>

          <div className={s.actions}>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Tooltip content="Export dashboard as Excel, PDF, or PowerPoint" relationship="description">
                  <Button appearance="outline" size="small" icon={<ArrowDownload24Regular />}>Export</Button>
                </Tooltip>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem onClick={onExportExcel}>Excel (all cards)</MenuItem>
                  <MenuItem onClick={onExportPdf}>PDF dashboard</MenuItem>
                  <MenuItem onClick={onExportPptx}>PowerPoint</MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>

            {cards.length > 0 && (
              <Tooltip content="Resize and arrange all cards into a uniform grid layout" relationship="description">
                <Button appearance="outline" size="small" icon={<LayoutCellFour20Regular />} onClick={resetLayout}>
                  Arrange
                </Button>
              </Tooltip>
            )}

            {renderSaveState()}

            <Tooltip
              content={saveState === 'dirty' ? 'Save your dashboard layout and chart arrangement to Dataverse' : saveState === 'error' ? 'Save failed — try again' : 'Dashboard saved — your layout is stored in Dataverse'}
              relationship="description"
            >
              <Button
                appearance={saveState === 'dirty' || saveState === 'error' ? 'primary' : 'subtle'}
                size="small"
                icon={saveState === 'clean' ? <Checkmark16Regular /> : <Save20Regular />}
                onClick={handleSave}
                disabled={saveState === 'saving' || saveState === 'clean'}
                aria-label={saveState === 'dirty' ? 'Save dashboard. Unsaved changes.' : saveState === 'saving' ? 'Saving dashboard' : saveState === 'error' ? 'Save failed. Try again.' : 'Dashboard saved'}
              >
                Save
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(_, d) => { if (!d.open) setRenameTarget(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Rename dashboard</DialogTitle>
            <DialogContent>
              <Field label="Name">
                <Input value={renameValue} onChange={(_, d) => setRenameValue(d.value)} autoFocus />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setRenameTarget(null)}>Cancel</Button>
              <Button appearance="primary" onClick={submitRename} disabled={!renameValue.trim()}>Save</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(_, d) => { if (!d.open) setDeleteTarget(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete dashboard?</DialogTitle>
            <DialogContent>
              This will permanently delete <b>{deleteTarget?.name}</b>. Metric definitions and source
              data are unaffected.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button appearance="primary" onClick={submitDelete}>Delete</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Unsaved changes confirmation */}
      <Dialog open={!!pendingAction} onOpenChange={(_, d) => { if (!d.open) setPendingAction(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogContent>
              You have unsaved changes to <b>{currentLayout.name || 'Untitled dashboard'}</b>. Save them before continuing?
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={handleDiscardDontSave} disabled={discardSaving}>Don&apos;t save</Button>
              <Button appearance="secondary" onClick={() => setPendingAction(null)} disabled={discardSaving}>Cancel</Button>
              <Button appearance="primary" onClick={handleDiscardSave} disabled={discardSaving}
                icon={discardSaving ? <Spinner size="extra-tiny" /> : undefined}
              >
                {discardSaving ? 'Saving…' : 'Save'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
