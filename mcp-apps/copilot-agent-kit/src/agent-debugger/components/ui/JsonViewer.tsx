import {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
  type FC,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from "react";
import { Input, Button, Text, tokens } from "@fluentui/react-components";
import { Search24Regular, ArrowUp24Regular, ArrowDown24Regular, Dismiss24Regular } from "@fluentui/react-icons";
import "./JsonViewer.css";

interface JsonViewerProps {
  data: unknown;
  enableSearch?: boolean;
  jsonText?: string;
  toolbarTitle?: ReactNode;
  toolbarActions?: ReactNode;
  searchPlaceholder?: string;
}

interface SearchResults {
  offsets: number[];
  truncated: boolean;
}

interface JsonCodeProps {
  data: unknown;
  maxHeight?: React.CSSProperties["maxHeight"];
}

const LARGE_DOCUMENT_THRESHOLD = 250_000;
const MAX_SEARCH_MATCHES = 10_000;

/** Compact JSON body that uses the same formatter and token classes as the full viewer. */
export const JsonCode: FC<JsonCodeProps> = ({ data, maxHeight }) => {
  const formattedJson = useMemo(
    () => formatJsonWithSyntaxHighlighting(JSON.stringify(data, null, 2) ?? String(data)),
    [data],
  );

  return (
    <pre
      className="json-content"
      style={{ maxHeight, overflow: "auto" }}
    >
      <code dangerouslySetInnerHTML={{ __html: formattedJson }} />
    </pre>
  );
};

const JsonViewer: FC<JsonViewerProps> = ({
  data,
  enableSearch = false,
  jsonText,
  toolbarTitle,
  toolbarActions,
  searchPlaceholder = "Search in JSON...",
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const contentRef = useRef<HTMLPreElement>(null);

  const plainJson = useMemo(
    () => jsonText ?? JSON.stringify(data, null, 2) ?? String(data),
    [data, jsonText],
  );
  const isLargeDocument = plainJson.length >= LARGE_DOCUMENT_THRESHOLD;

  const formattedJson = useMemo(() => {
    if (isLargeDocument) return "";
    return formatJsonWithSyntaxHighlighting(plainJson);
  }, [plainJson, isLargeDocument]);

  const searchResults = useMemo<SearchResults>(() => {
    if (!searchTerm.trim() || !enableSearch) return { offsets: [], truncated: false };
    return findSearchOffsets(plainJson, searchTerm, MAX_SEARCH_MATCHES);
  }, [enableSearch, plainJson, searchTerm]);

  const highlightedJson = useMemo(() => {
    if (isLargeDocument || !searchTerm.trim() || !enableSearch) {
      return formattedJson;
    }

    let cursor = 0;
    const chunks = searchResults.offsets.map((offset, index) => {
      const before = escapeHtml(plainJson.slice(cursor, offset));
      const match = escapeHtml(plainJson.slice(offset, offset + searchTerm.length));
      cursor = offset + searchTerm.length;
      return `${before}<span class="json-search-match" data-match-index="${index}">${match}</span>`;
    });
    chunks.push(escapeHtml(plainJson.slice(cursor)));
    return chunks.join("");
  }, [formattedJson, searchTerm, enableSearch, isLargeDocument, plainJson, searchResults]);

  const matchCount = searchResults.offsets.length;
  const activeMatchIndex = Math.min(currentMatchIndex, Math.max(0, matchCount - 1));

  useEffect(() => {
    if (isLargeDocument || !contentRef.current || matchCount === 0) return;

    const allMatches = contentRef.current.querySelectorAll('.json-search-match');

    allMatches.forEach(el => el.classList.remove('json-search-current'));

    if (allMatches[activeMatchIndex]) {
      allMatches[activeMatchIndex].classList.add('json-search-current');
      allMatches[activeMatchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeMatchIndex, matchCount, highlightedJson, isLargeDocument]);

  const goToNextMatch = useCallback(() => {
    if (matchCount > 0) {
      setCurrentMatchIndex((prev) => (prev + 1) % matchCount);
    }
  }, [matchCount]);

  const goToPrevMatch = useCallback(() => {
    if (matchCount > 0) {
      setCurrentMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
    }
  }, [matchCount]);

  const clearSearch = useCallback(() => {
    setSearchTerm("");
    setCurrentMatchIndex(0);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        goToPrevMatch();
      } else {
        goToNextMatch();
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      clearSearch();
    }
  }, [goToNextMatch, goToPrevMatch, clearSearch]);

  return (
    <div className="json-viewer">
      {enableSearch && (
        <div
          className={`json-search-bar${toolbarTitle ? " json-dialog-toolbar" : ""}`}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: tokens.colorNeutralBackground3,
            borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
          }}>
          {toolbarTitle ? <h2 className="json-toolbar-title" aria-hidden="true">{toolbarTitle}</h2> : (
            <Search24Regular style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }} />
          )}
          <Input
            aria-label="Search JSON content"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(_, data) => {
              setSearchTerm(data.value);
              setCurrentMatchIndex(0);
            }}
            onKeyDown={handleKeyDown}
            style={{ flex: "1 1 180px", minWidth: 0 }}
            contentAfter={
              searchTerm && (
                <Button
                  appearance="transparent"
                  size="small"
                  icon={<Dismiss24Regular />}
                  onClick={clearSearch}
                  aria-label="Clear search"
                  style={{ marginRight: '-8px' }}
                />
              )
            }
          />
          <span className="json-search-navigation" aria-live="polite" aria-atomic="true">
          {searchTerm && matchCount > 0 && (
            <>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' }}>
                {activeMatchIndex + 1} of {matchCount}
                {searchResults.truncated ? "+" : ""}
              </Text>
              <Button
                appearance="subtle"
                size="small"
                icon={<ArrowUp24Regular />}
                onClick={goToPrevMatch}
                aria-label="Previous match (Shift+Enter)"
              />
              <Button
                appearance="subtle"
                size="small"
                icon={<ArrowDown24Regular />}
                onClick={goToNextMatch}
                aria-label="Next match (Enter)"
              />
            </>
          )}
          {searchTerm && matchCount === 0 && (
            <Text size={200} style={{ color: tokens.colorPaletteRedForeground1, whiteSpace: 'nowrap' }}>
              No matches
            </Text>
          )}
          </span>
          {toolbarActions ? <div className="json-toolbar-actions">{toolbarActions}</div> : null}
        </div>
      )}
      <div className="json-content-wrapper">
        {isLargeDocument ? (
          <LargeJsonDocument
            text={plainJson}
            activeMatchOffset={
              matchCount > 0 ? searchResults.offsets[activeMatchIndex] : undefined
            }
            activeMatchLength={searchTerm.length}
          />
        ) : (
          <pre className="json-content" ref={contentRef}>
            {/* Security: All user content is escaped via escapeHtml() before insertion.
                Only syntax-highlighting <span> tags are injected by formatJsonWithSyntaxHighlighting(). */}
            <code dangerouslySetInnerHTML={{ __html: highlightedJson }} />
          </pre>
        )}
      </div>
    </div>
  );
};

const LARGE_LINE_HEIGHT = 18;
const LARGE_LINE_OVERSCAN = 20;

interface LargeJsonDocumentProps {
  text: string;
  activeMatchOffset?: number;
  activeMatchLength: number;
}

const LargeJsonDocument: FC<LargeJsonDocumentProps> = ({
  text,
  activeMatchOffset,
  activeMatchLength,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const lineStarts = useMemo(() => buildLineStarts(text), [text]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const updateHeight = () => setViewportHeight(wrapper.clientHeight || 400);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (activeMatchOffset === undefined) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const lineIndex = findLineIndex(lineStarts, activeMatchOffset);
    wrapper.scrollTo({
      top: Math.max(0, lineIndex * LARGE_LINE_HEIGHT - wrapper.clientHeight / 2),
      behavior: "auto",
    });
  }, [activeMatchOffset, lineStarts]);

  const visibleStart = Math.max(
    0,
    Math.floor(scrollTop / LARGE_LINE_HEIGHT) - LARGE_LINE_OVERSCAN,
  );
  const visibleEnd = Math.min(
    lineStarts.length,
    Math.ceil((scrollTop + viewportHeight) / LARGE_LINE_HEIGHT) + LARGE_LINE_OVERSCAN,
  );

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const rows: ReactNode[] = [];
  for (let lineIndex = visibleStart; lineIndex < visibleEnd; lineIndex += 1) {
    const lineStart = lineStarts[lineIndex];
    const nextLineStart = lineStarts[lineIndex + 1] ?? text.length;
    const lineEnd =
      nextLineStart > lineStart && text.charCodeAt(nextLineStart - 1) === 10
        ? nextLineStart - 1
        : nextLineStart;
    const line = text.slice(lineStart, lineEnd);
    const activeColumn =
      activeMatchOffset !== undefined &&
      activeMatchOffset >= lineStart &&
      activeMatchOffset < nextLineStart
        ? activeMatchOffset - lineStart
        : undefined;

    rows.push(
      <div className="json-virtual-line" key={lineIndex}>
        <span className="json-virtual-line-text">
          {renderLargeLine(line, activeColumn, activeMatchLength)}
        </span>
      </div>,
    );
  }

  return (
    <div
      className="json-virtual-viewport"
      ref={wrapperRef}
      onScroll={handleScroll}
      role="document"
      aria-label={`JSON document, ${lineStarts.length} lines`}
    >
      <div
        className="json-virtual-spacer"
        style={{ height: lineStarts.length * LARGE_LINE_HEIGHT }}
      >
        <div
          className="json-virtual-lines"
          style={{ transform: `translateY(${visibleStart * LARGE_LINE_HEIGHT}px)` }}
        >
          {rows}
        </div>
      </div>
    </div>
  );
};

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function findLineIndex(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, high);
}

function findSearchOffsets(text: string, searchTerm: string, limit: number): SearchResults {
  const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedSearchTerm, "gi");
  const offsets: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (offsets.length === limit) {
      return { offsets, truncated: true };
    }
    offsets.push(match.index);
    if (match[0].length === 0) regex.lastIndex += 1;
  }

  return { offsets, truncated: false };
}

function renderLargeLine(
  line: string,
  activeColumn: number | undefined,
  activeMatchLength: number,
): ReactNode {
  if (activeColumn === undefined || activeMatchLength <= 0) return line || " ";

  const matchEnd = Math.min(line.length, activeColumn + activeMatchLength);
  return (
    <>
      {line.slice(0, activeColumn)}
      <mark className="json-search-current">
        {line.slice(activeColumn, matchEnd)}
      </mark>
      {line.slice(matchEnd)}
    </>
  );
}

function formatJsonWithSyntaxHighlighting(text: string): string {
  const pattern = /"(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let cursor = 0;
  let html = "";
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const category = token.startsWith('"') ? (token.endsWith(":") ? "key" : "string")
      : token === "null" ? "null" : /^(true|false)$/.test(token) ? "boolean" : "number";
    html += escapeHtml(text.slice(cursor, match.index));
    html += `<span class="json-${category}">${escapeHtml(token)}</span>`;
    cursor = match.index + token.length;
  }
  return html + escapeHtml(text.slice(cursor));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default JsonViewer;
