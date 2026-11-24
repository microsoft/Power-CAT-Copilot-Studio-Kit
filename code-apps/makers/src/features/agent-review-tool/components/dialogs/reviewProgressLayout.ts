import { tokens } from '@fluentui/react-components';

const COMPACT_ROW = `${tokens.spacingVerticalXL} + ${tokens.spacingVerticalXS}`;
const TOUCH_ROW = `${tokens.spacingVerticalXXXL} + ${tokens.spacingVerticalM}`;

export const REVIEW_PROGRESS_TOUCH_MEDIA = '@media (pointer: coarse)';

export const reviewProgressLayout = {
  rowHeight: `calc(${COMPACT_ROW})`,
  labelPadding: `calc((${COMPACT_ROW} - ${tokens.lineHeightBase200}) / 2)`,
  touchRowHeight: `calc(${TOUCH_ROW})`,
  touchLabelPadding: `calc((${TOUCH_ROW} - ${tokens.lineHeightBase200}) / 2)`,
};
