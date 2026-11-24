import type { jsPDF } from 'jspdf';
import { CS_PDF_TEMPLATE, finishCsPdfPages } from './csPdfTemplate';
import { measurePdfText, preparePdfText, wrapPdfText } from './csPdfText';

interface ParagraphOptions {
  fontSize?: number;
  style?: 'normal' | 'bold' | 'italic';
  color?: string;
  indent?: number;
  gap?: number;
  url?: string;
}

interface TableOptions {
  columnRatios?: number[];
  fontSize?: number;
  rowTextColors?: Array<string | undefined>;
}

export interface CsPdfParagraph {
  value: string;
  options?: ParagraphOptions;
}

interface PendingHeading {
  value: string;
  level: 1 | 2 | 3;
  finding: boolean;
}

const { color, font, lineHeight: BODY_LINE_HEIGHT, page } = CS_PDF_TEMPLATE;
const TOP = page.marginTop;
const MARGIN = page.marginLeft;

/** Measured, line-by-line PDF layout using the accepted actionable-report visual system. */
export class CsPdfLayout {
  private y = TOP;
  private pendingHeadings: PendingHeading[] = [];
  private continuationContext?: string;
  private contextStarted = false;
  private readonly width: number;
  private readonly bottom: number;
  private readonly doc: jsPDF;

  constructor(doc: jsPDF) {
    this.doc = doc;
    this.width = doc.internal.pageSize.getWidth() - page.marginLeft - page.marginRight;
    this.bottom = doc.internal.pageSize.getHeight() - page.marginBottom;
  }

  /** Begin a body page and repeat compact context for content that continues. */
  newPage(): void {
    this.doc.addPage();
    this.y = TOP;
    if (!this.continuationContext || !this.contextStarted) return;
    const size = font.small;
    const wrapped = this.measure(`${this.continuationContext} (continued)`, {
      fontSize: size,
      style: 'bold',
    });
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(size);
    this.doc.setTextColor(color.muted);
    for (const line of wrapped.lines) {
      this.doc.text(line, MARGIN, this.y + size / this.doc.internal.scaleFactor);
      this.y += wrapped.lineHeight;
    }
    this.y += 3;
  }

  /** Identify automatic continuations; a new setting can inherit its started finding. */
  setContinuationContext(value?: string, continuing = false): void {
    this.continuationContext = value;
    this.contextStarted = continuing;
  }

  private ensureSpace(height: number): void {
    if (this.y + height > this.bottom && this.y > TOP) this.newPage();
  }

  private measure(
    value: string,
    options: ParagraphOptions,
    availableWidth = this.width - (options.indent ?? 0),
  ): { lines: string[]; lineHeight: number } {
    const size = options.fontSize ?? font.body;
    this.doc.setFont('helvetica', options.style ?? 'normal');
    this.doc.setFontSize(size);
    return {
      lines: wrapPdfText(this.doc, value, availableWidth),
      lineHeight: size / this.doc.internal.scaleFactor * BODY_LINE_HEIGHT,
    };
  }

  private headingMeasurement(heading: PendingHeading, atTop: boolean): {
    lines: string[];
    lineHeight: number;
    height: number;
  } {
    const size = heading.level === 1 ? font.section
      : heading.level === 2 ? font.subsection : font.finding;
    const availableWidth = heading.finding ? this.width - 6 : this.width;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(size);
    const lines = wrapPdfText(this.doc, heading.value, availableWidth);
    const lineHeight = size / this.doc.internal.scaleFactor * 1.2;
    const before = atTop || heading.level === 1 ? 0 : heading.level === 2 ? 8 : 7;
    const after = heading.level === 1 ? 10 : heading.level === 2 ? 4 : 3;
    const boxPadding = heading.finding ? 5 : 0;
    return {
      lines,
      lineHeight,
      height: before + lines.length * lineHeight + after + boxPadding,
    };
  }

  private flushHeadings(keepWithNext: number): void {
    if (!this.pendingHeadings.length) return;
    let atTop = this.y <= TOP;
    let headingHeight = 0;
    for (const heading of this.pendingHeadings) {
      headingHeight += this.headingMeasurement(heading, atTop).height;
      atTop = false;
    }
    this.ensureSpace(headingHeight + keepWithNext);
    const headings = this.pendingHeadings;
    this.pendingHeadings = [];
    headings.forEach(heading => this.drawHeading(heading));
  }

  private drawHeading(heading: PendingHeading): void {
    const atTop = this.y <= TOP;
    const measured = this.headingMeasurement(heading, atTop);
    const size = heading.level === 1 ? font.section
      : heading.level === 2 ? font.subsection : font.finding;
    const before = atTop || heading.level === 1 ? 0 : heading.level === 2 ? 8 : 7;
    this.y += before;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(size);

    if (heading.finding) {
      const boxHeight = measured.lines.length * measured.lineHeight + 5;
      this.doc.setFillColor(color.findingTint);
      this.doc.roundedRect(MARGIN, this.y, this.width, boxHeight, 1.5, 1.5, 'F');
      this.doc.setFillColor(color.findingBorder);
      this.doc.rect(MARGIN, this.y, 0.9, boxHeight, 'F');
      this.doc.setTextColor('#7a1f2a');
      let lineY = this.y + 2.5;
      for (const line of measured.lines) {
        this.doc.text(line, MARGIN + 3, lineY + size / this.doc.internal.scaleFactor);
        lineY += measured.lineHeight;
      }
      this.y += boxHeight + 3;
    } else {
      this.doc.setTextColor(color.navy);
      for (const line of measured.lines) {
        this.doc.text(line, MARGIN, this.y + size / this.doc.internal.scaleFactor);
        this.y += measured.lineHeight;
      }
      if (heading.level === 1) {
        this.y += 3;
        this.doc.setDrawColor(color.blue);
        this.doc.setLineWidth(0.7);
        this.doc.line(MARGIN, this.y, MARGIN + this.width, this.y);
        this.y += 7;
      } else {
        this.y += heading.level === 2 ? 4 : 3;
      }
    }
    this.contextStarted = true;
  }

  private write(value: string, options: ParagraphOptions, keepWithNext = 0): void {
    const {
      fontSize = font.body,
      style = 'normal',
      color: textColor = color.ink,
      indent = 0,
      gap = 3.5,
      url,
    } = options;
    const measured = this.measure(value, options);
    const minimumLines = keepWithNext ? measured.lines.length : Math.min(measured.lines.length, 2);
    this.ensureSpace(minimumLines * measured.lineHeight + keepWithNext + gap);
    for (let index = 0; index < measured.lines.length; index++) {
      const next = index === measured.lines.length - 1 ? keepWithNext + gap : 0;
      this.ensureSpace(measured.lineHeight + next);
      this.doc.setFont('helvetica', style);
      this.doc.setFontSize(fontSize);
      this.doc.setTextColor(textColor);
      const baseline = this.y + fontSize / this.doc.internal.scaleFactor;
      this.doc.text(measured.lines[index], MARGIN + indent, baseline);
      if (url && measured.lines[index]) {
        this.doc.link(MARGIN + indent, this.y,
          measurePdfText(this.doc, measured.lines[index]), measured.lineHeight, { url });
      }
      this.y += measured.lineHeight;
      this.contextStarted = true;
    }
    this.y += gap;
  }

  /** Queue a section, subsection, or minor heading with its first body content. */
  heading(value: string, level: 1 | 2 | 3 = 2): void {
    this.pendingHeadings.push({ value, level, finding: false });
  }

  /** Queue a red-tinted finding heading that matches the accepted report template. */
  findingHeading(value: string): void {
    this.pendingHeadings.push({ value, level: 3, finding: true });
  }

  /** Draw a paragraph, splitting oversized content at measured line boundaries. */
  paragraph(value: string, options: ParagraphOptions = {}): void {
    const measured = this.measure(value, options);
    this.flushHeadings(measured.lineHeight * Math.min(measured.lines.length, 2)
      + (options.gap ?? 3.5));
    this.write(value, options);
  }

  /** Draw a bullet field with a blue bold label and aligned wrapped value. */
  field(label: string, value: string, options: ParagraphOptions = {}): void {
    const size = options.fontSize ?? 9.5;
    const gap = options.gap ?? 1.2;
    const indent = options.indent ?? 5;
    const labelText = `${preparePdfText(label)}:`;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(size);
    const labelWidth = measurePdfText(this.doc, labelText) + 1.5;
    const valueWidth = Math.max(50, this.width - indent - labelWidth);
    this.doc.setFont('helvetica', options.style ?? 'normal');
    const lines = wrapPdfText(this.doc, value, valueWidth);
    const rowHeight = size / this.doc.internal.scaleFactor * BODY_LINE_HEIGHT;
    const totalHeight = rowHeight * lines.length + gap;
    const reservedHeight = totalHeight <= this.bottom - TOP
      ? totalHeight
      : rowHeight * Math.min(lines.length, 2) + gap;
    this.flushHeadings(reservedHeight);
    this.ensureSpace(reservedHeight);

    for (let index = 0; index < lines.length; index++) {
      this.ensureSpace(rowHeight + (index === lines.length - 1 ? gap : 0));
      const baseline = this.y + size / this.doc.internal.scaleFactor;
      if (index === 0) {
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(size);
        this.doc.setTextColor(color.blue);
        this.doc.text('•', MARGIN + 1, baseline);
        this.doc.setTextColor(color.navy);
        this.doc.text(labelText, MARGIN + indent, baseline);
      }
      this.doc.setFont('helvetica', options.style ?? 'normal');
      this.doc.setFontSize(size);
      this.doc.setTextColor(options.color ?? color.ink);
      this.doc.text(lines[index], MARGIN + indent + labelWidth, baseline);
      this.y += rowHeight;
      this.contextStarted = true;
    }
    this.y += gap;
  }

  /** Draw suggested maker text in the accepted blue callout treatment. */
  callout(label: string, value: string): void {
    const size = 9.5;
    const paddingX = 5;
    const paddingY = 4;
    const contentWidth = this.width - paddingX * 2;
    const labelText = `${preparePdfText(label)}:`;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(size);
    const lines = wrapPdfText(this.doc, value, contentWidth);
    const rowHeight = size / this.doc.internal.scaleFactor * BODY_LINE_HEIGHT;
    const blockHeight = paddingY * 2 + rowHeight * (lines.length + 1);
    this.flushHeadings(blockHeight + 2);
    if (blockHeight > this.bottom - TOP) {
      this.field(label, value);
      return;
    }
    this.ensureSpace(blockHeight + 2);
    this.doc.setFillColor(color.callout);
    this.doc.roundedRect(MARGIN, this.y, this.width, blockHeight, 1.5, 1.5, 'F');
    this.doc.setFillColor(color.blue);
    this.doc.rect(MARGIN, this.y, 0.9, blockHeight, 'F');
    let lineY = this.y + paddingY;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(size);
    this.doc.setTextColor(color.navy);
    this.doc.text(labelText, MARGIN + paddingX, lineY + size / this.doc.internal.scaleFactor);
    lineY += rowHeight;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(color.ink);
    for (const line of lines) {
      this.doc.text(line, MARGIN + paddingX, lineY + size / this.doc.internal.scaleFactor);
      lineY += rowHeight;
    }
    this.y += blockHeight + 2;
    this.contextStarted = true;
  }

  /** Keep a short block and queued headings together; oversized content still flows. */
  block(paragraphs: CsPdfParagraph[]): void {
    let height = 0;
    for (const { value, options = {} } of paragraphs) {
      const measured = this.measure(value, options);
      height += measured.lines.length * measured.lineHeight + (options.gap ?? 3.5);
    }
    this.flushHeadings(Math.min(height, this.bottom - TOP));
    if (height <= this.bottom - TOP) this.ensureSpace(height);
    for (const { value, options } of paragraphs) this.paragraph(value, options);
  }

  /** Draw a paginated table with navy headers and alternating light rows. */
  table(headers: string[], rows: string[][], options: TableOptions = {}): void {
    if (!headers.length || rows.some(row => row.length !== headers.length)) {
      throw new Error('Invalid PDF table shape.');
    }
    const size = options.fontSize ?? 9;
    const ratios = options.columnRatios?.length === headers.length
      ? options.columnRatios : headers.map(() => 1);
    const ratioTotal = ratios.reduce((sum, ratio) => sum + ratio, 0);
    const widths = ratios.map(ratio => this.width * ratio / ratioTotal);
    const headerHeight = this.tableRowHeight(headers, widths, size, true);
    const firstHeight = rows.length ? this.tableRowHeight(rows[0], widths, size, false) : 0;
    this.flushHeadings(4 + headerHeight + firstHeight);
    this.y += 4;

    const drawHeader = () => this.drawTableRow(headers, widths, size, true, false);
    drawHeader();
    rows.forEach((row, index) => {
      const rowHeight = this.tableRowHeight(row, widths, size, false);
      if (this.y + rowHeight > this.bottom && this.y > TOP) {
        this.newPage();
        drawHeader();
      }
      this.drawTableRow(row, widths, size, false, index % 2 === 1,
        options.rowTextColors?.[index]);
    });
    this.y += 7;
  }

  private tableRowHeight(values: string[], widths: number[], size: number, bold: boolean): number {
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    const rowHeight = size / this.doc.internal.scaleFactor * 1.3;
    const lines = values.map((value, index) =>
      wrapPdfText(this.doc, value, widths[index] - 6).length);
    return Math.max(8, Math.max(...lines) * rowHeight + 5.2);
  }

  private drawTableRow(
    values: string[],
    widths: number[],
    size: number,
    header: boolean,
    striped: boolean,
    textColor?: string,
  ): void {
    const height = this.tableRowHeight(values, widths, size, header);
    if (header) {
      this.doc.setFillColor(color.navy);
      this.doc.rect(MARGIN, this.y, this.width, height, 'F');
    } else if (striped) {
      this.doc.setFillColor(color.stripe);
      this.doc.rect(MARGIN, this.y, this.width, height, 'F');
    }
    this.doc.setDrawColor(color.border);
    this.doc.setLineWidth(0.25);
    this.doc.rect(MARGIN, this.y, this.width, height, 'S');

    let x = MARGIN;
    const rowHeight = size / this.doc.internal.scaleFactor * 1.3;
    values.forEach((value, index) => {
      if (index) this.doc.line(x, this.y, x, this.y + height);
      this.doc.setFont('helvetica', header ? 'bold' : 'normal');
      this.doc.setFontSize(size);
      this.doc.setTextColor(header ? '#ffffff' : textColor ?? color.ink);
      const lines = wrapPdfText(this.doc, value, widths[index] - 6);
      lines.forEach((line, lineIndex) => {
        this.doc.text(line, x + 3,
          this.y + 2.6 + size / this.doc.internal.scaleFactor + lineIndex * rowHeight);
      });
      x += widths[index];
    });
    this.y += height;
    this.contextStarted = true;
  }

  /** Draw a subtle accepted-template divider. */
  divider(): void {
    if (this.y + 7 > this.bottom) return;
    this.doc.setDrawColor(color.border);
    this.doc.setLineWidth(0.25);
    this.doc.line(MARGIN, this.y, MARGIN + this.width, this.y);
    this.y += 7;
  }

  /** Finish pending content and add accepted running page furniture. */
  finish(
    publicSafe: boolean,
    brandedCover = false,
    title = 'Copilot Studio Agent Review',
  ): void {
    this.flushHeadings(0);
    finishCsPdfPages(this.doc, title, publicSafe, brandedCover);
  }
}
