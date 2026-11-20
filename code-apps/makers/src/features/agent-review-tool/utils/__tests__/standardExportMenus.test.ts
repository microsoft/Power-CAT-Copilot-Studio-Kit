import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as labels from '../../contracts/DisplayModels';

function readComponent(path: string): ts.SourceFile {
  const url = new URL(path, import.meta.url);
  return ts.createSourceFile(url.pathname, readFileSync(url, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function menuItems(source: ts.SourceFile, text: string): ts.JsxElement[] {
  const matches: ts.JsxElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === 'MenuItem' && node.getText().includes(text)) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return matches;
}

function attribute(element: ts.JsxElement, name: string): string | undefined {
  const property = element.openingElement.attributes.properties.find(
    (item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText() === name,
  );
  const value = property?.initializer;
  if (value && ts.isJsxExpression(value)) return value.expression?.getText().replace(/\s+/g, '');
  return value && ts.isStringLiteral(value) ? value.text : undefined;
}

const page = readComponent('../../components/review-page/StandardReviewPage.tsx');
const dialog = readComponent('../../components/dialogs/ReviewDialogV2.tsx');

describe.each([
  { name: 'standard page', source: page, handler: '()=>voiddownloadPublicPdfReport()', disabled: 'isExporting' },
  { name: 'legacy dialog', source: dialog, handler: 'onDownloadPublicPdf', disabled: 'isDownloadingPdf||isDownloadingSarif' },
])('$name public-safe export menu contract', ({ source, handler, disabled }) => {
  it('adds exactly one native public-safe item between full PDF and SARIF', () => {
    const items = menuItems(source, 'Download public-safe PDF');
    expect(items).toHaveLength(1);
    expect(menuItems(source, 'Download as PDF')).toHaveLength(1);
    expect(menuItems(source, 'Download as SARIF')).toHaveLength(1);
    expect(items[0].pos).toBeGreaterThan(menuItems(source, 'Download as PDF')[0].pos);
    expect(items[0].pos).toBeLessThan(menuItems(source, 'Download as SARIF')[0].pos);
  });

  it('invokes only the dedicated public-safe export callback', () => {
    const [item] = menuItems(source, 'Download public-safe PDF');
    expect(item).toBeDefined();
    expect(attribute(item, 'onClick')).toBe(handler);
  });

  it('uses the existing shared busy state to prevent overlapping exports', () => {
    const [item] = menuItems(source, 'Download public-safe PDF');
    expect(item).toBeDefined();
    expect(attribute(item, 'disabled')).toBe(disabled);
  });

  it('exposes the omission explanation as a Fluent tooltip description', () => {
    const [item] = menuItems(source, 'Download public-safe PDF');
    expect(item).toBeDefined();
    expect(ts.isJsxElement(item.parent)).toBe(true);
    const tooltip = item.parent as ts.JsxElement;
    expect(tooltip.openingElement.tagName.getText()).toBe('Tooltip');
    expect(attribute(tooltip, 'relationship')).toBe('description');
    expect(attribute(tooltip, 'content')).toBe('PUBLIC_SAFE_PDF_DESCRIPTION');
  });
});

it('explains exactly what is omitted and retained', () => {
  expect(labels.PUBLIC_SAFE_PDF_DESCRIPTION).toBe(
    'Reviewed and suggested text and source identifiers are omitted. Findings and saved scores are retained.',
  );
});

it('does not expose an unwired public-safe action in the legacy dialog', () => {
  const [item] = menuItems(dialog, 'Download public-safe PDF');
  expect(item).toBeDefined();
  let parent: ts.Node | undefined = item.parent;
  let callbackGuard = false;
  while (parent) {
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      && parent.left.getText() === 'onDownloadPublicPdf') callbackGuard = true;
    parent = parent.parent;
  }
  expect(callbackGuard).toBe(true);
});
