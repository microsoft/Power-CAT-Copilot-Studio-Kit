import { useId, useState, type FormEvent } from 'react';
import {
  Button,
  Dropdown,
  Field,
  Input,
  Label,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Tab,
  TabList,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ChevronLeft16Regular, ChevronRight16Regular, MoreHorizontal16Regular } from '@fluentui/react-icons';
import { MAX_VISIBLE_PAGES, parsePageNumber, visiblePageNumbers } from '../contracts/pagination';

const PAGE_SIZES = [5, 10, 25, 50, 100];
const INPUT_OVERFLOW_THRESHOLD = 50;

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingHorizontalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 1000px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  navigation: {
    gridColumn: '2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalXXS,
    minWidth: 0,
    '@media (max-width: 1000px)': { gridColumn: '1' },
  },
  tabs: {
    minWidth: 0,
    '@media (max-width: 600px)': {
      '& [role="tab"]:not([aria-selected="true"])': { display: 'none' },
    },
  },
  narrowOverflow: {
    '@media (min-width: 601px)': { display: 'none' },
  },
  pageSize: {
    gridColumn: '3',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    '@media (max-width: 1000px)': { gridColumn: '1', justifyContent: 'center' },
  },
  dropdown: { width: '80px', minWidth: '80px' },
  menu: { maxHeight: 'min(320px, 60vh)', overflowY: 'auto' },
  jump: { display: 'flex', alignItems: 'flex-start', gap: tokens.spacingHorizontalS },
  pageInput: { width: '112px' },
  live: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' },
});

export interface AssessmentPaginationProps {
  totalRecords: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function AssessmentPagination({
  totalRecords,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: AssessmentPaginationProps) {
  const styles = useStyles();
  const sizeId = useId();
  const [jumpOpen, setJumpOpen] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const [validation, setValidation] = useState('');
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const visiblePages = visiblePageNumbers(currentPage, totalPages);
  const inputOverflow = totalPages > INPUT_OVERFLOW_THRESHOLD;
  const overflowClassName = totalPages <= MAX_VISIBLE_PAGES ? styles.narrowOverflow : undefined;

  const jumpToPage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPage = parsePageNumber(pageInput, totalPages);
    if (nextPage === undefined) {
      setValidation(`Enter a page number from 1 to ${totalPages}.`);
      return;
    }
    onPageChange(nextPage);
    setJumpOpen(false);
  };

  return (
    <div className={styles.root}>
      <nav className={styles.navigation} aria-label="Agent pages">
        <Button
          appearance="subtle"
          icon={<ChevronLeft16Regular />}
          aria-label="Previous page"
          disabled={currentPage === 0}
          onClick={() => onPageChange(currentPage - 1)}
        />
        <TabList
          className={styles.tabs}
          aria-label="Page number"
          selectedValue={String(currentPage)}
          onTabSelect={(_, data) => onPageChange(Number(data.value))}
          size="small"
        >
          {visiblePages.map(page => (
            <Tab key={page} value={String(page)} aria-label={`Page ${page + 1}`}>{page + 1}</Tab>
          ))}
        </TabList>
        {totalPages > 1 && (inputOverflow ? (
          <Popover
            open={jumpOpen}
            trapFocus
            onOpenChange={(_, data) => {
              setJumpOpen(data.open);
              setPageInput(String(currentPage + 1));
              setValidation('');
            }}
            positioning="above"
          >
            <PopoverTrigger disableButtonEnhancement>
              <Button className={overflowClassName} appearance="subtle" icon={<MoreHorizontal16Regular />} aria-label="More pages" />
            </PopoverTrigger>
            <PopoverSurface aria-label="Go to page">
              <form className={styles.jump} onSubmit={jumpToPage}>
                <Field
                  label="Page number"
                  validationState={validation ? 'error' : 'none'}
                  validationMessage={validation || `1-${totalPages}`}
                >
                  <Input
                    className={styles.pageInput}
                    inputMode="numeric"
                    value={pageInput}
                    onChange={(_, data) => {
                      setPageInput(data.value);
                      setValidation('');
                    }}
                  />
                </Field>
                <Button type="submit">Go</Button>
              </form>
            </PopoverSurface>
          </Popover>
        ) : (
          <Menu positioning="above">
            <MenuTrigger disableButtonEnhancement>
              <Button className={overflowClassName} appearance="subtle" icon={<MoreHorizontal16Regular />} aria-label="More pages" />
            </MenuTrigger>
            <MenuPopover>
              <MenuList className={styles.menu}>
                {Array.from({ length: totalPages }, (_, page) => (
                  <MenuItem key={page} disabled={page === currentPage} onClick={() => onPageChange(page)}>
                    Page {page + 1}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        ))}
        <Button
          appearance="subtle"
          icon={<ChevronRight16Regular />}
          aria-label="Next page"
          disabled={currentPage >= totalPages - 1}
          onClick={() => onPageChange(currentPage + 1)}
        />
      </nav>
      <div className={styles.pageSize}>
        <Label htmlFor={sizeId}>Items per page</Label>
        <Dropdown
          id={sizeId}
          className={styles.dropdown}
          value={String(pageSize)}
          selectedOptions={[String(pageSize)]}
          onOptionSelect={(_, data) => onPageSizeChange(Number(data.optionValue))}
        >
          {PAGE_SIZES.map(size => <Option key={size} value={String(size)}>{String(size)}</Option>)}
        </Dropdown>
      </div>
      <span className={styles.live} role="status">
        Page {currentPage + 1} of {totalPages}. {totalRecords} {totalRecords === 1 ? 'agent' : 'agents'}.
      </span>
    </div>
  );
}
