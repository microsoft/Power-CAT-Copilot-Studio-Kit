import { makeStyles, tokens } from '@fluentui/react-components';
import { layout } from '../../theme/powerShieldTheme.tokens';

export const useAppShellStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'row',
    width: '100%',
    height: '100vh',
    overflow: 'hidden',
  },
  content: {
    flex: '1',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  contentInner: {
    maxWidth: layout.contentMaxWidth,
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: tokens.spacingHorizontalXXL,
    paddingRight: tokens.spacingHorizontalXXL,
    boxSizing: 'border-box',
    minHeight: '100%',
  },
});
