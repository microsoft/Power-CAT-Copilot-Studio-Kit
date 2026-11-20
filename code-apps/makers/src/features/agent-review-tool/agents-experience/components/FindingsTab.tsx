import { useMemo, useState } from 'react';
import { Text, ToggleButton, makeStyles, shorthands, tokens } from '@fluentui/react-components';
import {
  BotRegular,
  GlobeRegular,
  ServerRegular,
  WrenchRegular,
} from '@fluentui/react-icons';
import type { JSX } from 'react';
import type { Severity, FindingView, CapabilityChip } from './viewTypes';
import { SkillGlyph } from './common';
import { FindingsGrouped } from './findings/FindingsGrouped';
import { buildFindingsGroupedView } from './findings/findingsGroupedModel';

/** Findings tab: capability inventory line + severity filter pills + grouped rail/detail. */

type Filter = 'all' | Severity;

/** Fluent icon per capability-chip kind (skills keep the gradient glyph). */
const CHIP_ICONS: Record<string, JSX.Element> = {
  tool: <WrenchRegular fontSize={12} />,
  mcp: <ServerRegular fontSize={12} />,
  agent: <BotRegular fontSize={12} />,
  knw: <GlobeRegular fontSize={12} />,
};

const useStyles = makeStyles({
  intro: {
    padding: '14px 20px 0',
    color: tokens.colorNeutralForeground2,
    fontSize: '12.5px',
  },
  /**
   * Inventory line, not a filter row.
   *
   * These used to be bordered pills sitting directly above the severity filter
   * pills, so two visually identical rows read as two sets of controls when only
   * one was interactive. The border and filled background are what carried that
   * false affordance, so they are gone; the icons stay, because colour + glyph
   * per component kind is the same visual language the Agent map and the grids
   * use, and that recognition is worth keeping.
   */
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXXL,
    rowGap: tokens.spacingVerticalXS,
    padding: '10px 20px 0',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12.5px',
    color: tokens.colorNeutralForeground2,
  },
  chipIcon: {
    width: '18px',
    height: '18px',
    borderRadius: '5px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    fontSize: '12px',
    flexShrink: 0,
  },
  chipCount: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    fontVariantNumeric: 'tabular-nums',
  },
  pills: {
    display: 'flex',
    gap: '8px',
    padding: '14px 20px',
    flexWrap: 'wrap',
  },
  /**
   * Selected filter, styled to match the Map/List switch in the Agent map.
   *
   * That switch is a `subtle-circular` TabList, whose selected item is a light
   * brand-tinted pill. A ToggleButton cannot reach that look from an appearance
   * prop -- `primary` is a solid dark fill and `subtle` reads as greyed out --
   * so the brand tokens are applied directly. ToggleButton is kept rather than
   * swapping to a TabList because this is a filter, not navigation: `role=group`
   * with pressed buttons is what a screen reader should hear, not "tab".
   *
   * The border is the brand stroke rather than transparent: on a tinted fill a
   * transparent edge leaves the selected pill with a softer outline than the
   * unselected ones beside it, so the active option reads as the least defined
   * thing in the row. A visible brand edge also carries the selection without
   * relying on the fill alone, which matters at low contrast settings.
   */
  pillChecked: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    ...shorthands.borderColor(tokens.colorBrandStroke1),
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2Hover,
      color: tokens.colorBrandForeground2,
      ...shorthands.borderColor(tokens.colorBrandStroke1),
    },
    ':hover:active': {
      backgroundColor: tokens.colorBrandBackground2Pressed,
      color: tokens.colorBrandForeground2,
      ...shorthands.borderColor(tokens.colorBrandStroke1),
    },
  },
  body: {
    padding: '4px 20px 20px',
  },
});

export interface FindingsTabProps {
  findings: FindingView[];
  capabilityChips: CapabilityChip[];
  /** Rule id to preselect (cross-tab jump from the Skill evaluator). */
  focusFindingId?: string | null;
}

export function FindingsTab({ findings, capabilityChips, focusFindingId }: FindingsTabProps) {
  const styles = useStyles();
  const [filter, setFilter] = useState<Filter>('all');

  // A cross-tab jump must not be hidden by an active severity filter. Reset the
  // filter during render when a new focus id arrives (React-recommended pattern,
  // avoids a cascading effect re-render).
  const [prevFocus, setPrevFocus] = useState(focusFindingId);
  if (focusFindingId && focusFindingId !== prevFocus) {
    setPrevFocus(focusFindingId);
    setFilter('all');
  } else if (focusFindingId !== prevFocus) {
    setPrevFocus(focusFindingId);
  }

  const counts = useMemo(() => {
    const bySev = { error: 0, warning: 0, info: 0 } as Record<Severity, number>;
    findings.forEach((f) => {
      bySev[f.sev] += 1;
    });
    return bySev;
  }, [findings]);

  const pills: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: findings.length },
    { key: 'error', label: 'Errors', count: counts.error },
    { key: 'warning', label: 'Warnings', count: counts.warning },
    { key: 'info', label: 'Info', count: counts.info },
  ];

  const grouped = useMemo(() => {
    const visible = findings.filter((f) => filter === 'all' || f.sev === filter);
    return buildFindingsGroupedView(visible, findings);
  }, [findings, filter]);

  return (
    <section aria-label="Review findings">
      <Text block className={styles.intro}>
        Every finding is grounded in parsed agent data and linked to an official reference.
      </Text>

      <div className={styles.chips} aria-label="Capability inventory">
        {capabilityChips.map((chip) => (
          <span key={chip.label} className={styles.chip}>
            {chip.kind === 'skill' ? (
              <SkillGlyph size={16} />
            ) : (
              // chip accent color is data-driven
              <span className={styles.chipIcon} style={{ backgroundColor: chip.color }}>
                {CHIP_ICONS[chip.kind]}
              </span>
            )}
            <span className={styles.chipCount}>{chip.count}</span> {chip.label}
          </span>
        ))}
      </div>

      <div className={styles.pills} role="group" aria-label="Filter by severity">
        {pills.map((pill) => (
          <ToggleButton
            key={pill.key}
            className={filter === pill.key ? styles.pillChecked : undefined}
            shape="circular"
            size="small"
            // `secondary` keeps a neutral stroke on the unselected options, so
            // every pill reads as a control. `subtle` removes the border
            // entirely, which left them looking like plain text until hovered.
            appearance="secondary"
            checked={filter === pill.key}
            onClick={() => setFilter(pill.key)}
          >
            {pill.label} ({pill.count})
          </ToggleButton>
        ))}
      </div>

      <div className={styles.body}>
        <FindingsGrouped grouped={grouped} focusFindingId={focusFindingId} />
      </div>
    </section>
  );
}
