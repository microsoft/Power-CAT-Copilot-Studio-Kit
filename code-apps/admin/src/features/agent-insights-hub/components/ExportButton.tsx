/**
 * ExportButton - Downloads data as an Excel (.xlsx) file using ExcelJS.
 */

import React, { useCallback, useState } from "react";
import { Button, Tooltip } from "@fluentui/react-components";
import { ArrowDownload16Regular } from "@fluentui/react-icons";
import type { ExportColumn } from "../utils/exportColumns";

export interface ExportButtonProps {
  data: Record<string, unknown>[];
  columns: ExportColumn[];
  filename: string;
  disabled?: boolean;
  iconOnly?: boolean;
}

/** Button that generates and downloads an Excel workbook from data + column defs. */
const ExportButton: React.FC<ExportButtonProps> = ({
  data,
  columns,
  filename,
  disabled = false,
  iconOnly = false,
}) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (data.length === 0) return;
    setExporting(true);

    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Data");

      worksheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.width ?? 16,
      }));

      for (const row of data) {
        const mapped: Record<string, unknown> = {};
        for (const col of columns) {
          const raw = row[col.key];
          mapped[col.key] = col.formatter ? col.formatter(raw) : raw;
        }
        worksheet.addRow(mapped);
      }

      // Style header row + uniform left alignment
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.commit();

      worksheet.eachRow((row) => {
        row.alignment = { horizontal: "left" };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${filename}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[ExportButton] Export failed:", err);
    } finally {
      setExporting(false);
    }
  }, [data, columns, filename]);

  return (
    <Tooltip content="Download Excel" relationship="label">
      <Button
        appearance="subtle"
        icon={<ArrowDownload16Regular />}
        aria-label="Download Excel"
        disabled={disabled || exporting || data.length === 0}
        onClick={handleExport}
        size="small"
      >
        {iconOnly ? undefined : (exporting ? "Exporting..." : "Download")}
      </Button>
    </Tooltip>
  );
};

export default React.memo(ExportButton);
