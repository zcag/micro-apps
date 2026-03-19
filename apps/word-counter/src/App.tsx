import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Layout, Card, trackEvent } from '@micro-apps/shared';
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

/** Animated count-up hook */
function useCountUp(target: number, duration = 400): number {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = display;
    const diff = target - start;
    if (Math.abs(diff) < 0.5) {
      setDisplay(target);
      return;
    }

    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

function AnimatedInt({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <>{Math.round(animated)}</>;
}

const STAT_CONFIG = [
  { key: 'words' as const, icon: '📝', label: 'Words', color: '#3b82f6' },
  { key: 'charsWithSpaces' as const, icon: '🔤', label: 'Characters', color: '#8b5cf6' },
  { key: 'sentences' as const, icon: '💬', label: 'Sentences', color: '#22c55e' },
  { key: 'paragraphs' as const, icon: '📄', label: 'Paragraphs', color: '#f59e0b' },
];

export default function App() {
  const [text, setText] = useState('');
  const [charLimit, setCharLimit] = useState('');
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [keywordsOpen, setKeywordsOpen] = useState(true);
  const [copiedStats, setCopiedStats] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const analyticsRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const debouncedText = useDebounce(text, 150);
  const debouncedTextSlow = useDebounce(text, 300);

  const stats = useMemo(() => computeStats(debouncedText), [debouncedText]);
  const keywords = useMemo(() => computeKeywords(debouncedTextSlow), [debouncedTextSlow]);

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
      ta.style.height = Math.max(240, ta.scrollHeight) + 'px';
    }
  }, [text]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    setIsTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setIsTyping(false), 1000);
  }, []);

  const handleCopyStats = useCallback(() => {
    const summary = `Words: ${stats.words} | Characters: ${stats.charsWithSpaces} | Sentences: ${stats.sentences} | Reading time: ${stats.readingMin}m ${stats.readingSec}s`;
    navigator.clipboard.writeText(summary).then(() => {
      setCopiedStats(true);
      setTimeout(() => setCopiedStats(false), 1500);
    }).catch(() => {});
  }, [stats]);

  const handleClear = useCallback(() => {
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '240px';
    }
  }, []);

  const limit = parseInt(charLimit);
  const hasLimit = limitEnabled && !isNaN(limit) && limit > 0;
  const remaining = hasLimit ? limit - stats.charsWithSpaces : 0;
  const limitProgress = hasLimit ? Math.min((stats.charsWithSpaces / limit) * 100, 100) : 0;
  const isOverLimit = hasLimit && remaining < 0;

  const maxKeywordPerc = keywords.length > 0 ? keywords[0].percentage : 0;
  const isEmpty = !text.trim();

  return (
    <Layout title="Word Counter">
      <div className={styles.container}>
        {/* Textarea section */}
        <div className={styles.writerSection}>
          <Card>
            <div className={styles.textareaWrapper}>
              <textarea
                ref={textareaRef}
                className={styles.textarea}
                placeholder="Start typing or paste your text..."
                value={text}
                onChange={handleTextChange}
              />

              {/* Progress bar */}
              {hasLimit && (
                <div className={styles.progressBar}>
                  <div className={styles.progressTrack}>
                    {/* Milestone markers */}
                    <span className={styles.progressMilestone} style={{ left: '25%' }} />
                    <span className={styles.progressMilestone} style={{ left: '50%' }} />
                    <span className={styles.progressMilestone} style={{ left: '75%' }} />
                    <div
                      className={`${styles.progressFill} ${isOverLimit ? styles.progressOverLimit : ''}`}
                      style={{ width: `${Math.min(limitProgress, 100)}%` }}
                    >
                      <span className={styles.progressPercent}>
                        {Math.round(limitProgress)}%
                      </span>
                    </div>
                  </div>
                  <span
                    className={`${styles.progressRemaining} ${isOverLimit ? styles.progressOverLimitText : ''}`}
                  >
                    {remaining >= 0
                      ? `${remaining} characters remaining`
                      : `${Math.abs(remaining)} over limit`}
                  </span>
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className={styles.actionBar}>
              <div className={styles.actionButtons}>
                <button
                  className={`${styles.actionBtn} ${copiedStats ? styles.actionBtnSuccess : ''}`}
                  onClick={handleCopyStats}
                  type="button"
                >
                  <span className={styles.actionBtnIcon}>{copiedStats ? '✓' : '📋'}</span>
                  {copiedStats ? 'Copied!' : 'Copy'}
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={handleClear}
                  type="button"
                  disabled={isEmpty}
                >
                  <span className={styles.actionBtnIcon}>🗑️</span>
                  Clear
                </button>
              </div>

              <div className={styles.limitControls}>
                <label className={styles.limitToggle}>
                  <input
                    type="checkbox"
                    checked={limitEnabled}
                    onChange={(e) => setLimitEnabled(e.target.checked)}
                  />
                  <span className={styles.limitToggleSlider} />
                  <span className={styles.limitToggleLabel}>Limit</span>
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
            </div>
          </Card>
        </div>

        {/* Stats dashboard */}
        <div className={`${styles.statsSection} ${isTyping ? styles.statsSectionDim : ''}`}>
          <div className={styles.statCards}>
            {STAT_CONFIG.map((cfg, i) => (
              <div
                key={cfg.key}
                className={`${styles.statCard} ${isEmpty ? styles.statCardEmpty : ''}`}
                style={{ '--stat-accent': cfg.color, animationDelay: `${i * 0.05}s` } as React.CSSProperties}
              >
                <span className={styles.statIcon}>{cfg.icon}</span>
                <span className={styles.statValue}>
                  <AnimatedInt value={stats[cfg.key]} />
                </span>
                <span className={styles.statLabel}>{cfg.label}</span>
              </div>
            ))}
          </div>

          {/* Reading & speaking time */}
          <div className={styles.timeCards}>
            <div className={`${styles.timeCard} ${isEmpty ? styles.timeCardEmpty : ''}`}>
              <span className={styles.timeIcon}>⏱️</span>
              <div className={styles.timeInfo}>
                <span className={styles.timeValue}>
                  {stats.readingMin}m {stats.readingSec}s
                </span>
                <span className={styles.timeLabel}>Reading Time</span>
              </div>
            </div>
            <div className={`${styles.timeCard} ${isEmpty ? styles.timeCardEmpty : ''}`}>
              <span className={styles.timeIcon}>🎤</span>
              <div className={styles.timeInfo}>
                <span className={styles.timeValue}>
                  {stats.speakingMin}m {stats.speakingSec}s
                </span>
                <span className={styles.timeLabel}>Speaking Time</span>
              </div>
            </div>
          </div>
        </div>

        {/* Keyword density accordion */}
        <Card>
          <button
            className={styles.keywordHeader}
            onClick={() => setKeywordsOpen(!keywordsOpen)}
            type="button"
          >
            <div className={styles.keywordHeaderLeft}>
              <span className={styles.keywordHeaderIcon}>🔑</span>
              <span className={styles.keywordHeaderTitle}>Keyword Density</span>
            </div>
            <span className={`${styles.chevron} ${keywordsOpen ? styles.chevronOpen : ''}`}>
              ›
            </span>
          </button>
          <div className={`${styles.keywordBody} ${keywordsOpen ? styles.keywordBodyOpen : ''}`}>
            <div className={styles.keywordList}>
              {keywords.length === 0 ? (
                <div className={styles.keywordEmpty}>
                  <span className={styles.keywordEmptyIcon}>📊</span>
                  <span>Start typing to see keyword density</span>
                </div>
              ) : (
                keywords.map((kw, i) => {
                  const barWidth = maxKeywordPerc > 0 ? (kw.percentage / maxKeywordPerc) * 100 : 0;
                  const opacity = 1 - (i * 0.06);
                  return (
                    <div key={kw.word} className={styles.keywordRow}>
                      <span className={styles.keywordWord}>{kw.word}</span>
                      <div className={styles.keywordBarTrack}>
                        <div
                          className={styles.keywordBar}
                          style={{
                            width: `${barWidth}%`,
                            opacity,
                          }}
                        />
                      </div>
                      <span className={styles.keywordCount}>{kw.count}</span>
                      <span className={styles.keywordPercent}>{kw.percentage}%</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        {/* Empty state hint */}
        {isEmpty && (
          <div className={styles.emptyHint}>
            <span className={styles.emptyHintIcon}>✍️</span>
            <span className={styles.emptyHintText}>
              Paste or type text above to see real-time stats
            </span>
          </div>
        )}
      </div>
    </Layout>
  );
}
