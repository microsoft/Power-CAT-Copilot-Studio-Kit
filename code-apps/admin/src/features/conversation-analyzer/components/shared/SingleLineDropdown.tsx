import { Dropdown, makeStyles, type DropdownProps } from '@fluentui/react-components';

const useStyles = makeStyles({
  text: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
});

/**
 * Fluent Dropdown that keeps the standard control height: long selected values end in an
 * ellipsis instead of wrapping, and the full value shows on hover.
 */
export function SingleLineDropdown(props: Omit<DropdownProps, 'button'>) {
  const styles = useStyles();
  const text = props.value || props.placeholder || '';
  return (
    <Dropdown
      {...props}
      button={{ title: props.value || undefined, children: <span className={styles.text}>{text}</span> }}
    />
  );
}
