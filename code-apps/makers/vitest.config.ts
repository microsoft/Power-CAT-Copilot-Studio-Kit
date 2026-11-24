import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: [
      'src/features/agent-review-tool/**/__tests__/**/*.test.ts',
      'src/features/model-assessment/**/__tests__/**/*.test.ts',
      // Credit isolation seam tests (T014/T015). Scoped to these files rather than
      // the whole power-shield tree because some pre-existing power-shield suites
      // fail to collect (they don't mock every generated service, so the real
      // @microsoft/power-apps module loads and cannot resolve in the node env).
      'src/features/power-shield/__tests__/isolation.credit-vs-connector.test.ts',
      'src/features/power-shield/__tests__/rowlevel.ownership.test.ts',
      'src/features/power-shield/__tests__/credit-submit.test.ts',
      'src/features/power-shield/__tests__/credit-status-map.test.ts',
      'src/features/power-shield/__tests__/credit-withdraw.test.ts',
      'src/features/power-shield/__tests__/credit-draft-resume.test.ts',
      'src/features/power-shield/__tests__/environment-group-snapshot.test.ts',
      'src/features/power-shield/__tests__/credit-amount-rules.test.ts',
      'src/features/power-shield/__tests__/credit-wizard-reducer.test.ts',
      'src/features/power-shield/__tests__/environment-selection.test.ts',
      'src/features/power-shield/__tests__/comments.credit-isolation.test.ts',
      'src/features/power-shield/shared/components/__tests__/RequestContextCapsules.test.tsx',
      // A test beside the module it covers is still a test. The three scoring suites that sat
      // outside __tests__ were silently uncollected, which is how an unregistered rule id reached
      // production past a guard written to reject exactly that.
      'src/features/agent-review-tool/**/*.test.ts',
      'src/features/model-assessment/**/__tests__/**/*.test.{ts,tsx}',
      'src/features/advanced-testing/**/__tests__/**/*.test.tsx',
    ],
    environment: 'node',
  },
});
