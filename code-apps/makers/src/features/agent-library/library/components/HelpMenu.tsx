/**
 * HelpMenu — "?" button with popover menu for Report a bug / Request a feature.
 * Used in dialog footers across agent template and declarative agent flows.
 */

import React from 'react';
import {
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Button,
  makeStyles,
} from '@fluentui/react-components';
import {
  Bug20Regular,
  LightbulbFilament20Regular,
  QuestionCircle20Regular,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  trigger: {
    paddingLeft: 0,
  },
});

export const HelpMenu: React.FC = React.memo(() => {
  const styles = useStyles();

  return (
    <Menu positioning="above-start">
      <MenuTrigger disableButtonEnhancement>
        <Button
          className={styles.trigger}
          appearance="subtle"
          icon={<QuestionCircle20Regular />}
          aria-label="Help"
        />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem
            icon={<Bug20Regular />}
            onClick={() => window.open('https://aka.ms/HPA_RequestAFeature', '_blank')}
          >
            Report a bug
          </MenuItem>
          <MenuItem
            icon={<LightbulbFilament20Regular />}
            onClick={() => window.open('https://aka.ms/HPA_RequestAFeature', '_blank')}
          >
            Request a feature
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
});

HelpMenu.displayName = 'HelpMenu';
