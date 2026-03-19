import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

type Perms = [boolean, boolean, boolean]; // read, write, execute

interface PermState {
  owner: Perms;
  group: Perms;
  others: Perms;
  setuid: boolean;
  setgid: boolean;
  sticky: boolean;
  isDirectory: boolean;
}

const STORAGE_KEY = 'chmod-calc-state';

const PRESETS: { octal: string; name: string }[] = [
  { octal: '644', name: 'File default' },
  { octal: '755', name: 'Dir default' },
  { octal: '600', name: 'Private' },
  { octal: '777', name: 'Full access' },
  { octal: '400', name: 'Read-only' },
  { octal: '700', name: 'Owner only' },
  { octal: '664', name: 'Group write' },
  { octal: '750', name: 'Group read' },
  { octal: '4755', name: 'Setuid' },
  { octal: '2755', name: 'Setgid' },
  { octal: '1777', name: 'Sticky' },
];

const ENTITIES = ['owner', 'group', 'others'] as const;
const PERM_LABELS = ['Read', 'Write', 'Execute'] as const;
const PERM_CHARS = ['r', 'w', 'x'] as const;

function permsToBits(p: Perms): number {
  return (p[0] ? 4 : 0) + (p[1] ? 2 : 0) + (p[2] ? 1 : 0);
}

function bitsToPerms(n: number): Perms {
  return [(n & 4) !== 0, (n & 2) !== 0, (n & 1) !== 0];
}

function stateToOctal(s: PermState): string {
  const special = (s.setuid ? 4 : 0) + (s.setgid ? 2 : 0) + (s.sticky ? 1 : 0);
  const o = permsToBits(s.owner);
  const g = permsToBits(s.group);
  const ot = permsToBits(s.others);
  if (special > 0) return `${special}${o}${g}${ot}`;
  return `${o}${g}${ot}`;
}

function stateToSymbolic(s: PermState): string {
  const type = s.isDirectory ? 'd' : '-';
  const build = (p: Perms, setBit: boolean, setChar: string, upperSetChar: string) => {
    const r = p[0] ? 'r' : '-';
    const w = p[1] ? 'w' : '-';
    let x: string;
    if (setBit) {
      x = p[2] ? setChar : upperSetChar;
    } else {
      x = p[2] ? 'x' : '-';
    }
    return r + w + x;
  };
  return (
    type +
    build(s.owner, s.setuid, 's', 'S') +
    build(s.group, s.setgid, 's', 'S') +
    build(s.others, s.sticky, 't', 'T')
  );
}

function octalToState(octal: string, isDirectory: boolean): PermState | null {
  const cleaned = octal.replace(/\s/g, '');
  if (!/^[0-7]{3,4}$/.test(cleaned)) return null;
  const digits = cleaned.split('').map(Number);
  if (digits.length === 3) {
    return {
      owner: bitsToPerms(digits[0]),
      group: bitsToPerms(digits[1]),
      others: bitsToPerms(digits[2]),
      setuid: false,
      setgid: false,
      sticky: false,
      isDirectory,
    };
  }
  return {
    owner: bitsToPerms(digits[1]),
    group: bitsToPerms(digits[2]),
    others: bitsToPerms(digits[3]),
    setuid: (digits[0] & 4) !== 0,
    setgid: (digits[0] & 2) !== 0,
    sticky: (digits[0] & 1) !== 0,
    isDirectory,
  };
}

function symbolicToState(symbolic: string, isDirectory: boolean): PermState | null {
  const cleaned = symbolic.trim();
  if (!/^[dlcbps-][rwxsStT-]{9}$/.test(cleaned)) return null;
  const s = cleaned;
  const dir = s[0] === 'd';
  const owner: Perms = [s[1] === 'r', s[2] === 'w', s[3] === 'x' || s[3] === 's'];
  const group: Perms = [s[4] === 'r', s[5] === 'w', s[6] === 'x' || s[6] === 's'];
  const others: Perms = [s[7] === 'r', s[8] === 'w', s[9] === 'x' || s[9] === 't'];
  return {
    owner,
    group,
    others,
    setuid: s[3] === 's' || s[3] === 'S',
    setgid: s[6] === 's' || s[6] === 'S',
    sticky: s[9] === 't' || s[9] === 'T',
    isDirectory: dir || isDirectory,
  };
}

function parseLsOutput(input: string): PermState | null {
  const match = input.trim().match(/^([dlcbps-][rwxsStT-]{9})/);
  if (!match) return null;
  return symbolicToState(match[1], match[1][0] === 'd');
}

function loadState(): PermState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {
    owner: [true, true, false],
    group: [true, false, false],
    others: [true, false, false],
    setuid: false,
    setgid: false,
    sticky: false,
    isDirectory: false,
  };
}

export default function App() {
  const [state, setState] = useState<PermState>(loadState);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [lookupInput, setLookupInput] = useState('');
  const [octalInput, setOctalInput] = useState('');
  const [symbolicInput, setSymbolicInput] = useState('');
  const [editingOctal, setEditingOctal] = useState(false);
  const [editingSymbolic, setEditingSymbolic] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const octal = useMemo(() => stateToOctal(state), [state]);
  const symbolic = useMemo(() => stateToSymbolic(state), [state]);
  const chmodCmd = useMemo(() => `chmod ${octal} <file>`, [octal]);

  const togglePerm = useCallback((entity: typeof ENTITIES[number], index: number) => {
    setState(prev => {
      const perms = [...prev[entity]] as Perms;
      perms[index] = !perms[index];
      return { ...prev, [entity]: perms };
    });
    trackEvent('chmod_toggle_perm', { entity, perm: PERM_CHARS[index] });
  }, []);

  const toggleSpecial = useCallback((bit: 'setuid' | 'setgid' | 'sticky') => {
    setState(prev => ({ ...prev, [bit]: !prev[bit] }));
    trackEvent('chmod_toggle_special', { bit });
  }, []);

  const applyPreset = useCallback((octalStr: string) => {
    const parsed = octalToState(octalStr, state.isDirectory);
    if (parsed) setState(parsed);
    trackEvent('chmod_preset', { octal: octalStr });
  }, [state.isDirectory]);

  const handleOctalEdit = useCallback((val: string) => {
    setOctalInput(val);
    const parsed = octalToState(val, state.isDirectory);
    if (parsed) setState(parsed);
  }, [state.isDirectory]);

  const handleSymbolicEdit = useCallback((val: string) => {
    setSymbolicInput(val);
    const parsed = symbolicToState(val, state.isDirectory);
    if (parsed) setState(parsed);
  }, [state.isDirectory]);

  const handleLookup = useCallback((val: string) => {
    setLookupInput(val);
    const parsed = parseLsOutput(val);
    if (parsed) setState(parsed);
  }, []);

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
    trackEvent('chmod_copy', { field });
  }, []);

  const explanation = useMemo(() => {
    const context = state.isDirectory ? 'directory' : 'file';
    const descPerm = (p: Perms, entity: string) => {
      const parts: string[] = [];
      if (p[0]) parts.push('read');
      if (p[1]) parts.push('write');
      if (p[2]) parts.push(state.isDirectory ? 'access (enter/list)' : 'execute');
      if (parts.length === 0) return `${entity} has no permissions`;
      return `${entity} can ${parts.join(', ')}`;
    };
    const lines = [
      { entity: 'Owner', text: descPerm(state.owner, 'Owner') },
      { entity: 'Group', text: descPerm(state.group, 'Group') },
      { entity: 'Others', text: descPerm(state.others, 'Others') },
    ];
    if (state.setuid) lines.push({ entity: 'Special', text: `Setuid: ${context === 'file' ? 'runs as file owner' : 'no effect on directories'}` });
    if (state.setgid) lines.push({ entity: 'Special', text: `Setgid: ${context === 'directory' ? 'new files inherit group' : 'runs as file group'}` });
    if (state.sticky) lines.push({ entity: 'Special', text: `Sticky: ${context === 'directory' ? 'only owner can delete files' : 'no common effect'}` });
    return lines;
  }, [state]);

  const currentPreset = useMemo(() => {
    return PRESETS.find(p => p.octal === octal);
  }, [octal]);

  return (
    <Layout title="Chmod Calculator">
      <div className={styles.container}>
        {/* Presets */}
        <Card hoverable={false}>
          <div className={styles.sectionTitle}>Presets</div>
          <div className={styles.presets}>
            {PRESETS.map(p => (
              <button
                key={p.octal}
                className={`${styles.presetBtn} ${currentPreset?.octal === p.octal ? styles.presetActive : ''}`}
                onClick={() => applyPreset(p.octal)}
              >
                <span className={styles.presetOctal}>{p.octal}</span>
                <span className={styles.presetName}>{p.name}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Permission Grid */}
        <Card hoverable={false}>
          <div className={styles.sectionTitle}>Permissions</div>
          <div className={styles.permissionGrid}>
            {/* Header */}
            <div className={styles.gridHeader} />
            {PERM_LABELS.map(l => (
              <div key={l} className={styles.gridHeader}>{l}</div>
            ))}
            {/* Rows */}
            {ENTITIES.map(entity => (
              <>
                <div key={`${entity}-label`} className={styles.gridRowLabel}>
                  {entity.charAt(0).toUpperCase() + entity.slice(1)}
                </div>
                {[0, 1, 2].map(i => (
                  <div
                    key={`${entity}-${i}`}
                    className={styles.gridCell}
                    onClick={() => togglePerm(entity, i)}
                  >
                    <div className={`${styles.permToggle} ${state[entity][i] ? styles.permGranted : styles.permDenied}`}>
                      {PERM_CHARS[i]}
                    </div>
                  </div>
                ))}
              </>
            ))}
          </div>
        </Card>

        {/* Special Permissions */}
        <Card hoverable={false}>
          <div className={styles.sectionTitle}>Special Permissions</div>
          <div className={styles.specialGrid}>
            <div
              className={`${styles.specialCell} ${state.setuid ? styles.specialActive : ''}`}
              onClick={() => toggleSpecial('setuid')}
            >
              <div className={styles.specialDot} />
              <div>
                <div className={styles.specialLabel}>Setuid</div>
                <div className={styles.specialDesc}>Run as owner</div>
              </div>
            </div>
            <div
              className={`${styles.specialCell} ${state.setgid ? styles.specialActive : ''}`}
              onClick={() => toggleSpecial('setgid')}
            >
              <div className={styles.specialDot} />
              <div>
                <div className={styles.specialLabel}>Setgid</div>
                <div className={styles.specialDesc}>Inherit group</div>
              </div>
            </div>
            <div
              className={`${styles.specialCell} ${state.sticky ? styles.specialActive : ''}`}
              onClick={() => toggleSpecial('sticky')}
            >
              <div className={styles.specialDot} />
              <div>
                <div className={styles.specialLabel}>Sticky</div>
                <div className={styles.specialDesc}>Restrict delete</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Representations */}
        <Card hoverable={false}>
          <div className={styles.sectionTitle}>Output</div>
          <div className={styles.representations}>
            <div className={styles.repCard}>
              <div className={styles.repLabel}>Octal</div>
              <input
                className={styles.repValue}
                value={editingOctal ? octalInput : octal}
                onFocus={() => { setEditingOctal(true); setOctalInput(octal); }}
                onBlur={() => setEditingOctal(false)}
                onChange={e => handleOctalEdit(e.target.value)}
                maxLength={4}
                inputMode="numeric"
              />
            </div>
            <div className={styles.repCard}>
              <div className={styles.repLabel}>Symbolic</div>
              <input
                className={styles.repValue}
                value={editingSymbolic ? symbolicInput : symbolic}
                onFocus={() => { setEditingSymbolic(true); setSymbolicInput(symbolic); }}
                onBlur={() => setEditingSymbolic(false)}
                onChange={e => handleSymbolicEdit(e.target.value)}
                maxLength={10}
                spellCheck={false}
              />
            </div>
            <div className={`${styles.repCard} ${styles.repFull}`}>
              <div className={styles.repLabel}>Command</div>
              <div className={styles.commandOutput}>{chmodCmd}</div>
            </div>
          </div>
          <div className={styles.copyRow}>
            <button
              className={`${styles.copyBtn} ${copiedField === 'octal' ? styles.copied : ''}`}
              onClick={() => copyToClipboard(octal, 'octal')}
            >
              {copiedField === 'octal' ? 'Copied!' : 'Copy Octal'}
            </button>
            <button
              className={`${styles.copyBtn} ${copiedField === 'symbolic' ? styles.copied : ''}`}
              onClick={() => copyToClipboard(symbolic, 'symbolic')}
            >
              {copiedField === 'symbolic' ? 'Copied!' : 'Copy Symbolic'}
            </button>
            <button
              className={`${styles.copyBtn} ${copiedField === 'command' ? styles.copied : ''}`}
              onClick={() => copyToClipboard(chmodCmd, 'command')}
            >
              {copiedField === 'command' ? 'Copied!' : 'Copy Command'}
            </button>
          </div>
        </Card>

        {/* Context Toggle */}
        <Card hoverable={false}>
          <div className={styles.contextToggle}>
            <span className={styles.contextLabel}>
              Context: {state.isDirectory ? 'Directory' : 'File'}
            </span>
            <button
              className={`${styles.toggle} ${state.isDirectory ? styles.toggleActive : ''}`}
              onClick={() => setState(prev => ({ ...prev, isDirectory: !prev.isDirectory }))}
            >
              <div className={styles.toggleKnob} />
            </button>
          </div>
        </Card>

        {/* Permission Explanation */}
        <Card hoverable={false}>
          <div className={styles.sectionTitle}>Explanation</div>
          <div className={styles.explanation}>
            {explanation.map((item, i) => (
              <div key={i} className={styles.explainRow}>
                <span className={styles.explainEntity}>{item.entity}</span>
                <span className={styles.explainText}>{item.text}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Reverse Lookup */}
        <Card hoverable={false}>
          <div className={styles.sectionTitle}>Reverse Lookup</div>
          <input
            className={styles.lookupInput}
            placeholder="Paste ls -l output, e.g. -rwxr-xr-x"
            value={lookupInput}
            onChange={e => handleLookup(e.target.value)}
            spellCheck={false}
          />
        </Card>
      </div>
    </Layout>
  );
}
