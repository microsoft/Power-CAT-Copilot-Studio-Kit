import { useMemo } from 'react';
import { makeStyles, tokens, Body1, Body1Strong } from '@fluentui/react-components';
import { getCategoricalPalette } from '../../../utils/chartColors';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    overflow: 'hidden',
    width: '100%',
    height: '100%',
    padding: tokens.spacingHorizontalS,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minHeight: '24px',
  },
  rank: {
    color: tokens.colorNeutralForeground3,
    minWidth: '20px',
    textAlign: 'right' as const,
  },
  dot: {
    width: tokens.spacingHorizontalSNudge,
    height: tokens.spacingHorizontalSNudge,
    borderRadius: tokens.borderRadiusCircular,
    flexShrink: 0,
  },
  label: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground1,
  },
  value: {
    color: tokens.colorNeutralForeground2,
    flexShrink: 0,
  },
});

export interface TopicsListItem {
  label: string;
  value: number;
  color?: string;
}

export interface FluentTopicsListProps {
  data: TopicsListItem[];
  tenantPrimary?: string;
  ariaLabel?: string;
}

export function FluentTopicsList({ data, tenantPrimary, ariaLabel }: FluentTopicsListProps) {
  const s = useStyles();
  const palette = getCategoricalPalette(tenantPrimary);

  const formattedData = useMemo(
    () =>
      data.map((item, idx) => ({
        ...item,
        color: item.color ?? palette[idx % palette.length],
        formattedValue: new Intl.NumberFormat('en-US').format(item.value),
      })),
    [data, palette]
  );

  return (
    <div className={s.root} aria-label={ariaLabel}>
      {formattedData.map((item, idx) => (
        <div key={item.label} className={s.row}>
          <Body1 className={s.rank}>{idx + 1}</Body1>
          <div className={s.dot} style={{ backgroundColor: item.color }} />
          <Body1 className={s.label} title={item.label}>
            {item.label}
          </Body1>
          <Body1Strong className={s.value}>{item.formattedValue}</Body1Strong>
        </div>
      ))}
    </div>
  );
}
