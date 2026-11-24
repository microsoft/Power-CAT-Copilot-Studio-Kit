import { makeStyles, tokens } from '@fluentui/react-components';

/**
 * Shared surface styles for cards, panels, and section wrappers.
 * Replaces duplicated card/surface styles across components.
 */
export const useSurfaceStyles = makeStyles({
  /** Standard surface card — white bg, shadow, rounded, padded */
  surfaceCard: {
    paddingTop: tokens.spacingVerticalXL,
    paddingBottom: tokens.spacingVerticalXL,
    paddingLeft: tokens.spacingHorizontalXL,
    paddingRight: tokens.spacingHorizontalXL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow2,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  /** Flush surface card — no padding, for wrapping tables */
  surfaceCardFlush: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow2,
    overflow: 'hidden',
  },
  /** Elevated card — prominent shadow for wizard/modal cards */
  elevatedCard: {
    width: '100%',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow16,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
});
