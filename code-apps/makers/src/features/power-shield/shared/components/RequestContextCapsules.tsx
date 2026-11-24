import { useCallback, useEffect, useRef, useState } from 'react';
import {
  makeStyles,
  tokens,
  Spinner,
  Text,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
} from '@fluentui/react-components';
import { Info16Regular } from '@fluentui/react-icons';
import { getServiceTreeDetail } from '../services/dataverse/serviceTreeService';
import { getEnvironmentGroupDetail } from '../services/dataverse/environmentGroupService';

// ─────────────────────────────────────────────────────────────────────────────
// Service Tree + Environment Container capsules with their detail dialogs.
// Shared by the Connector and Copilot Credits summary tabs so both stay in sync.
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  capsuleRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    paddingBottom: tokens.spacingVerticalS,
  },
  capsule: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    paddingTop: '5px',
    paddingBottom: '5px',
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusCircular,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorBrandStroke1,
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: tokens.colorBrandStroke1,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorBrandStroke1,
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorBrandStroke1,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    fontFamily: 'inherit',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2Hover,
      boxShadow: tokens.shadow2,
    },
    ':active': {
      backgroundColor: tokens.colorBrandBackground2Pressed,
    },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: '2px',
    },
  },
  dialogField: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    marginBottom: tokens.spacingVerticalS,
  },
  errorText: {
    color: tokens.colorStatusDangerForeground1,
  },
  metaText: {
    color: tokens.colorNeutralForeground3,
  },
});

interface LazyState<T> {
  id?: string;
  data?: T;
  loading: boolean;
  error?: string;
}

/**
 * Loads a record on demand and caches it for the current id only. A different id
 * (e.g. navigating to another request) never shows the previous record, and a
 * reply for a superseded id is ignored.
 */
function useLazyDetail<T>(id: string | undefined, fetcher: (id: string) => Promise<T>, errorMessage: string) {
  const [state, setState] = useState<LazyState<T>>({ loading: false });
  const tokenRef = useRef(0);
  const inflightIdRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current += 1;
    inflightIdRef.current = null;
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    if (state.id === id && state.data !== undefined) return;
    if (inflightIdRef.current === id) return;
    inflightIdRef.current = id;
    const token = ++tokenRef.current;
    setState({ id, loading: true });
    try {
      const data = await fetcher(id);
      if (token === tokenRef.current) setState({ id, data, loading: false });
    } catch {
      if (token === tokenRef.current) setState({ id, loading: false, error: errorMessage });
    } finally {
      if (token === tokenRef.current) inflightIdRef.current = null;
    }
  }, [id, state.id, state.data, fetcher, errorMessage]);

  const current = state.id === id ? state : { loading: false };
  return { ...current, load } as LazyState<T> & { load: () => Promise<void> };
}

export interface RequestContextCapsulesProps {
  serviceTreeId: string;
  serviceTreeName?: string;
  environmentGroupId?: string;
  environmentGroupName?: string;
}

/** Clickable Service Tree / Environment Container capsules that open read-only detail dialogs. */
export function RequestContextCapsules({
  serviceTreeId,
  serviceTreeName,
  environmentGroupId,
  environmentGroupName,
}: RequestContextCapsulesProps) {
  const styles = useStyles();

  // The open dialog is tied to the id it was opened for, so it closes on navigation.
  const [serviceTreeOpenFor, setServiceTreeOpenFor] = useState<string | null>(null);
  const [envGroupOpenFor, setEnvGroupOpenFor] = useState<string | null>(null);

  const serviceTree = useLazyDetail(serviceTreeId, getServiceTreeDetail, 'Failed to load Service Tree details.');
  const envGroup = useLazyDetail(environmentGroupId, getEnvironmentGroupDetail, 'Failed to load Environment Container details.');

  const serviceTreeLabel = serviceTreeName ?? serviceTreeId;
  const envGroupLabel = environmentGroupName ?? environmentGroupId;

  const handleServiceTreeClick = useCallback(() => {
    setServiceTreeOpenFor(serviceTreeId);
    void serviceTree.load();
  }, [serviceTreeId, serviceTree]);

  const handleEnvGroupClick = useCallback(() => {
    if (!environmentGroupId) return;
    setEnvGroupOpenFor(environmentGroupId);
    void envGroup.load();
  }, [environmentGroupId, envGroup]);

  const serviceTreeDetail = serviceTree.data;
  const envGroupDetail = envGroup.data;

  return (
    <>
      <div className={styles.capsuleRow}>
        <button
          type="button"
          className={styles.capsule}
          onClick={handleServiceTreeClick}
          aria-haspopup="dialog"
          aria-label={`Service Tree: ${serviceTreeLabel}. View details`}
        >
          Service Tree: {serviceTreeLabel}
          <Info16Regular aria-hidden="true" />
        </button>
        {environmentGroupId && (
          <button
            type="button"
            className={styles.capsule}
            onClick={handleEnvGroupClick}
            aria-haspopup="dialog"
            aria-label={`Env Container: ${envGroupLabel}. View details`}
          >
            Env Container: {envGroupLabel}
            <Info16Regular aria-hidden="true" />
          </button>
        )}
      </div>

      <Dialog
        open={serviceTreeOpenFor === serviceTreeId}
        onOpenChange={(_, d) => setServiceTreeOpenFor(d.open ? serviceTreeId : null)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Service Tree</DialogTitle>
            <DialogContent>
              {serviceTree.loading && <Spinner size="small" label="Loading..." labelPosition="after" />}
              {serviceTree.error && <Text className={styles.errorText}>{serviceTree.error}</Text>}
              {serviceTreeDetail && (
                <>
                  <div className={styles.dialogField}>
                    <Text weight="semibold" size={300}>Name</Text>
                    <Text size={300}>{serviceTreeDetail.name || '-'}</Text>
                  </div>
                  <div className={styles.dialogField}>
                    <Text weight="semibold" size={300}>Organization</Text>
                    <Text size={300}>{serviceTreeDetail.organization || '-'}</Text>
                  </div>
                  <div className={styles.dialogField}>
                    <Text weight="semibold" size={300}>Description</Text>
                    <Text size={300}>{serviceTreeDetail.description || '-'}</Text>
                  </div>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setServiceTreeOpenFor(null)}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={!!environmentGroupId && envGroupOpenFor === environmentGroupId}
        onOpenChange={(_, d) => setEnvGroupOpenFor(d.open && environmentGroupId ? environmentGroupId : null)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Environment Container</DialogTitle>
            <DialogContent>
              {envGroup.loading && <Spinner size="small" label="Loading..." labelPosition="after" />}
              {envGroup.error && <Text className={styles.errorText}>{envGroup.error}</Text>}
              {envGroupDetail && (
                <>
                  <div className={styles.dialogField}>
                    <Text weight="semibold" size={300}>Name</Text>
                    <Text size={300}>{envGroupDetail.name}</Text>
                  </div>
                  {envGroupDetail.description && (
                    <div className={styles.dialogField}>
                      <Text weight="semibold" size={300}>Description</Text>
                      <Text size={300}>{envGroupDetail.description}</Text>
                    </div>
                  )}
                  {envGroupDetail.ownerUpn && (
                    <div className={styles.dialogField}>
                      <Text weight="semibold" size={300}>Owner</Text>
                      <Text size={300}>{envGroupDetail.ownerUpn}</Text>
                    </div>
                  )}
                  <div className={styles.dialogField}>
                    <Text weight="semibold" size={300}>Environments</Text>
                    {envGroupDetail.members.length === 0 ? (
                      <Text size={300} className={styles.metaText}>No environments in this group.</Text>
                    ) : (
                      <Table size="small" aria-label="Member environments">
                        <TableBody>
                          {envGroupDetail.members.map((m) => (
                            <TableRow key={m.environmentGuid}>
                              <TableCell>{m.environmentName || m.environmentGuid}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setEnvGroupOpenFor(null)}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
