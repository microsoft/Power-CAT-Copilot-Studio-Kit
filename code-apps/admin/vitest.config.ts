import { defineConfig } from 'vitest/config';
import { offlineViewerPlugin } from './build/offline-viewer-plugin.ts';

export default defineConfig({
  plugins: [offlineViewerPlugin()],
  test: {
    include: [
      'src/features/agent-debugger/utils/__tests__/deep-link.test.ts',
      'src/features/agent-debugger/services/__tests__/snapshot-service.test.ts',
      'src/features/agent-debugger/utils/analysis-report.test.ts',
      'src/features/agent-debugger/utils/analysis-html.test.ts',
      'src/features/agent-debugger/utils/transcript/extract-activity-text.test.ts',
      // Credit isolation seam tests (T010). Scoped by file rather than the whole
      // power-shield tree because the broader suites load the real
      // @microsoft/power-apps data module, which cannot resolve in the node env.
      'src/features/power-shield/__tests__/requestType.test.ts',
      'src/features/power-shield/__tests__/creditAvailability.test.ts',
      'src/features/power-shield/__tests__/creditRetryPlanning.test.ts',
      'src/features/power-shield/__tests__/creditDecisionStatus.test.ts',
      'src/features/power-shield/__tests__/creditStatBucket.test.ts',
      'src/features/power-shield/__tests__/creditDecision.test.ts',
      'src/features/power-shield/__tests__/creditApprovalRules.test.ts',
      'src/features/power-shield/__tests__/creditApprovalCommand.test.ts',
      'src/features/power-shield/__tests__/creditAllocationService.test.ts',
      'src/features/power-shield/__tests__/creditCapacity.test.ts',
      'src/features/power-shield/__tests__/creditCapacityText.test.ts',
      'src/features/power-shield/__tests__/questionMapping.test.ts',
    ],
    environment: 'node',
  },
});
