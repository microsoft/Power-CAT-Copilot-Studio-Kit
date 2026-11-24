// Excel / PDF / PPTX export.

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import pptxgen from 'pptxgenjs';
import type { MetricDataset, MetricDefinition, FilterState } from '../types';

/** Readable timestamp token safe for filenames: 2026-04-24-0130 */
function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'dashboard';
}

function downloadBlob(data: Blob | ArrayBuffer, filename: string): void {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Convert #RRGGBB to jsPDF-friendly RGB tuple or pptxgen 6-char token (no #). */
function hexToRgb(hex?: string): [number, number, number] {
  const h = (hex ?? '#1174B3').replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function hexToken(hex?: string): string {
  return (hex ?? '#1174B3').replace('#', '').toUpperCase();
}

/** Load image URL into a data URL (used for logo embed in PDF). Returns undefined if it fails. */

export const exportService = {
  async exportCardExcel(metric: MetricDefinition, data: MetricDataset, filters: FilterState) {
    const wb = XLSX.utils.book_new();
    const dataSheet = XLSX.utils.json_to_sheet(data.points);
    XLSX.utils.book_append_sheet(wb, dataSheet, 'Data');
    const meta = [
      ['Metric',        metric.name],
      ['Description',   metric.description ?? ''],
      ['Source table',  metric.sourceTable],
      ['Source field',  metric.sourceField],
      ['Aggregation',   metric.aggregation],
      ['Unit',          metric.unit ?? ''],
      ['Total',         data.total ?? ''],
      ['Delta vs prior', `${(data.delta ?? 0).toFixed(2)}%`],
      ['Filters',       JSON.stringify(filters)],
      ['Exported at',   new Date().toISOString()],
    ];
    const metaSheet = XLSX.utils.aoa_to_sheet(meta);
    XLSX.utils.book_append_sheet(wb, metaSheet, 'Metadata');
    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    downloadBlob(wbout as ArrayBuffer, `${sanitizeFilename(metric.name)}-${stamp()}.xlsx`);
  },

  async exportDashboardExcel(entries: { metric: MetricDefinition; data: MetricDataset }[], filters: FilterState, dashboardName: string) {
    const wb = XLSX.utils.book_new();
    const summary = [
      ['Dashboard', dashboardName],
      ['Exported at', new Date().toISOString()],
      ['Filters', JSON.stringify(filters)],
      ['Cards', entries.length],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');
    for (const e of entries) {
      const sheet = XLSX.utils.json_to_sheet(e.data.points);
      const safeName = e.metric.name.replace(/[\\/*?[\]:]/g, '_').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, sheet, safeName);
    }
    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    downloadBlob(wbout as ArrayBuffer, `${sanitizeFilename(dashboardName)}-${stamp()}.xlsx`);
  },

  async exportDashboardPdf(
    element: HTMLElement, filters: FilterState, dashboardName: string,
  ) {
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const [pr, pg, pb] = hexToRgb('#1174B3');

    // Cover — branded band at top
    pdf.setFillColor(pr, pg, pb);
    pdf.rect(0, 0, pageWidth, 22, 'F');

    pdf.setTextColor(30, 30, 30);
    pdf.setFontSize(22); pdf.text(dashboardName, pageWidth / 2, 50, { align: 'center' });
    pdf.setFontSize(11);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 62, { align: 'center' });
    pdf.text(`Time range: ${filters.timeRange.preset}`, pageWidth / 2, 70, { align: 'center' });
    pdf.addPage();

    // Canvas image
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    if (imgHeight <= pageHeight - 20) {
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    } else {
      let y = 10;
      let remaining = imgHeight;
      while (remaining > 0) {
        pdf.addImage(imgData, 'PNG', 10, y, imgWidth, imgHeight);
        remaining -= pageHeight - 20;
        if (remaining > 0) { pdf.addPage(); y = 10 - (imgHeight - remaining); }
      }
    }
    pdf.save(`${sanitizeFilename(dashboardName)}-${stamp()}.pdf`);
  },

  async exportDashboardPptx(
    entries: { metric: MetricDefinition; data: MetricDataset }[], filters: FilterState, dashboardName: string,
  ) {
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_WIDE';

    const primary = hexToken('#1174B3');

    const cover = pptx.addSlide();
    // Branded color band across top
    cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.6, fill: { color: primary }, line: { color: primary } });
    cover.addText(dashboardName, { x: 0.5, y: 2.2, w: 12, h: 1, fontSize: 40, bold: true, align: 'center' });
    cover.addText(`Generated ${new Date().toLocaleString()}`, { x: 0.5, y: 3.4, w: 12, h: 0.4, fontSize: 14, align: 'center', color: '707070' });
    cover.addText(`Time range: ${filters.timeRange.preset} · ${entries.length} metrics`, { x: 0.5, y: 4.0, w: 12, h: 0.4, fontSize: 14, align: 'center', color: '707070' });

    for (const e of entries) {
      const slide = pptx.addSlide();
      slide.addText(e.metric.name, { x: 0.5, y: 0.3, w: 12, h: 0.6, fontSize: 24, bold: true });
      slide.addText(e.metric.description ?? '', { x: 0.5, y: 0.9, w: 12, h: 0.4, fontSize: 12, color: '707070' });
      const chartData = [{
        name: e.metric.name,
        labels: e.data.points.map(p => p.date.slice(5)),
        values: e.data.points.map(p => p.value),
      }];
      const chartType = e.metric.visualizationType === 'Bar' ? pptx.ChartType.bar : pptx.ChartType.line;
      slide.addChart(chartType, chartData, {
        x: 0.5, y: 1.4, w: 12, h: 5.5, showLegend: false, catAxisLabelFontSize: 10,
        chartColors: [primary],
      });
      slide.addText(`Total: ${(e.data.total ?? 0).toLocaleString()} ${e.metric.unit ?? ''}`, { x: 0.5, y: 7, w: 12, h: 0.3, fontSize: 12 });
    }

    await pptx.writeFile({ fileName: `${sanitizeFilename(dashboardName)}-${stamp()}.pptx` });
  },
};
