# Copilot Studio Theme

This directory contains the Copilot Studio brand theme for the application.

## Theme File

**`copilotStudioTheme.ts`** - Fluent UI v9 light theme with Copilot Studio brand colors

## Usage

The theme is already applied globally in `App.tsx`:

```tsx
import { copilotStudioTheme } from './styles/copilotStudioTheme';

<FluentProvider theme={copilotStudioTheme}>
  {/* Your app content */}
</FluentProvider>
```

## Brand Colors

The Copilot Studio brand color ramp (16 steps):

| Token | Hex | Usage |
|-------|-----|-------|
| 10 | `#00222e` | Darkest brand color |
| 20 | `#012f40` | |
| 30 | `#01384d` | |
| 40 | `#014259` | |
| 50 | `#014d69` | |
| 60 | `#015a7a` | |
| 70 | `#01678c` | Default brand foreground |
| 80 | `#02729c` | Default brand stroke |
| 90 | `#077fab` | Primary brand color |
| 100 | `#1f92bf` | |
| 110 | `#3aaad6` | |
| 120 | `#5ac1ed` | |
| 130 | `#7fd2f5` | |
| 140 | `#9edcf7` | |
| 150 | `#bee7fa` | |
| 160 | `#def2fc` | Lightest brand color |

## Accessing Theme Tokens

Use design tokens from `@fluentui/react-components` to access theme colors:

```tsx
import { makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  primaryButton: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': {
      backgroundColor: tokens.colorBrandBackgroundHover,
    },
  },
  brandText: {
    color: tokens.colorBrandForeground1,
  },
  brandBorder: {
    borderColor: tokens.colorBrandStroke1,
  },
});
```

## Common Brand Tokens

- **Backgrounds**: `tokens.colorBrandBackground`, `tokens.colorBrandBackgroundHover`
- **Foregrounds**: `tokens.colorBrandForeground1`, `tokens.colorBrandForeground2`
- **Strokes**: `tokens.colorBrandStroke1`, `tokens.colorBrandStroke2`
- **On Brand**: `tokens.colorNeutralForegroundOnBrand` (white text on brand background)

## Implementation Details

- Created using `createLightTheme()` from `@fluentui/react-components`
- Automatically generates all semantic color tokens
- Maintains Fluent UI's neutral color system for backgrounds/borders
- Applies brand colors to interactive elements (buttons, links, focus states)

## Source

The brand colors come from a Figma design.
