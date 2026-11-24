import { useState, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Spinner,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  MessageBar,
  MessageBarBody,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  createTableColumn,
  Radio,
} from '@fluentui/react-components';
import {
  Copy20Regular,
  ArrowRight20Regular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
} from '@fluentui/react-icons';
import type { TableColumnDefinition } from '@fluentui/react-components';
import type { PolicyRequestSummary } from '../../../models/policyRequest';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  surface: {
    width: '960px',
    maxWidth: '95vw',
    maxHeight: '92vh',
    minHeight: '480px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  warningBar: {
    alignItems: 'flex-start',
  },
  warningBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  optionsList: {
    marginTop: tokens.spacingVerticalXS,
    marginBottom: '0',
    paddingLeft: tokens.spacingHorizontalXL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  gridBox: {
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopWidth: tokens.strokeWidthThin,
    borderRightWidth: tokens.strokeWidthThin,
    borderBottomWidth: tokens.strokeWidthThin,
    borderLeftWidth: tokens.strokeWidthThin,
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  dataGrid: {
    '& [role="row"]': {
      boxShadow: `inset 0 -1px 0 0 ${tokens.colorNeutralStroke2}`,
    },
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
  selectableRow: {
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  selectedRow: {
    backgroundColor: tokens.colorBrandBackground2,
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2,
    },
  },
  paginationRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    borderTopStyle: 'solid',
    borderTopWidth: tokens.strokeWidthThin,
    borderTopColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  paginationButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  sectionLabel: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  loadingCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface DlpCloneWarningDialogProps {
  open: boolean;
  approvedRequests: PolicyRequestSummary[];
  isLoading: boolean;
  isCloning: boolean;
  onClone: (requestId: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DlpCloneWarningDialog({
  open,
  approvedRequests,
  isLoading,
  isCloning,
  onClone,
  onSkip,
  onCancel,
}: DlpCloneWarningDialogProps) {
  const styles = useStyles();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(approvedRequests.length / PAGE_SIZE));
  const pagedRequests = useMemo(
    () => approvedRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [approvedRequests, page],
  );

  const columns: TableColumnDefinition<PolicyRequestSummary>[] = useMemo(
    () => [
      createTableColumn<PolicyRequestSummary>({
        columnId: 'select',
        renderHeaderCell: () => '',
        renderCell: (item) => (
          <Radio
            checked={selectedRequestId === item.id}
            onChange={() => setSelectedRequestId(item.id)}
            aria-label={`Select ${item.requestNumber}`}
          />
        ),
      }),
      createTableColumn<PolicyRequestSummary>({
        columnId: 'requestNumber',
        renderHeaderCell: () => 'Request #',
        renderCell: (item) => <Text weight="semibold">{item.requestNumber}</Text>,
      }),
      createTableColumn<PolicyRequestSummary>({
        columnId: 'serviceTree',
        renderHeaderCell: () => 'Service Tree',
        renderCell: (item) => item.serviceTreeName ?? '-',
      }),
      createTableColumn<PolicyRequestSummary>({
        columnId: 'environmentGroup',
        renderHeaderCell: () => 'Environment Container',
        renderCell: (item) => item.environmentGroupName ?? '-',
      }),
      createTableColumn<PolicyRequestSummary>({
        columnId: 'submittedOn',
        renderHeaderCell: () => 'Submitted',
        renderCell: (item) =>
          item.submittedOn
            ? new Date(item.submittedOn).toLocaleDateString()
            : '-',
      }),
    ],
    [selectedRequestId],
  );

  const columnSizing: Record<string, { idealWidth: number; minWidth: number }> = {
    select: { idealWidth: 44, minWidth: 44 },
    requestNumber: { idealWidth: 160, minWidth: 130 },
    serviceTree: { idealWidth: 220, minWidth: 150 },
    environmentGroup: { idealWidth: 260, minWidth: 170 },
    submittedOn: { idealWidth: 140, minWidth: 110 },
  };

  const isBusy = isLoading || isCloning;

  return (
    <Dialog open={open} modalType="alert">
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>
            Important Notice
          </DialogTitle>

          <DialogContent className={styles.content}>
            {/* ── Warning message ─────────────────────────────────── */}
            <MessageBar intent="warning" className={styles.warningBar}>
              <MessageBarBody>
                <div className={styles.warningBody}>
                  <Text size={300}>
                    Upon approval, all existing DLP policies for the selected environments will be replaced.
                    Only connectors included in this request will be permitted.
                  </Text>
                  <ul className={styles.optionsList}>
                    <li>
                      <Text size={300}>
                        <Text weight="semibold" size={300}>Clone a previous request</Text> - Select an approved request below and choose
                        &ldquo;Clone &amp; Continue&rdquo; to carry forward all previously approved connectors. You can then add or
                        remove connectors before submitting.
                      </Text>
                    </li>
                    <li>
                      <Text size={300}>
                        <Text weight="semibold" size={300}>Continue without cloning</Text> - If you plan to manually select all required connectors
                        (both existing and new) in the &ldquo;Connectors&rdquo; step, choose &ldquo;Continue&rdquo; to proceed.
                      </Text>
                    </li>
                  </ul>
                </div>
              </MessageBarBody>
            </MessageBar>

            {/* ── Approved requests grid ──────────────────────────── */}
            <Text className={styles.sectionLabel}>
              Previously Approved Requests
            </Text>

            {isLoading ? (
              <div className={styles.loadingCenter}>
                <Spinner label="Loading approved requests…" />
              </div>
            ) : (
              <div className={styles.gridBox}>
                <DataGrid
                  className={styles.dataGrid}
                  items={pagedRequests}
                  columns={columns}
                  getRowId={(item) => item.id}
                  columnSizingOptions={columnSizing}
                  resizableColumns
                >
                  <DataGridHeader>
                    <DataGridRow>
                      {({ renderHeaderCell, columnId }) => (
                        <DataGridHeaderCell
                          key={columnId}
                          className={styles.headerCell}
                        >
                          {renderHeaderCell()}
                        </DataGridHeaderCell>
                      )}
                    </DataGridRow>
                  </DataGridHeader>
                  <DataGridBody<PolicyRequestSummary>>
                    {({ item, rowId }) => (
                      <DataGridRow<PolicyRequestSummary>
                        key={rowId}
                        className={
                          selectedRequestId === item.id
                            ? styles.selectedRow
                            : styles.selectableRow
                        }
                        onClick={() => setSelectedRequestId(item.id)}
                        aria-selected={selectedRequestId === item.id}
                      >
                        {({ renderCell, columnId }) => (
                          <DataGridCell key={columnId}>
                            {renderCell(item)}
                          </DataGridCell>
                        )}
                      </DataGridRow>
                    )}
                  </DataGridBody>
                </DataGrid>

                {/* Pagination */}
                {approvedRequests.length > PAGE_SIZE && (
                  <div className={styles.paginationRow}>
                    <Text size={200}>
                      {approvedRequests.length} request{approvedRequests.length !== 1 ? 's' : ''}
                    </Text>
                    <div className={styles.paginationButtons}>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<ChevronLeft20Regular />}
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        aria-label="Previous page"
                      />
                      <Text size={200}>
                        {page} / {totalPages}
                      </Text>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<ChevronRight20Regular />}
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        aria-label="Next page"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>

          <DialogActions>
            <Button
              appearance="secondary"
              onClick={onCancel}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button
              appearance="secondary"
              onClick={onSkip}
              disabled={isBusy}
              icon={<ArrowRight20Regular />}
              iconPosition="after"
            >
              Continue
            </Button>
            <Button
              appearance="primary"
              onClick={() => selectedRequestId && onClone(selectedRequestId)}
              disabled={!selectedRequestId || isBusy}
              icon={isCloning ? <Spinner size="tiny" /> : <Copy20Regular />}
            >
              {isCloning ? 'Cloning…' : 'Clone & Continue'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
