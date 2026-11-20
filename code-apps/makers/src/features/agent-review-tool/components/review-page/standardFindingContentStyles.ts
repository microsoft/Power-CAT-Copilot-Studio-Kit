import { makeStyles, shorthands, tokens } from '@fluentui/react-components';

export const useStandardFindingContentStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  badges: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
  },
  action: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    ...shorthands.borderLeft(tokens.strokeWidthThick, 'solid', tokens.colorBrandStroke1),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  suggestion: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  headingRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
  heading: {
    margin: 0,
  },
  text: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: 0,
  },
  settings: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    listStyleType: 'none',
    margin: 0,
    padding: 0,
  },
  setting: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    ...shorthands.borderTop(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    paddingTop: tokens.spacingVerticalM,
  },
  metadata: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    color: tokens.colorNeutralForeground3,
  },
  current: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalS),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  instructions: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: 0,
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalS),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  issues: {
    ...shorthands.borderTop(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  },
  issueHeader: {
    minHeight: '44px',
  },
  issuePanel: {
    ...shorthands.padding(
      tokens.spacingVerticalS,
      0,
      tokens.spacingVerticalL,
      tokens.spacingHorizontalM,
    ),
  },
  reviewAccordion: {
    ...shorthands.borderTop(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  },
  reviewHeader: {
    minHeight: '44px',
    ...shorthands.padding(tokens.spacingVerticalXS, 0),
  },
  reviewPanel: {
    ...shorthands.padding(0, 0, tokens.spacingVerticalS, tokens.spacingHorizontalM),
  },
  reviewContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
  },
  navigator: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
});
