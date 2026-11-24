import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'build', 'node_modules', 'coverage', 'src/generated']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    // These patterns need runtime changes; see the README known gaps.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // These unused bindings need runtime changes; see the README known gaps.
    files: [
      'src/features/agent-library/library/components/DeclarativeEditForm.tsx',
      'src/features/agent-review-tool/review-core/rules/skill-runtime.rules.ts',
      'src/features/agent-review-tool/utils/complianceUtils.ts',
      'src/features/power-shield/shared/services/dataverse/requestService.ts',
      'src/shared/utils/mda-navigation.ts',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
])
