import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  makeStyles,
  tokens,
} from '@fluentui/react-components';

interface AgentInventoryBreadcrumbItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface AgentInventoryBreadcrumbProps {
  items: AgentInventoryBreadcrumbItem[];
  size?: 'small' | 'medium' | 'large';
}

const useStyles = makeStyles({
  root: {
    minWidth: 0,
  },
  button: {
    minWidth: 'unset',
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    border: 'none',
    backgroundColor: 'transparent',
  },
});

/** Renders the location path for pages nested under Agent Inventory. */
export function AgentInventoryBreadcrumb({ items, size = 'medium' }: AgentInventoryBreadcrumbProps) {
  const styles = useStyles();

  return (
    <Breadcrumb className={styles.root} size={size} aria-label="Agent Inventory navigation">
      {items.map((item, index) => {
        const current = index === items.length - 1;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && <BreadcrumbDivider />}
            <BreadcrumbItem>
              <BreadcrumbButton
                className={styles.button}
                current={current}
                disabled={item.disabled}
                onClick={current || item.disabled ? undefined : item.onClick}
              >
                {item.label}
              </BreadcrumbButton>
            </BreadcrumbItem>
          </Fragment>
        );
      })}
    </Breadcrumb>
  );
}
