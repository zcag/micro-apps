import { useState, useCallback, useMemo, useRef } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

type IndentType = '2' | '4' | 'tab';

interface ParseError {
  message: string;
  line: number | null;
}

interface JsonStats {
  keys: number;
  depth: number;
  bytes: number;
}

interface TreeNode {
  key: string;
  value: unknown;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  children?: TreeNode[];
}

const SAMPLE_JSON = JSON.stringify({
  name: "John Doe",
  age: 30,
  isActive: true,
  email: "john@example.com",
  address: {
    street: "123 Main St",
    city: "Springfield",
    state: "IL",
    zip: "62701"
  },
  hobbies: ["reading", "hiking", "coding"],
  scores: [98, 85, 92, 78],
  metadata: {
    createdAt: "2024-01-15T10:30:00Z",
    updatedAt: null,
    tags: ["developer", "designer"],
    settings: {
      theme: "dark",
      notifications: true,
      language: "en"
    }
  }
}, null, 2);

function getIndentString(type: IndentType): string {
  if (type === 'tab') return '\t';
  return ' '.repeat(Number(type));
}

function tryParseJSON(input: string): { parsed: unknown; error: ParseError | null } {
  if (!input.trim()) return { parsed: null, error: null };
  try {
    const parsed = JSON.parse(input);
    return { parsed, error: null };
  } catch (e) {
    const msg = (e as Error).message;
    // Extract line number from error message if available
    const lineMatch = msg.match(/position\s+(\d+)/i);
    let line: number | null = null;
    if (lineMatch) {
      const pos = parseInt(lineMatch[1]);
      line = input.substring(0, pos).split('\n').length;
    }
    return { parsed: null, error: { message: msg, line } };
  }
}

function countKeys(val: unknown): number {
  if (val === null || typeof val !== 'object') return 0;
  if (Array.isArray(val)) {
    return val.reduce((sum: number, item) => sum + countKeys(item), 0);
  }
  const keys = Object.keys(val);
  return keys.length + keys.reduce((sum: number, k) => sum + countKeys((val as Record<string, unknown>)[k]), 0);
}

function getDepth(val: unknown): number {
  if (val === null || typeof val !== 'object') return 0;
  if (Array.isArray(val)) {
    if (val.length === 0) return 1;
    return 1 + Math.max(...val.map(getDepth));
  }
  const values = Object.values(val);
  if (values.length === 0) return 1;
  return 1 + Math.max(...values.map(getDepth));
}

function computeStats(input: string, parsed: unknown): JsonStats {
  return {
    keys: countKeys(parsed),
    depth: getDepth(parsed),
    bytes: new Blob([input]).size,
  };
}

function buildTree(key: string, value: unknown): TreeNode {
  if (value === null) return { key, value, type: 'null' };
  if (typeof value === 'string') return { key, value, type: 'string' };
  if (typeof value === 'number') return { key, value, type: 'number' };
  if (typeof value === 'boolean') return { key, value, type: 'boolean' };
  if (Array.isArray(value)) {
    return {
      key,
      value,
      type: 'array',
      children: value.map((item, i) => buildTree(String(i), item)),
    };
  }
  return {
    key,
    value,
    type: 'object',
    children: Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => buildTree(k, v)
    ),
  };
}

/** Syntax highlight JSON string using spans with CSS classes */
function highlightJSON(json: string): string {
  // Regex to match JSON tokens
  return json.replace(
    /("(?:\\.|[^"\\])*")\s*:/g, // keys
    `<span class="${styles.jsonKey}">$1</span>:`
  ).replace(
    /:\s*("(?:\\.|[^"\\])*")/g, // string values
    `: <span class="${styles.jsonString}">$1</span>`
  ).replace(
    /:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, // numbers
    `: <span class="${styles.jsonNumber}">$1</span>`
  ).replace(
    /:\s*(true|false)/g, // booleans
    `: <span class="${styles.jsonBoolean}">$1</span>`
  ).replace(
    /:\s*(null)/g, // null
    `: <span class="${styles.jsonNull}">$1</span>`
  ).replace(
    // String values in arrays (not after colon)
    /(?<=[\[,]\s*)("(?:\\.|[^"\\])*")(?=\s*[,\]])/g,
    `<span class="${styles.jsonString}">$1</span>`
  ).replace(
    // Numbers in arrays
    /(?<=[\[,]\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s*[,\]])/g,
    `<span class="${styles.jsonNumber}">$1</span>`
  ).replace(
    // Booleans in arrays
    /(?<=[\[,]\s*)(true|false)(?=\s*[,\]])/g,
    `<span class="${styles.jsonBoolean}">$1</span>`
  ).replace(
    // Null in arrays
    /(?<=[\[,]\s*)(null)(?=\s*[,\]])/g,
    `<span class="${styles.jsonNull}">$1</span>`
  );
}

function TreeNodeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isExpandable = node.type === 'object' || node.type === 'array';

  const renderValue = () => {
    switch (node.type) {
      case 'string': return <span className={styles.treeString}>"{String(node.value)}"</span>;
      case 'number': return <span className={styles.treeNumber}>{String(node.value)}</span>;
      case 'boolean': return <span className={styles.treeBoolean}>{String(node.value)}</span>;
      case 'null': return <span className={styles.treeNull}>null</span>;
      case 'array': return <span className={styles.treeBracket}>[{!expanded && `${node.children?.length} items`}]</span>;
      case 'object': return <span className={styles.treeBracket}>{'{'}{!expanded && `${node.children?.length} keys`}{'}'}</span>;
    }
  };

  return (
    <div className={styles.treeNode} style={{ paddingLeft: depth > 0 ? 20 : 0 }}>
      <div
        className={`${styles.treeNodeHeader} ${isExpandable ? styles.treeNodeExpandable : ''}`}
        onClick={isExpandable ? () => setExpanded(!expanded) : undefined}
      >
        {isExpandable && (
          <span className={`${styles.treeChevron} ${expanded ? styles.treeChevronOpen : ''}`}>
            &#9654;
          </span>
        )}
        {!isExpandable && <span className={styles.treeChevronSpacer} />}
        <span className={styles.treeKey}>{node.key}</span>
        <span className={styles.treeColon}>:</span>
        {renderValue()}
      </div>
      {expanded && hasChildren && (
        <div className={styles.treeChildren}>
          {node.children!.map((child, i) => (
            <TreeNodeView key={`${child.key}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [input, setInput] = useState('');
  const [indent, setIndent] = useState<IndentType>('2');
  const [showTree, setShowTree] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const analyticsRef = useRef(false);

  const { parsed, error } = useMemo(() => tryParseJSON(input), [input]);
  const isValid = input.trim().length > 0 && error === null;
  const isEmpty = !input.trim();

  const formatted = useMemo(() => {
    if (!isValid || parsed === undefined) return '';
    const indentStr = indent === 'tab' ? '\t' : Number(indent);
    return JSON.stringify(parsed, null, indentStr);
  }, [parsed, isValid, indent]);

  const highlighted = useMemo(() => {
    if (!formatted) return '';
    return highlightJSON(formatted);
  }, [formatted]);

  const stats = useMemo<JsonStats | null>(() => {
    if (!isValid || parsed === undefined) return null;
    return computeStats(input, parsed);
  }, [input, parsed, isValid]);

  const tree = useMemo<TreeNode | null>(() => {
    if (!isValid || parsed === undefined) return null;
    return buildTree('root', parsed);
  }, [parsed, isValid]);

  // Track first successful parse
  if (isValid && !analyticsRef.current) {
    trackEvent('json_formatted', { bytes: String(stats?.bytes || 0) });
    analyticsRef.current = true;
  }
  if (isEmpty) analyticsRef.current = false;

  const handleFormat = useCallback(() => {
    if (!isValid) return;
    const indentStr = indent === 'tab' ? '\t' : Number(indent);
    setInput(JSON.stringify(parsed, null, indentStr));
  }, [parsed, isValid, indent]);

  const handleMinify = useCallback(() => {
    if (!isValid) return;
    setInput(JSON.stringify(parsed));
  }, [parsed, isValid]);

  const handleCopy = useCallback(() => {
    if (!formatted) return;
    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [formatted]);

  const handleClear = useCallback(() => {
    setInput('');
    setShowTree(false);
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  const handleSample = useCallback(() => {
    setInput(SAMPLE_JSON);
  }, []);

  // Determine error line for highlighting
  const errorLine = error?.line ?? null;
  const inputLines = input.split('\n');

  return (
    <Layout title="JSON Formatter">
      <div className={styles.container}>
        {/* Input section */}
        <div className={styles.editorSection}>
          <Card>
            <div className={styles.editorHeader}>
              <div className={styles.editorTitle}>
                <span className={styles.editorTitleIcon}>{'{ }'}</span>
                <span>Input</span>
              </div>
              <div className={styles.indentSelector}>
                <span className={styles.indentLabel}>Indent:</span>
                {(['2', '4', 'tab'] as IndentType[]).map((opt) => (
                  <button
                    key={opt}
                    className={`${styles.indentOption} ${indent === opt ? styles.indentOptionActive : ''}`}
                    onClick={() => setIndent(opt)}
                    type="button"
                  >
                    {opt === 'tab' ? 'Tab' : `${opt}sp`}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.textareaContainer}>
              {/* Line numbers */}
              <div className={styles.lineNumbers}>
                {(isEmpty ? ['1'] : inputLines).map((_, i) => (
                  <div
                    key={i}
                    className={`${styles.lineNumber} ${errorLine === i + 1 ? styles.lineNumberError : ''}`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                className={`${styles.textarea} ${error ? styles.textareaError : isValid ? styles.textareaValid : ''}`}
                placeholder='Paste or type JSON here...\n\n{\n  "key": "value"\n}'
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
              />
            </div>

            {/* Validation status */}
            {!isEmpty && (
              <div className={`${styles.validationBar} ${error ? styles.validationError : styles.validationSuccess}`}>
                <span className={styles.validationIcon}>{error ? '✕' : '✓'}</span>
                <span className={styles.validationText}>
                  {error
                    ? `Invalid JSON${error.line ? ` (line ${error.line})` : ''}: ${error.message}`
                    : 'Valid JSON'}
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className={styles.actionBar}>
              <div className={styles.actionGroup}>
                <Button variant="gradient" onClick={handleFormat} haptic disabled={!isValid}>
                  Format
                </Button>
                <button
                  className={styles.actionBtn}
                  onClick={handleMinify}
                  type="button"
                  disabled={!isValid}
                >
                  Minify
                </button>
                <button
                  className={`${styles.actionBtn} ${copied ? styles.actionBtnSuccess : ''}`}
                  onClick={handleCopy}
                  type="button"
                  disabled={!isValid}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className={styles.actionGroup}>
                <button className={styles.actionBtn} onClick={handleSample} type="button">
                  Sample
                </button>
                <button className={styles.actionBtn} onClick={handleClear} type="button" disabled={isEmpty}>
                  Clear
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* Stats */}
        {stats && (
          <div className={styles.statsRow}>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.keys}</span>
              <span className={styles.statLabel}>Keys</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.depth}</span>
              <span className={styles.statLabel}>Depth</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>
                {stats.bytes >= 1024
                  ? `${(stats.bytes / 1024).toFixed(1)} KB`
                  : `${stats.bytes} B`}
              </span>
              <span className={styles.statLabel}>Size</span>
            </div>
          </div>
        )}

        {/* View toggle */}
        {isValid && (
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewToggleBtn} ${!showTree ? styles.viewToggleBtnActive : ''}`}
              onClick={() => setShowTree(false)}
              type="button"
            >
              Formatted
            </button>
            <button
              className={`${styles.viewToggleBtn} ${showTree ? styles.viewToggleBtnActive : ''}`}
              onClick={() => setShowTree(true)}
              type="button"
            >
              Tree View
            </button>
          </div>
        )}

        {/* Output section */}
        {isValid && !showTree && (
          <div className={styles.outputSection}>
            <Card>
              <div className={styles.outputHeader}>
                <span className={styles.editorTitleIcon}>{'</>'}</span>
                <span>Output</span>
              </div>
              <pre
                className={styles.output}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            </Card>
          </div>
        )}

        {/* Tree view */}
        {isValid && showTree && tree && (
          <div className={styles.treeSection}>
            <Card>
              <div className={styles.outputHeader}>
                <span className={styles.editorTitleIcon}>🌳</span>
                <span>Tree View</span>
              </div>
              <div className={styles.treeContainer}>
                {tree.children ? (
                  tree.children.map((child, i) => (
                    <TreeNodeView key={`${child.key}-${i}`} node={child} />
                  ))
                ) : (
                  <TreeNodeView node={tree} />
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <Card>
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>{'{ }'}</div>
              <div className={styles.emptyStateText}>Paste or type JSON to format and validate</div>
              <div className={styles.emptyStateHint}>
                syntax highlighting, tree view, stats & more
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
