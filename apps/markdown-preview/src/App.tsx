import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import { marked } from 'marked';
import styles from './App.module.css';

const STORAGE_KEY = 'markdown-preview-doc';

const SAMPLE_MARKDOWN = `# Welcome to Markdown Preview

A **live** editor with *real-time* rendering.

## Features

- Split-pane editing
- Syntax highlighting for code blocks
- Tables, lists, and more
- Export as HTML

### Code Example

\`\`\`javascript
function greet(name) {
  console.log(\`Hello, \${name}!\`);
}

greet('World');
\`\`\`

### Table

| Feature | Status |
|---------|--------|
| Headings | Done |
| Bold/Italic | Done |
| Code blocks | Done |
| Tables | Done |
| Links | Done |

### Links & Images

Visit [GitHub](https://github.com) for more.

> Markdown is a lightweight markup language that you can use to add formatting elements to plaintext text documents.

---

1. First ordered item
2. Second item
3. Third item

That's it! Start editing on the left to see changes on the right.
`;

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Lightweight syntax highlighter for code blocks
function highlightCode(code: string, lang: string): string {
  const keywords: Record<string, string[]> = {
    javascript: ['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'default', 'from', 'new', 'this', 'typeof', 'async', 'await', 'try', 'catch', 'throw'],
    typescript: ['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'default', 'from', 'new', 'this', 'typeof', 'async', 'await', 'try', 'catch', 'throw', 'interface', 'type', 'enum'],
    python: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'raise', 'with', 'yield', 'lambda', 'pass', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is'],
    css: ['color', 'background', 'border', 'margin', 'padding', 'display', 'flex', 'grid', 'position', 'width', 'height'],
    html: ['div', 'span', 'p', 'a', 'img', 'h1', 'h2', 'h3', 'ul', 'li', 'table', 'body', 'head', 'html', 'script', 'style'],
  };

  const resolvedLang = lang.toLowerCase();
  const langKeywords = keywords[resolvedLang] || keywords['javascript'] || [];

  let escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Highlight strings
  escaped = escaped.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, `<span class="${styles.hlString}">$&</span>`);
  // Highlight comments
  escaped = escaped.replace(/(\/\/.*$)/gm, `<span class="${styles.hlComment}">$1</span>`);
  escaped = escaped.replace(/(#.*$)/gm, `<span class="${styles.hlComment}">$1</span>`);
  // Highlight numbers
  escaped = escaped.replace(/\b(\d+(?:\.\d+)?)\b/g, `<span class="${styles.hlNumber}">$1</span>`);
  // Highlight keywords
  if (langKeywords.length > 0) {
    const kwRegex = new RegExp(`\\b(${langKeywords.join('|')})\\b`, 'g');
    escaped = escaped.replace(kwRegex, `<span class="${styles.hlKeyword}">$1</span>`);
  }

  return escaped;
}

// Custom renderer for syntax highlighting
const renderer = new marked.Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang || '';
  const highlighted = highlightCode(text, language);
  const langLabel = language ? `<span class="${styles.codeLang}">${language}</span>` : '';
  return `<div class="${styles.codeBlock}">${langLabel}<pre><code>${highlighted}</code></pre></div>`;
};

function computeStats(text: string): { words: number; chars: number } {
  const trimmed = text.trim();
  if (!trimmed) return { words: 0, chars: 0 };
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  return { words, chars };
}

export default function App() {
  const [markdown, setMarkdown] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved || SAMPLE_MARKDOWN;
    } catch {
      return SAMPLE_MARKDOWN;
    }
  });
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const analyticsRef = useRef(false);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, markdown);
    } catch { /* quota exceeded */ }
  }, [markdown]);

  const renderedHtml = useMemo(() => {
    try {
      return marked.parse(markdown, { renderer }) as string;
    } catch {
      return '<p>Error rendering markdown</p>';
    }
  }, [markdown]);

  const stats = useMemo(() => computeStats(markdown), [markdown]);

  // Track first meaningful edit
  useEffect(() => {
    if (stats.words > 5 && !analyticsRef.current) {
      trackEvent('markdown_edited', { words: String(stats.words) });
      analyticsRef.current = true;
    }
  }, [stats.words]);

  const handleCopyMarkdown = useCallback(() => {
    navigator.clipboard.writeText(markdown).then(() => {
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 1500);
    }).catch(() => {});
  }, [markdown]);

  const handleCopyHtml = useCallback(() => {
    const cleanHtml = marked.parse(markdown) as string;
    navigator.clipboard.writeText(cleanHtml).then(() => {
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 1500);
    }).catch(() => {});
  }, [markdown]);

  const handleExportHtml = useCallback(() => {
    const cleanHtml = marked.parse(markdown) as string;
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Export</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #1a1a1a; }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
    code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #1e1e2e; color: #cdd6f4; padding: 16px; border-radius: 8px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #8b5cf6; padding-left: 16px; color: #666; margin: 16px 0; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    a { color: #8b5cf6; }
  </style>
</head>
<body>
${cleanHtml}
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'markdown-export.html';
    a.click();
    URL.revokeObjectURL(url);
    trackEvent('markdown_exported', { format: 'html' });
  }, [markdown]);

  const handleClear = useCallback(() => {
    setMarkdown('');
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  const handleSample = useCallback(() => {
    setMarkdown(SAMPLE_MARKDOWN);
  }, []);

  const isEmpty = !markdown.trim();

  return (
    <Layout title="Markdown Preview">
      <div className={styles.container}>
        {/* Action bar */}
        <div className={styles.actionBar}>
          <div className={styles.actionGroup}>
            <Button variant="gradient" onClick={handleExportHtml} haptic disabled={isEmpty}>
              Export HTML
            </Button>
            <button
              className={`${styles.actionBtn} ${copiedMd ? styles.actionBtnSuccess : ''}`}
              onClick={handleCopyMarkdown}
              type="button"
              disabled={isEmpty}
            >
              {copiedMd ? '✓ Copied' : 'Copy MD'}
            </button>
            <button
              className={`${styles.actionBtn} ${copiedHtml ? styles.actionBtnSuccess : ''}`}
              onClick={handleCopyHtml}
              type="button"
              disabled={isEmpty}
            >
              {copiedHtml ? '✓ Copied' : 'Copy HTML'}
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

        {/* Mobile tab toggle */}
        <div className={styles.mobileToggle}>
          <button
            className={`${styles.mobileToggleBtn} ${activeTab === 'editor' ? styles.mobileToggleBtnActive : ''}`}
            onClick={() => setActiveTab('editor')}
            type="button"
          >
            Editor
          </button>
          <button
            className={`${styles.mobileToggleBtn} ${activeTab === 'preview' ? styles.mobileToggleBtnActive : ''}`}
            onClick={() => setActiveTab('preview')}
            type="button"
          >
            Preview
          </button>
        </div>

        {/* Split pane */}
        <div className={styles.splitPane}>
          {/* Editor pane */}
          <div className={`${styles.pane} ${styles.editorPane} ${activeTab === 'preview' ? styles.paneHiddenMobile : ''}`}>
            <Card>
              <div className={styles.paneHeader}>
                <div className={styles.paneTitle}>
                  <span className={styles.paneTitleIcon}>✏️</span>
                  <span>Editor</span>
                </div>
              </div>
              <textarea
                ref={textareaRef}
                className={styles.editor}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                placeholder="Type your Markdown here..."
                spellCheck={false}
              />
            </Card>
          </div>

          {/* Preview pane */}
          <div className={`${styles.pane} ${styles.previewPane} ${activeTab === 'editor' ? styles.paneHiddenMobile : ''}`}>
            <Card>
              <div className={styles.paneHeader}>
                <div className={styles.paneTitle}>
                  <span className={styles.paneTitleIcon}>👁️</span>
                  <span>Preview</span>
                </div>
              </div>
              {isEmpty ? (
                <div className={styles.emptyPreview}>
                  <div className={styles.emptyPreviewIcon}>📝</div>
                  <div className={styles.emptyPreviewText}>Start typing to see the preview</div>
                </div>
              ) : (
                <div
                  className={styles.preview}
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              )}
            </Card>
          </div>
        </div>

        {/* Status bar */}
        <div className={styles.statusBar}>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Words</span>
            <span className={styles.statusValue}>{stats.words}</span>
          </div>
          <div className={styles.statusDivider} />
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Characters</span>
            <span className={styles.statusValue}>{stats.chars}</span>
          </div>
          <div className={styles.statusDivider} />
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Lines</span>
            <span className={styles.statusValue}>{markdown.split('\n').length}</span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
