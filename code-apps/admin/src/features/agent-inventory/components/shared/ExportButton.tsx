import { memo, useCallback, useState } from 'react';
import { Button, Tooltip } from '@fluentui/react-components';
import { ArrowDownload16Regular } from '@fluentui/react-icons';

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  formatter?: (value: unknown) => string;
}

export interface ExportButtonProps {
  data: Record<string, unknown>[];
  columns: ExportColumn[];
  filename: string;
  disabled?: boolean;
  iconOnly?: boolean;
  label?: string;
}

/** Generates and downloads an Excel workbook from typed column definitions. */
function ExportButton({
  data,
  columns,
  filename,
  disabled = false,
  iconOnly = false,
  label = 'Download',
}: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (data.length === 0) return;
    setExporting(true);

    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Data');

      worksheet.columns = columns.map((column) => ({
        header: column.header,
        key: column.key,
        width: column.width ?? 16,
      }));

      for (const row of data) {
        const mapped: Record<string, unknown> = {};
        for (const column of columns) {
          const rawValue = row[column.key];
          mapped[column.key] = column.formatter
            ? column.formatter(rawValue)
            : rawValue;
        }
        worksheet.addRow(mapped);
      }

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.commit();

      worksheet.eachRow((row) => {
        row.alignment = { horizontal: 'left' };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${filename}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[AgentInventoryExport] Export failed:', error);
    } finally {
      setExporting(false);
    }
  }, [columns, data, filename]);

  return (
    <Tooltip content={`${label} Excel`} relationship="label">
      <Button
        appearance="subtle"
        icon={<ArrowDownload16Regular />}
        aria-label={`${label} Excel`}
        disabled={disabled || exporting || data.length === 0}
        onClick={handleExport}
        size="small"
      >
        {iconOnly ? undefined : (exporting ? 'Exporting...' : label)}
      </Button>
    </Tooltip>
  );
}

export default memo(ExportButton);
