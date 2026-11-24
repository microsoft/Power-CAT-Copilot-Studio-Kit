import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Tooltip,
  isTruncatableBreadcrumbContent,
  makeStyles,
  tokens,
  truncateBreadcrumbLongName,
} from '@fluentui/react-components';
import { useNavigate } from 'react-router-dom';

/** Longer crumb labels (e.g. agent or environment names) are truncated with the full name on hover. */
const MAX_CRUMB_LENGTH = 32;

// Matches the Agent Inventory / Power Shield breadcrumb: plain text links, no button chrome.
const useStyles = makeStyles({
  root: {
    minWidth: 0,
    overflow: 'hidden',
    '& ol': { flexWrap: 'nowrap' },
    '& li': { whiteSpace: 'nowrap', flexShrink: 0 },
  },
  button: {
    minWidth: 'unset',
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    border: 'none',
    backgroundColor: 'transparent',
  },
});

export interface ScreenCrumb {
  label: string;
  /** Route to open; omitted for the current page. */
  to?: string;
}

/** Location path for Conversation Analyzer sub-screens; the last crumb is the current page. */
export function AnalyzerBreadcrumb({ crumbs }: { crumbs: ScreenCrumb[] }) {
  const styles = useStyles();
  const navigate = useNavigate();
  return (
    <Breadcrumb size="medium" aria-label="Conversation Analyzer navigation" className={styles.root}>
      {crumbs.map((crumb, i) => {
        const current = i === crumbs.length - 1 || !crumb.to;
        const truncated = isTruncatableBreadcrumbContent(crumb.label, MAX_CRUMB_LENGTH);
        const label = truncated ? truncateBreadcrumbLongName(crumb.label, MAX_CRUMB_LENGTH) : crumb.label;
        const button = (
          <BreadcrumbButton
            className={styles.button}
            current={current}
            onClick={current || !crumb.to ? undefined : () => navigate(crumb.to!)}
          >
            {label}
          </BreadcrumbButton>
        );
        return (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && <BreadcrumbDivider />}
            <BreadcrumbItem>
              {truncated ? <Tooltip content={crumb.label} relationship="label" withArrow>{button}</Tooltip> : button}
            </BreadcrumbItem>
          </Fragment>
        );
      })}
    </Breadcrumb>
  );
}
