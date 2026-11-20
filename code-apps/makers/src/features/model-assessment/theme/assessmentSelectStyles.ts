import { makeStyles, tokens } from '@fluentui/react-components';

export const useAssessmentSelectStyles = makeStyles({
  select: {
    minWidth: 0,
    width: '100%',
    // Fluent Select's gradient grows with the corner radius; retain only the focus stroke.
    '&::after': {
      clipPath: `inset(calc(100% - ${tokens.strokeWidthThick}) 0 0 0)`,
    },
  },
});
