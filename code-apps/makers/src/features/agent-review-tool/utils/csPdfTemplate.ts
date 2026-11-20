import type { jsPDF } from 'jspdf';
import { measurePdfText, preparePdfText, wrapPdfText } from './csPdfText';

export const CS_PDF_TEMPLATE = {
  page: {
    marginLeft: 17,
    marginRight: 17,
    marginTop: 18,
    marginBottom: 20,
  },
  color: {
    ink: '#242424',
    navy: '#123a5a',
    blue: '#0f6cbd',
    muted: '#5c6b7a',
    border: '#c8d2dc',
    stripe: '#f5f8fa',
    findingTint: '#fff2f3',
    findingBorder: '#c50f1f',
    callout: '#eef6fc',
  },
  font: {
    body: 10,
    small: 8.5,
    section: 22,
    subsection: 15,
    finding: 12.5,
    coverTitle: 32,
    coverSubtitle: 16,
  },
  lineHeight: 1.48,
} as const;

/** Build the accepted report title without repeating "Agent" in an agent name. */
export function csPdfReportTitle(agentName: string): string {
  const prepared = preparePdfText(agentName).trim() || 'Copilot Studio Agent';
  return /\bagent$/i.test(prepared) ? `${prepared} Review` : `${prepared} Agent Review`;
}

function interpolate(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * ratio);
}

function coverGradient(): { data: Uint8ClampedArray; width: number; height: number } {
  const width = 64;
  const height = 96;
  const data = new Uint8ClampedArray(width * height * 4);
  const start = [15, 108, 189] as const;
  const end = [18, 58, 90] as const;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const ratio = (column / (width - 1) * 0.35) + (row / (height - 1) * 0.65);
      const offset = (row * width + column) * 4;
      data[offset] = interpolate(start[0], end[0], ratio);
      data[offset + 1] = interpolate(start[1], end[1], ratio);
      data[offset + 2] = interpolate(start[2], end[2], ratio);
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Draw the accepted white-page, rounded-gradient report cover. */
export function renderCsPdfCover(
  doc: jsPDF,
  agentName: string,
  publicSafe: boolean,
  content: { subtitle?: string; sourceDescription?: string } = {},
): void {
  const x = 20;
  const y = 20;
  const width = 170;
  const height = 257;
  const radius = 8;

  doc.saveGraphicsState();
  doc.roundedRect(x, y, width, height, radius, radius, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(coverGradient(), 'RGBA', x, y, width, height);
  doc.restoreGraphicsState();

  const contentX = x + 16;
  const contentWidth = width - 32;
  const title = csPdfReportTitle(agentName);
  const subtitle = content.subtitle
    ?? 'Verified actionable findings from the saved Standard review';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(CS_PDF_TEMPLATE.font.coverTitle);
  const titleLines = wrapPdfText(doc, title, contentWidth);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(CS_PDF_TEMPLATE.font.coverSubtitle);
  const subtitleLines = wrapPdfText(doc, subtitle, contentWidth);
  const titleLineHeight = 32 / doc.internal.scaleFactor * 1.12;
  const subtitleLineHeight = 16 / doc.internal.scaleFactor * 1.35;
  const totalHeight = titleLines.length * titleLineHeight + 8
    + subtitleLines.length * subtitleLineHeight + 22;
  let cursor = y + (height - totalHeight) / 2;

  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(CS_PDF_TEMPLATE.font.coverTitle);
  for (const line of titleLines) {
    doc.text(line, contentX, cursor + 32 / doc.internal.scaleFactor);
    cursor += titleLineHeight;
  }
  cursor += 8;
  doc.setTextColor('#eaf3fb');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(CS_PDF_TEMPLATE.font.coverSubtitle);
  for (const line of subtitleLines) {
    doc.text(line, contentX, cursor + 16 / doc.internal.scaleFactor);
    cursor += subtitleLineHeight;
  }
  cursor += 18;
  doc.setTextColor('#d7e8f7');
  doc.setFontSize(11);
  doc.text(
    preparePdfText(content.sourceDescription ?? 'Review of saved Copilot Studio configuration'),
    contentX,
    cursor + 11 / doc.internal.scaleFactor,
  );
  if (publicSafe) {
    doc.setFontSize(9);
    doc.text('Public-safe export', contentX, cursor + 9);
  }
}

/** Add the accepted running header and centered page-number footer. */
export function finishCsPdfPages(
  doc: jsPDF,
  title: string,
  publicSafe: boolean,
  brandedCover: boolean,
): void {
  const count = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { marginLeft, marginRight } = CS_PDF_TEMPLATE.page;
  const reportLabel = publicSafe ? 'Public-safe actionable report' : 'Actionable maker report';
  const preparedTitle = preparePdfText(title).replace(/\s+/g, ' ').trim();

  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    if (brandedCover && page === 1) continue;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(CS_PDF_TEMPLATE.font.small);
    doc.setTextColor(CS_PDF_TEMPLATE.color.muted);
    const titleWidth = pageWidth - marginLeft - marginRight - measurePdfText(doc, reportLabel) - 6;
    const runningTitle = measurePdfText(doc, preparedTitle) <= titleWidth
      ? preparedTitle
      : `${wrapPdfText(doc, preparedTitle, titleWidth - measurePdfText(doc, '...'))[0].trimEnd()}...`;
    doc.text(runningTitle, marginLeft, 10);
    doc.text(reportLabel, pageWidth - marginRight, 10, { align: 'right' });
    doc.text(`Page ${page} of ${count}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }
}
