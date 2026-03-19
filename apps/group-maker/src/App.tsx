import { useState, useEffect, useRef } from 'react';
import {
  Layout,
  Card,
  Input,
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

export default function App() {
  const shared = decodeShareHash(window.location.hash);

  const [namesRaw, setNamesRaw] = useState(shared?.namesRaw ?? '');
  const [groupCount, setGroupCount] = useState(shared?.groupCount?.toString() ?? '2');
  const [groups, setGroups] = useState<Group[]>([]);
  const [warning, setWarning] = useState('');
  const [validation, setValidation] = useState('');
  const [copied, setCopied] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

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
          }, i * 80)
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
    const count = countOverride ?? parseInt(groupCount);

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
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const handleShareLink = () => {
    const count = parseInt(groupCount);
    if (isNaN(count)) return;
    const url = window.location.origin + window.location.pathname + encodeShareHash(namesRaw, count);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <Layout title="Random Group Maker">
      <div className={styles.container}>
        <Card>
          <div className={styles.section}>
            <label className={styles.textareaLabel}>Names (one per line, or comma-separated)</label>
            <textarea
              className={styles.textarea}
              placeholder={'Alice\nBob\nCharlie\nDiana\nEve'}
              value={namesRaw}
              onChange={(e) => setNamesRaw(e.target.value)}
            />
          </div>

          <div className={styles.inputRow}>
            <Input
              label="Number of Groups"
              type="number"
              inputMode="numeric"
              min="2"
              value={groupCount}
              onChange={(e) => setGroupCount(e.target.value)}
            />
          </div>

          {validation && <div className={styles.validation}>{validation}</div>}
          {warning && <div className={styles.warning}>{warning}</div>}

          <div className={styles.buttons}>
            <Button onClick={() => handleGenerate()} haptic>
              Make Groups
            </Button>
            {groups.length > 0 && (
              <Button variant="secondary" onClick={handleReshuffle} haptic>
                Re-shuffle
              </Button>
            )}
          </div>
        </Card>

        {groups.length > 0 && (
          <>
            <div className={styles.groupsGrid}>
              {groups.map((group, i) => (
                <div
                  key={`${animKey}-${i}`}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  className={styles.groupCard}
                >
                  <Card>
                    <div className={styles.groupHeader}>Group {group.number}</div>
                    {group.names.map((name, j) => (
                      <div key={j} className={styles.groupName}>
                        {name}
                      </div>
                    ))}
                  </Card>
                </div>
              ))}
            </div>

            <div className={styles.copyBtn}>
              <div className={styles.buttons}>
                <Button variant="secondary" onClick={handleCopyAll}>
                  {copied ? 'Copied!' : 'Copy All Results'}
                </Button>
                <Button variant="secondary" onClick={handleShareLink}>
                  Share Link
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
