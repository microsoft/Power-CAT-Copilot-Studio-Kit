import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Dashboard product icons', () => {
  it('embeds the M365 logo so it does not depend on a separate hosted PNG path', () => {
    const source = readFileSync(new URL('../Dashboard.tsx', import.meta.url), 'utf8');

    expect(source.includes(
      "import M365CopilotIcon from '../assets/M365Copilot.png?inline';",
    )).toBe(true);
  });
});
