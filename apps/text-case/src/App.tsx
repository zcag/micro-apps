import { useState, useCallback, useMemo } from 'react';
import { Layout, Card, trackEvent } from '@micro-apps/shared';
import { CONVERSIONS, countWords, countCharacters } from './converters';
import styles from './App.module.css';

export default function App() {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const wordCount = useMemo(() => countWords(input), [input]);
  const charCount = useMemo(() => countCharacters(input), [input]);

  const handleCopy = useCallback(
    (id: string, text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
        trackEvent('text_case_copy', { conversion: id });
      });
    },
    []
  );

  const handleClear = useCallback(() => {
    setInput('');
  }, []);

  return (
    <Layout title="Text Case Converter">
      <div className={styles.container}>
        {/* Input Area */}
        <Card hoverable={false}>
          <div className={styles.inputSection}>
            <div className={styles.inputHeader}>
              <span className={styles.inputLabel}>Input Text</span>
              {input && (
                <button className={styles.clearBtn} onClick={handleClear}>
                  Clear
                </button>
              )}
            </div>
            <textarea
              className={styles.textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type or paste your text here..."
              rows={4}
              autoFocus
            />
            <div className={styles.stats}>
              <span className={styles.stat}>{charCount} characters</span>
              <span className={styles.statDivider}>|</span>
              <span className={styles.stat}>{wordCount} words</span>
            </div>
          </div>
        </Card>

        {/* Conversion Grid */}
        {input.trim() && (
          <div className={styles.grid}>
            {CONVERSIONS.map((conv) => {
              const result = conv.fn(input);
              const isCopied = copiedId === conv.id;

              return (
                <button
                  key={conv.id}
                  className={`${styles.convCard} ${isCopied ? styles.convCopied : ''}`}
                  onClick={() => handleCopy(conv.id, result)}
                  title={`Copy ${conv.label}`}
                >
                  <div className={styles.convHeader}>
                    <span className={styles.convLabel}>{conv.label}</span>
                    <span className={styles.convCopyIcon}>
                      {isCopied ? '\u2713' : '\u{1F4CB}'}
                    </span>
                  </div>
                  <div className={styles.convPreview}>{result}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Empty state when no input */}
        {!input.trim() && (
          <Card>
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>Aa</div>
              <p className={styles.emptyText}>
                Enter some text above to see it converted to different cases
              </p>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
