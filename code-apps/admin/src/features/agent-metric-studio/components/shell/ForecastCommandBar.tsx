import { makeStyles, tokens } from '@fluentui/react-components';
import { FilterStrip } from '../filters/FilterStrip';

const useStyles = makeStyles({
  root: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground1,
  },
  leftFlow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    minWidth: 0,
  },
});

export function ForecastCommandBar() {
  const s = useStyles();

  return (
    <div className={s.root}>
      <div className={s.leftFlow}>
        <FilterStrip showTimeRange={false} />
      </div>
    </div>
  );
}
