import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
  'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'if', 'when', 'where', 'how',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his',
  'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself',
  'they', 'them', 'their', 'theirs', 'themselves', 'about', 'up',
]);

interface Stats {
  words: number;
  charsWithSpaces: number;
  charsNoSpaces: number;
  sentences: number;
  paragraphs: number;
  readingMin: number;
  readingSec: number;
  speakingMin: number;
  speakingSec: number;
}

interface KeywordEntry {
  word: string;
  count: number;
  percentage: number;
}

function computeStats(text: string): Stats {
  if (!text.trim()) {
    return {
      words: 0, charsWithSpaces: 0, charsNoSpaces: 0,
      sentences: 0, paragraphs: 0,
      readingMin: 0, readingSec: 0, speakingMin: 0, speakingSec: 0,
    };
  }

  const wordsArr = text.split(/\s+/).filter(Boolean);
  const words = wordsArr.length;
  const charsWithSpaces = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;
  const sentences = (text.match(/[.!?]+/g) || []).length || (words > 0 ? 1 : 0);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length || (words > 0 ? 1 : 0);

  const readingTotal = Math.round((words / 200) * 60);
  const readingMin = Math.floor(readingTotal / 60);
  const readingSec = readingTotal % 60;

  const speakingTotal = Math.round((words / 130) * 60);
  const speakingMin = Math.floor(speakingTotal / 60);
  const speakingSec = speakingTotal % 60;

  return {
    words, charsWithSpaces, charsNoSpaces, sentences, paragraphs,
    readingMin, readingSec, speakingMin, speakingSec,
  };
}

function computeKeywords(text: string): KeywordEntry[] {
  const wordsArr = text.toLowerCase().match(/[a-z']+/g);
  if (!wordsArr || wordsArr.length === 0) return [];

  const freq: Record<string, number> = {};
  for (const w of wordsArr) {
    if (STOP_WORDS.has(w) || w.length < 2) continue;
    freq[w] = (freq[w] || 0) + 1;
  }

  const total = wordsArr.length;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({
      word,
      count,
      percentage: Math.round((count / total) * 10000) / 100,
    }));
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function App() {
  const [text, setText] = useState('');
  const [charLimit, setCharLimit] = useState('');
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [keywordsOpen, setKeywordsOpen] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const analyticsRef = useRef(false);

  const debouncedText = useDebounce(text, 150);
  const debouncedTextSlow = useDebounce(text, 300);

  const stats = useMemo(() => computeStats(debouncedText), [debouncedText]);
  const keywords = useMemo(() => computeKeywords(debouncedTextSlow), [debouncedTextSlow]);

  // Track analytics (debounced, not every keystroke)
  useEffect(() => {
    if (debouncedTextSlow && !analyticsRef.current) {
      trackEvent('text_analyzed', { words: String(stats.words) });
      analyticsRef.current = true;
    }
    if (!debouncedTextSlow) {
      analyticsRef.current = false;
    }
  }, [debouncedTextSlow, stats.words]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.max(200, ta.scrollHeight) + 'px';
    }
  }, [text]);

  const handleCopyStats = useCallback(() => {
    const summary = `Words: ${stats.words} | Characters: ${stats.charsWithSpaces} | Sentences: ${stats.sentences} | Reading time: ${stats.readingMin}m ${stats.readingSec}s`;
    navigator.clipboard.writeText(summary).catch(() => {});
  }, [stats]);

  const handleClear = useCallback(() => {
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '200px';
    }
  }, []);

  const limit = parseInt(charLimit);
  const hasLimit = limitEnabled && !isNaN(limit) && limit > 0;
  const remaining = hasLimit ? limit - stats.charsWithSpaces : 0;
  const limitProgress = hasLimit ? Math.min((stats.charsWithSpaces / limit) * 100, 100) : 0;

  return (
    <Layout title="Word Counter">
      <div className={styles.container}>
        <div className={styles.textareaWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder="Start typing or paste your text here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {hasLimit && (
            <div className={styles.limitBar}>
              <div
                className={styles.limitProgress}
                style={{
                  width: `${limitProgress}%`,
                  backgroundColor: limitProgress > 90 ? '#ff3b30' : limitProgress > 75 ? '#ff9500' : 'var(--accent, #0071e3)',
                }}
              />
            </div>
          )}
          {hasLimit && (
            <span className={styles.remaining} style={{ color: remaining < 0 ? '#ff3b30' : 'var(--text-secondary)' }}>
              {remaining} characters remaining
            </span>
          )}
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={handleCopyStats}>
            Copy Stats
          </Button>
          <Button variant="secondary" onClick={handleClear}>
            Clear
          </Button>
          <label className={styles.limitToggle}>
            <input
              type="checkbox"
              checked={limitEnabled}
              onChange={(e) => setLimitEnabled(e.target.checked)}
            />
            <span>Char limit</span>
          </label>
          {limitEnabled && (
            <input
              className={styles.limitInput}
              type="number"
              placeholder="280"
              value={charLimit}
              onChange={(e) => setCharLimit(e.target.value)}
              min="1"
            />
          )}
        </div>

        <div className={styles.statsGrid}>
          <Card>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.words}</span>
              <span className={styles.statLabel}>Words</span>
            </div>
          </Card>
          <Card>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.charsWithSpaces}</span>
              <span className={styles.statLabel}>Characters</span>
            </div>
          </Card>
          <Card>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.charsNoSpaces}</span>
              <span className={styles.statLabel}>Chars (no spaces)</span>
            </div>
          </Card>
          <Card>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.sentences}</span>
              <span className={styles.statLabel}>Sentences</span>
            </div>
          </Card>
          <Card>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.paragraphs}</span>
              <span className={styles.statLabel}>Paragraphs</span>
            </div>
          </Card>
          <Card>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.readingMin}m {stats.readingSec}s</span>
              <span className={styles.statLabel}>Reading Time</span>
            </div>
          </Card>
          <Card>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.speakingMin}m {stats.speakingSec}s</span>
              <span className={styles.statLabel}>Speaking Time</span>
            </div>
          </Card>
        </div>

        <Card>
          <button
            className={styles.collapsibleHeader}
            onClick={() => setKeywordsOpen(!keywordsOpen)}
          >
            <h3 className={styles.heading}>Keyword Density</h3>
            <span className={styles.chevron}>{keywordsOpen ? '▾' : '▸'}</span>
          </button>
          {keywordsOpen && (
            <div className={styles.keywordList}>
              {keywords.length === 0 ? (
                <span className={styles.emptyKeywords}>Start typing to see keyword density</span>
              ) : (
                keywords.map((kw) => (
                  <div key={kw.word} className={styles.keywordRow}>
                    <span className={styles.keywordWord}>{kw.word}</span>
                    <span className={styles.keywordCount}>{kw.count}</span>
                    <span className={styles.keywordPercent}>{kw.percentage}%</span>
                  </div>
                ))
              )}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
