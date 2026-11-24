/**
 * TemplateFilter — "All templates" multi-select filter for the Templates tab.
 *
 * A Fluent-styled popover that lets the user narrow the template grid by:
 *   • Template source — System / Custom
 *   • Agent type      — Custom agent / Declarative agent
 *
 * Each group header shows how many of its options are selected, and the trigger
 * summarises the total selected count. Selection state is controlled by the
 * parent so filtering stays in one place.
 *
 * Design ref: Custom Agent Templates Mock — html/agent-library.html (#templateFilter)
 */

import { useState } from 'react';
import {
  makeStyles,
  mergeClasses,
  tokens,
  Popover,
  PopoverTrigger,
  PopoverSurface,
  Button,
  Checkbox,
  Divider,
  Caption1,
} from '@fluentui/react-components';
import { ChevronDown16Regular } from '@fluentui/react-icons';
import { useAgentLibrary } from '../provider/AgentLibraryProvider';

/** Active selection across the two filter axes. Empty arrays mean "no filter". */
export interface TemplateFilterValue {
  sources: string[];
  agentTypes: string[];
}

interface TemplateFilterProps {
  value: TemplateFilterValue;
  onChange: (value: TemplateFilterValue) => void;
}

const useStyles = makeStyles({
  trigger: {
    // Match the "All categories" Fluent Dropdown (appearance="underline"):
    // transparent fill, bottom-only border, top-rounded corners, 180px wide,
    // label left / chevron right. Uses the Button's "transparent" appearance so
    // there are no side/top borders to fight — we add just the underline.
    minWidth: '180px',
    justifyContent: 'space-between',
    fontWeight: tokens.fontWeightRegular,
    paddingLeft: tokens.spacingHorizontalMNudge,
    paddingRight: tokens.spacingHorizontalSNudge,
    borderBottomColor: tokens.colorNeutralStrokeAccessible,
    borderBottomWidth: tokens.strokeWidthThin,
    borderBottomStyle: 'solid',
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
    color: tokens.colorNeutralForeground1,
    // The underline Dropdown has no background change on hover/press — only its
    // bottom border reacts.
    ':hover': {
      backgroundColor: tokens.colorTransparentBackground,
      borderBottomColor: tokens.colorNeutralStrokeAccessibleHover,
      color: tokens.colorNeutralForeground1,
    },
    ':hover:active': {
      backgroundColor: tokens.colorTransparentBackground,
      borderBottomColor: tokens.colorNeutralStrokeAccessiblePressed,
      color: tokens.colorNeutralForeground1,
    },
  },
  // Brand underline while the popover is open (mirrors the Dropdown focus bar).
  triggerOpen: {
    borderBottomColor: tokens.colorCompoundBrandStroke,
    ':hover': { borderBottomColor: tokens.colorCompoundBrandStroke },
  },
  triggerActive: {
    borderBottomColor: tokens.colorCompoundBrandStroke,
  },
  chevron: {
    color: tokens.colorNeutralForeground3,
    fontSize: '20px',
  },
  surface: {
    width: '208px',
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalXXS,
    minHeight: '24px',
  },
  headLabel: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  groupLabel: {
    color: tokens.colorNeutralForeground3,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXXS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
  },
  // Full-width row hover, mirroring the "All categories" Dropdown options.
  // `display: flex` + `width: 100%` forces the Checkbox root to stretch so the
  // hover background spans the entire row edge-to-edge.
  option: {
    display: 'flex',
    alignItems: 'center',
    width: '198px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusMedium,
    paddingRight: tokens.spacingHorizontalS,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    ':active': {
      backgroundColor: tokens.colorNeutralBackground1Pressed,
    },
    // Fix the checkbox label to a consistent width so rows align uniformly.
    '& .fui-Checkbox__label': {
      width: '170px',
    },
  },
});

/** Toggles `value` in `list`, returning a new array (immutable). */
function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Appends a "(n)" suffix to a group label when items are selected. */
function withCount(label: string, count: number): string {
  return count > 0 ? `${label} (${count})` : label;
}

const TemplateFilter: React.FC<TemplateFilterProps> = ({ value, onChange }) => {
  const styles = useStyles();
  const { host } = useAgentLibrary();
  const [open, setOpen] = useState(false);

  // The "Template source" facet (System vs Custom) is only meaningful where
  // custom templates exist. HPA has no custom templates, so hide it there.
  const showSource = host !== 'hpa';

  const activeCount =
    (showSource ? value.sources.length : 0) + value.agentTypes.length;
  const label = activeCount > 0 ? `${activeCount} selected` : 'All templates';

  const clearAll = () => onChange({ sources: [], agentTypes: [] });

  return (
    <Popover
      open={open}
      onOpenChange={(_, data) => setOpen(data.open)}
      positioning="below-end"
      trapFocus
    >
      <PopoverTrigger disableButtonEnhancement>
        <Button
          className={mergeClasses(
            styles.trigger,
            open && styles.triggerOpen,
            activeCount > 0 && styles.triggerActive,
          )}
          appearance="transparent"
          iconPosition="after"
          icon={<ChevronDown16Regular className={styles.chevron} />}
          aria-label="Filter templates"
        >
          {label}
        </Button>
      </PopoverTrigger>

      <PopoverSurface className={styles.surface}>
        <div className={styles.head}>
          <Caption1 className={styles.headLabel}>All templates</Caption1>
          {activeCount > 0 && (
            <Button appearance="transparent" size="small" onClick={clearAll}>
              Clear
            </Button>
          )}
        </div>

        <Divider />

        {showSource && (
          <>
            <div className={styles.group} role="group" aria-label="Template source">
              <Caption1 className={styles.groupLabel}>
                {withCount('Template source', value.sources.length)}
              </Caption1>
              <Checkbox
                className={styles.option}
                label="System template"
                checked={value.sources.includes('system')}
                onChange={() => onChange({ ...value, sources: toggle(value.sources, 'system') })}
              />
              <Checkbox
                className={styles.option}
                label="Custom template"
                checked={value.sources.includes('custom')}
                onChange={() => onChange({ ...value, sources: toggle(value.sources, 'custom') })}
              />
            </div>

            <Divider />
          </>
        )}

        <div className={styles.group} role="group" aria-label="Agent type">
          <Caption1 className={styles.groupLabel}>
            {withCount('Agent type', value.agentTypes.length)}
          </Caption1>
          <Checkbox
            className={styles.option}
            label="Custom agent"
            checked={value.agentTypes.includes('custom')}
            onChange={() => onChange({ ...value, agentTypes: toggle(value.agentTypes, 'custom') })}
          />
          <Checkbox
            className={styles.option}
            label="Declarative agent"
            checked={value.agentTypes.includes('declarative')}
            onChange={() => onChange({ ...value, agentTypes: toggle(value.agentTypes, 'declarative') })}
          />
        </div>
      </PopoverSurface>
    </Popover>
  );
};

export default TemplateFilter;
