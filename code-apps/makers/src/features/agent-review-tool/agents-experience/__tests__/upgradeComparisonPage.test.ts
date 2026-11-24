import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../components/CopilotReviewPage.tsx', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

function countOf(text: string): number {
  return source.split(text).length - 1;
}

/** The source between the dialog mount and the Toaster. Empty when the mount is missing or after the Toaster. */
function mountSource(): string {
  const start = source.indexOf('{compareOpen && activePayload && (');
  const end = source.indexOf('<Toaster toasterId={toasterId}');
  return start === -1 || end === -1 ? '' : source.slice(start, end);
}

describe('CopilotReviewPage Compare with original', () => {
  it('shows the button only for a live review of an upgraded copy', () => {
    expect(source).toContain("import { isUpgradedCopyName } from '../../utils/upgradePairing';");
    expect(source).toContain(
      '  const showCompareWithOriginal = !isZipReview && isUpgradedCopyName(agentName);',
    );
    expect(countOf('{showCompareWithOriginal && (')).toBe(1);
  });

  it('puts the button first in the header actions', () => {
    const actionsIndex = source.indexOf('<div className={styles.chromeActions}>');
    const buttonIndex = source.indexOf('{showCompareWithOriginal && (');
    const historyIndex = source.indexOf('<Tooltip content="Version history" relationship="label">');
    expect(actionsIndex).toBeGreaterThan(-1);
    expect(buttonIndex).toBeGreaterThan(actionsIndex);
    expect(historyIndex).toBeGreaterThan(buttonIndex);

    const button = source.slice(buttonIndex, historyIndex);
    expect(button).toContain('appearance="secondary"');
    expect(button).toContain('icon={<ArrowSwapRegular />}');
    expect(button).toContain('disabled={!activePayload}');
    expect(button).toContain('onClick={() => setCompareOpen(true)}');
    expect(button).toContain('Compare with original');
  });

  it('gives the focus back to the button when the dialog closes', () => {
    expect(source).toMatch(/import \{[^}]*\buseRestoreFocusTarget\b[^}]*\} from '@fluentui\/react-components';/);
    expect(source).toContain('  const compareFocusTarget = useRestoreFocusTarget();');
    const buttonIndex = source.indexOf('{showCompareWithOriginal && (');
    const historyIndex = source.indexOf('<Tooltip content="Version history" relationship="label">');
    expect(source.slice(buttonIndex, historyIndex)).toContain('{...compareFocusTarget}');
  });

  it('mounts the dialog only after the maker opens it', () => {
    expect(source).toContain('  const [compareOpen, setCompareOpen] = useState(false);');
    expect(countOf('setCompareOpen(true)')).toBe(1);
    expect(countOf('<UpgradeComparisonDialog')).toBe(1);

    const mainEndIndex = source.indexOf('</main>');
    const mountIndex = source.indexOf('{compareOpen && activePayload && (');
    expect(mainEndIndex).toBeGreaterThan(-1);
    expect(mountIndex).toBeGreaterThan(mainEndIndex);
    expect(mountSource()).toContain('<UpgradeComparisonDialog');
  });

  it('gives the dialog the copy review and reads no comparison data in the page', () => {
    expect(source).toContain("import { UpgradeComparisonDialog } from './UpgradeComparisonDialog';");
    const mount = mountSource();
    expect(mount).toContain('copyName={agentName}');
    expect(mount).toContain('copy={activePayload.model}');
    expect(mount).toContain('sourceEnvironment={activeSourceEnvironment}');
    expect(mount).toContain('onClose={() => setCompareOpen(false)}');
    expect(source).not.toContain('loadOriginalStageA');
    expect(source).not.toContain('compareUpgradePair');
    expect(source).not.toContain('findOriginalAgents');
  });
});
