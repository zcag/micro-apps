import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Layout,
  Card,
  Button,
  trackEvent,
} from '@micro-apps/shared';
import styles from './App.module.css';

interface Group {
  number: number;
  names: string[];
}

function parseNames(raw: string): string[] {
  // Detect separator: if any comma exists, split by comma; otherwise by newline
  const separator = raw.includes(',') ? ',' : '\n';
  return raw
    .split(separator)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function makeGroups(names: string[], groupCount: number): Group[] {
  const shuffled = fisherYatesShuffle(names);
  const groups: Group[] = Array.from({ length: groupCount }, (_, i) => ({
    number: i + 1,
    names: [],
  }));
  shuffled.forEach((name, i) => {
    groups[i % groupCount].names.push(name);
  });
  return groups;
}

function encodeShareHash(namesRaw: string, groupCount: number): string {
  return '#' + encodeURIComponent(JSON.stringify({ n: namesRaw, g: groupCount }));
}

function decodeShareHash(hash: string): { namesRaw: string; groupCount: number } | null {
  try {
    if (!hash || hash.length < 2) return null;
    const data = JSON.parse(decodeURIComponent(hash.slice(1)));
    if (typeof data.n === 'string' && typeof data.g === 'number') {
      return { namesRaw: data.n, groupCount: data.g };
    }
    return null;
  } catch {
    return null;
  }
}

function formatGroupsText(groups: Group[]): string {
  return groups
    .map((g) => `Group ${g.number}:\n${g.names.map((n) => `  - ${n}`).join('\n')}`)
    .join('\n\n');
}

const PRESET_COUNTS = [2, 3, 4, 5, 6];
const COLOR_COUNT = 8;

export default function App() {
  const shared = decodeShareHash(window.location.hash);

  const [namesRaw, setNamesRaw] = useState(shared?.namesRaw ?? '');
  const [groupCount, setGroupCount] = useState(shared?.groupCount ?? 2);
  const [customCount, setCustomCount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [warning, setWarning] = useState('');
  const [validation, setValidation] = useState('');
  const [copied, setCopied] = useState<'copy' | 'share' | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const parsedNames = useMemo(() => parseNames(namesRaw), [namesRaw]);

  // Initialize custom state from shared link
  useEffect(() => {
    if (shared && !PRESET_COUNTS.includes(shared.groupCount)) {
      setIsCustom(true);
      setCustomCount(String(shared.groupCount));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate group cards on appear
  useEffect(() => {
    if (groups.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    groups.forEach((_, i) => {
      const el = cardRefs.current[i];
      if (el) {
        el.classList.add(styles.groupCardEnter);
        el.classList.remove(styles.groupCardVisible);
        timers.push(
          setTimeout(() => {
            el.classList.remove(styles.groupCardEnter);
            el.classList.add(styles.groupCardVisible);
          }, i * 100)
        );
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [groups, animKey]);

  // Auto-generate from share link on mount
  useEffect(() => {
    if (shared) {
      handleGenerate(shared.namesRaw, shared.groupCount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGenerate(rawOverride?: string, countOverride?: number) {
    const raw = rawOverride ?? namesRaw;
    const count = countOverride ?? groupCount;

    setWarning('');
    setValidation('');

    const names = parseNames(raw);
    if (names.length === 0) {
      setValidation('Please enter at least one name.');
      setGroups([]);
      return;
    }
    if (isNaN(count) || count < 2) {
      setValidation('Number of groups must be at least 2.');
      setGroups([]);
      return;
    }

    if (names.length < count) {
      setWarning(`Only ${names.length} name(s) for ${count} groups — some groups will be empty.`);
    }

    const effectiveCount = Math.min(count, names.length);
    const result = makeGroups(names, effectiveCount);
    setGroups(result);
    setAnimKey((k) => k + 1);
    trackEvent('generate_groups', {
      names: String(names.length),
      groups: String(effectiveCount),
    });
  }

  const handleReshuffle = () => {
    handleGenerate();
  };

  const handleCopyAll = () => {
    if (groups.length === 0) return;
    navigator.clipboard.writeText(formatGroupsText(groups)).then(() => {
      setCopied('copy');
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  };

  const handleShareLink = () => {
    if (isNaN(groupCount)) return;
    const url = window.location.origin + window.location.pathname + encodeShareHash(namesRaw, groupCount);
    navigator.clipboard.writeText(url).then(() => {
      setCopied('share');
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  };

  const handleRemoveName = (index: number) => {
    const names = parseNames(namesRaw);
    names.splice(index, 1);
    const separator = namesRaw.includes(',') ? ', ' : '\n';
    setNamesRaw(names.join(separator));
  };

  const handleSelectCount = (count: number) => {
    setIsCustom(false);
    setGroupCount(count);
    setCustomCount('');
  };

  const handleCustomCountChange = (val: string) => {
    setCustomCount(val);
    setIsCustom(true);
    const num = parseInt(val);
    if (!isNaN(num) && num >= 2) {
      setGroupCount(num);
    }
  };

  return (
    <Layout title="Random Group Maker">
      <div className={styles.container}>
        <Card>
          {/* Names Input */}
          <div className={styles.section}>
            <div className={styles.textareaHeader}>
              <label className={styles.textareaLabel}>Names</label>
              {parsedNames.length > 0 && (
                <span className={styles.nameBadge}>
                  {parsedNames.length} {parsedNames.length === 1 ? 'name' : 'names'}
                </span>
              )}
            </div>
            <textarea
              className={styles.textarea}
              placeholder={'Alice\nBob\nCharlie\nDiana\nEve\nFrank'}
              value={namesRaw}
              onChange={(e) => setNamesRaw(e.target.value)}
            />
            {parsedNames.length > 0 && (
              <div className={styles.nameChips}>
                {parsedNames.map((name, i) => (
                  <span key={`${name}-${i}`} className={styles.nameChip}>
                    {name}
                    <button
                      className={styles.chipRemove}
                      onClick={() => handleRemoveName(i)}
                      aria-label={`Remove ${name}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Group Count Selector */}
          <div className={styles.groupCountSection}>
            <label className={styles.groupCountLabel}>Number of Groups</label>
            <div className={styles.groupCountPills}>
              {PRESET_COUNTS.map((n) => (
                <button
                  key={n}
                  className={`${styles.groupCountPill} ${!isCustom && groupCount === n ? styles.groupCountPillActive : ''}`}
                  onClick={() => handleSelectCount(n)}
                >
                  {n}
                </button>
              ))}
              <div className={styles.customCountWrapper}>
                <input
                  type="number"
                  min="2"
                  placeholder="..."
                  className={`${styles.customCountInput} ${isCustom ? styles.customCountInputActive : ''}`}
                  value={customCount}
                  onChange={(e) => handleCustomCountChange(e.target.value)}
                  onFocus={() => {
                    if (!isCustom) {
                      setIsCustom(true);
                    }
                  }}
                  inputMode="numeric"
                />
              </div>
            </div>
          </div>

          {validation && <div className={styles.validation}>{validation}</div>}
          {warning && <div className={styles.warning}>{warning}</div>}

          <div className={styles.buttons}>
            <Button variant="gradient" onClick={() => handleGenerate()} haptic>
              Shuffle & Make Groups
            </Button>
            {groups.length > 0 && (
              <Button variant="secondary" onClick={handleReshuffle} haptic>
                Re-shuffle
              </Button>
            )}
          </div>
        </Card>

        {/* Empty State */}
        {groups.length === 0 && parsedNames.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🎲</div>
            <div className={styles.emptyTitle}>Ready to shuffle?</div>
            <div className={styles.emptyHint}>Add names above and hit shuffle to create random groups</div>
          </div>
        )}

        {/* Groups Display */}
        {groups.length > 0 && (
          <>
            <div className={styles.groupsGrid}>
              {groups.map((group, i) => (
                <div
                  key={`${animKey}-${i}`}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  className={`${styles.groupCard} ${styles[`groupColor${i % COLOR_COUNT}`]}`}
                >
                  <div className={styles.groupCardInner}>
                    <div className={styles.groupHeader}>
                      <span className={styles.groupBadge}>{group.number}</span>
                      Group {group.number}
                    </div>
                    <div className={styles.groupBody}>
                      {group.names.map((name, j) => (
                        <div key={j} className={styles.groupName}>
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Bar */}
            <div className={styles.actionBar}>
              <button
                className={`${styles.actionBtn} ${copied === 'copy' ? styles.actionBtnSuccess : ''}`}
                onClick={handleCopyAll}
              >
                <span className={styles.actionBtnIcon}>{copied === 'copy' ? '\u2713' : '\u2398'}</span>
                {copied === 'copy' ? 'Copied!' : 'Copy Results'}
              </button>
              <button
                className={`${styles.actionBtn} ${copied === 'share' ? styles.actionBtnSuccess : ''}`}
                onClick={handleShareLink}
              >
                <span className={styles.actionBtnIcon}>{copied === 'share' ? '\u2713' : '\u{1F517}'}</span>
                {copied === 'share' ? 'Link Copied!' : 'Share Link'}
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
