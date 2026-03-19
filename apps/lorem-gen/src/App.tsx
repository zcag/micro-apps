import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layout,
  Card,
  Button,
  SegmentedControl,
  trackEvent,
} from '@micro-apps/shared';
import styles from './App.module.css';

type GenerateMode = 'paragraphs' | 'sentences' | 'words';
type TextStyle = 'classic' | 'hipster' | 'pirate' | 'corporate' | 'bacon';

interface Settings {
  mode: GenerateMode;
  style: TextStyle;
  count: number;
  startWithLorem: boolean;
  includeHtml: boolean;
}

const STYLE_INFO: Record<TextStyle, { label: string; icon: string; desc: string }> = {
  classic: { label: 'Classic', icon: '📜', desc: 'Traditional Latin filler text' },
  hipster: { label: 'Hipster', icon: '🧔', desc: 'Artisanal craft-inspired text' },
  pirate: { label: 'Pirate', icon: '🏴‍☠️', desc: 'Swashbuckling sea speak' },
  corporate: { label: 'Corporate', icon: '💼', desc: 'Business buzzword jargon' },
  bacon: { label: 'Bacon', icon: '🥓', desc: 'Meaty delicious filler' },
};

const MODE_LIMITS: Record<GenerateMode, { min: number; max: number }> = {
  paragraphs: { min: 1, max: 50 },
  sentences: { min: 1, max: 500 },
  words: { min: 1, max: 1000 },
};

// ── Word Banks ──

const CLASSIC_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
  'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
  'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint',
  'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
  'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum', 'pellentesque', 'habitant',
  'morbi', 'tristique', 'senectus', 'netus', 'malesuada', 'fames', 'ac', 'turpis',
  'egestas', 'maecenas', 'accumsan', 'lacus', 'vel', 'facilisis', 'volutpat',
  'vestibulum', 'ante', 'primis', 'faucibus', 'orci', 'luctus', 'ultrices',
  'posuere', 'cubilia', 'curae', 'donec', 'pharetra', 'leo', 'urna', 'molestie',
  'at', 'elementum', 'eu', 'bibendum', 'praesent', 'blandit', 'congue', 'quisque',
  'sagittis', 'purus', 'semper', 'nec', 'feugiat', 'nisl', 'pretium', 'fusce',
  'pulvinar', 'libero', 'porta', 'placerat', 'tortor', 'condimentum', 'vitae',
  'sapien', 'dictum', 'auctor', 'neque', 'gravida', 'arcu', 'cursus', 'euismod',
  'hendrerit', 'mattis', 'vulputate', 'diam', 'sollicitudin', 'tincidunt',
  'cras', 'fermentum', 'odio', 'dapibus', 'ornare', 'imperdiet', 'scelerisque',
  'viverra', 'nam', 'massa', 'interdum', 'venenatis', 'eget', 'risus', 'nullam',
  'ac', 'felis', 'dignissim', 'convallis', 'aenean', 'justo', 'rhoncus',
];

const HIPSTER_WORDS = [
  'artisan', 'kombucha', 'vinyl', 'craft', 'beard', 'fixie', 'brunch', 'gluten-free',
  'organic', 'sustainable', 'aesthetic', 'vegan', 'pour-over', 'cold-brew', 'flannel',
  'edison', 'bulb', 'avocado', 'toast', 'microdosing', 'typewriter', 'polaroid',
  'single-origin', 'latte', 'oat-milk', 'thrift', 'vintage', 'curated', 'minimalist',
  'sourdough', 'fermented', 'artisanal', 'handcrafted', 'bespoke', 'raw', 'denim',
  'terroir', 'charcuterie', 'nitro', 'chia', 'quinoa', 'kale', 'activated', 'charcoal',
  'tumeric', 'matcha', 'sriracha', 'kimchi', 'miso', 'tahini', 'CBD', 'adaptogen',
  'mindful', 'intentional', 'curate', 'cultivate', 'forage', 'ferment', 'preserve',
  'reclaimed', 'upcycled', 'zero-waste', 'ethical', 'locally-sourced', 'farm-to-table',
  'slow-food', 'gastropub', 'speakeasy', 'bodega', 'roastery', 'distillery',
  'brewery', 'taproom', 'co-working', 'loft', 'industrial', 'exposed-brick',
  'terrazzo', 'mid-century', 'brutalist', 'biophilic', 'hygge', 'wabi-sabi',
  'cottagecore', 'normcore', 'gorpcore', 'dopamine', 'serotonin', 'manifesting',
  'mushroom', 'coffee', 'journal', 'candle', 'incense', 'plant-based', 'poke',
  'ramen', 'bao', 'dumpling', 'tempeh', 'jackfruit', 'coconut', 'amaro',
  'aperol', 'spritz', 'natural', 'wine', 'biodynamic', 'unfiltered',
];

const PIRATE_WORDS = [
  'ahoy', 'matey', 'plunder', 'treasure', 'booty', 'rum', 'grog', 'doubloon',
  'galleon', 'buccaneer', 'scallywag', 'landlubber', 'jolly', 'roger', 'cutlass',
  'cannon', 'broadside', 'starboard', 'port', 'bow', 'stern', 'mast', 'sail',
  'anchor', 'plank', 'mutiny', 'pillage', 'marauder', 'corsair', 'privateer',
  'swashbuckler', 'blimey', 'barnacle', 'bilge', 'brig', 'crow', 'nest',
  'deck', 'fathom', 'horizon', 'isle', 'kraken', 'lagoon', 'maelstrom',
  'nautical', 'ocean', 'parrot', 'quartermaster', 'reef', 'shipwreck', 'tide',
  'vessel', 'whirlpool', 'yo-ho-ho', 'seadog', 'plundering', 'swab', 'compass',
  'chart', 'flag', 'skull', 'crossbones', 'powder', 'keg', 'cannonball',
  'lookout', 'harbor', 'cove', 'bay', 'strait', 'cape', 'shoal', 'typhoon',
  'monsoon', 'squall', 'tempest', 'bounty', 'loot', 'ransom', 'saber',
  'pistol', 'flintlock', 'musket', 'boarding', 'raid', 'fleet', 'armada',
  'voyage', 'expedition', 'adventure', 'scurvy', 'gale', 'windward', 'leeward',
  'rigging', 'helm', 'rudder', 'keel', 'hull', 'timber', 'rope', 'knot',
  'sextant', 'spyglass', 'map', 'parchment', 'chest', 'gold', 'silver', 'jewels',
];

const CORPORATE_WORDS = [
  'synergy', 'leverage', 'paradigm', 'disrupt', 'innovate', 'scalable', 'agile',
  'bandwidth', 'ecosystem', 'stakeholder', 'deliverable', 'actionable', 'holistic',
  'streamline', 'optimize', 'monetize', 'pipeline', 'alignment', 'roadmap',
  'milestone', 'deep-dive', 'pivot', 'iterate', 'vertical', 'horizontal',
  'cross-functional', 'best-practice', 'value-add', 'thought-leadership',
  'circle-back', 'touch-base', 'low-hanging', 'fruit', 'move-the-needle',
  'boil-the-ocean', 'drill-down', 'helicopter-view', 'granular', 'robust',
  'mission-critical', 'core-competency', 'game-changer', 'bleeding-edge',
  'next-gen', 'turnkey', 'end-to-end', 'full-stack', 'omnichannel',
  'customer-centric', 'data-driven', 'cloud-native', 'enterprise-grade',
  'solution', 'framework', 'initiative', 'transformation', 'engagement',
  'enablement', 'empowerment', 'methodology', 'benchmark', 'KPI', 'ROI',
  'SLA', 'OKR', 'sprint', 'standup', 'retrospective', 'backlog', 'velocity',
  'capacity', 'throughput', 'efficiency', 'productivity', 'performance',
  'strategy', 'execution', 'implementation', 'deployment', 'rollout',
  'onboarding', 'offboarding', 'upskilling', 'reskilling', 'talent',
  'culture', 'diversity', 'inclusion', 'wellness', 'sustainability',
  'governance', 'compliance', 'due-diligence', 'audit', 'procurement',
  'vendor', 'partner', 'client', 'revenue', 'growth', 'margin', 'forecast',
];

const BACON_WORDS = [
  'bacon', 'ipsum', 'ham', 'brisket', 'ribeye', 'sirloin', 'tenderloin', 'pork',
  'chop', 'filet', 'mignon', 'strip', 'steak', 'flank', 'drumstick', 'turkey',
  'chicken', 'sausage', 'bratwurst', 'kielbasa', 'chorizo', 'pepperoni', 'salami',
  'prosciutto', 'pancetta', 'pastrami', 'corned', 'beef', 'jerky', 'venison',
  'buffalo', 'lamb', 'shank', 'shoulder', 'belly', 'loin', 'rack', 'ribs',
  'spare', 'baby-back', 'short', 'tri-tip', 'chuck', 'round', 'rump', 'roast',
  'ground', 'patty', 'burger', 'meatball', 'meatloaf', 'hotdog', 'frank',
  'andouille', 'boudin', 'liverwurst', 'mortadella', 'capicola', 'bresaola',
  'guanciale', 'lardo', 'sopressata', 'nduja', 'smoked', 'cured', 'grilled',
  'braised', 'seared', 'roasted', 'slow-cooked', 'barbecued', 'charbroiled',
  'marinated', 'seasoned', 'glazed', 'crispy', 'juicy', 'tender', 'savory',
  'smoky', 'peppery', 'spiced', 'hickory', 'mesquite', 'applewood', 'cherry',
  'oak', 'pecan', 'maple', 'honey', 'brown-sugar', 'mustard', 'vinegar',
  'dry-rub', 'wet-rub', 'brine', 'marinade', 'reduction', 'au-jus', 'gravy',
  'drippings', 'crackling', 'chicharron', 'carnitas', 'pulled', 'sliced',
];

const WORD_BANKS: Record<TextStyle, string[]> = {
  classic: CLASSIC_WORDS,
  hipster: HIPSTER_WORDS,
  pirate: PIRATE_WORDS,
  corporate: CORPORATE_WORDS,
  bacon: BACON_WORDS,
};

const LOREM_OPENER = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';

// ── Generation Logic ──

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function pickRandom<T>(arr: T[]): T {
  return arr[randomInt(arr.length)];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function generateSentence(words: string[], minWords: number, maxWords: number): string {
  const count = minWords + randomInt(maxWords - minWords + 1);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    parts.push(pickRandom(words));
  }
  return capitalize(parts.join(' ')) + '.';
}

function generateParagraph(words: string[]): string {
  const sentenceCount = 4 + randomInt(5); // 4-8 sentences
  const sentences: string[] = [];
  for (let i = 0; i < sentenceCount; i++) {
    sentences.push(generateSentence(words, 6, 16));
  }
  return sentences.join(' ');
}

function generateText(settings: Settings): string {
  const words = WORD_BANKS[settings.style];
  const { mode, count, startWithLorem, includeHtml } = settings;

  let paragraphs: string[] = [];

  if (mode === 'paragraphs') {
    for (let i = 0; i < count; i++) {
      paragraphs.push(generateParagraph(words));
    }
    if (startWithLorem && paragraphs.length > 0) {
      // Replace the beginning of the first paragraph
      const firstSentences = paragraphs[0].split('. ');
      firstSentences[0] = LOREM_OPENER;
      paragraphs[0] = firstSentences.join('. ');
    }
    if (includeHtml) {
      return paragraphs.map((p) => `<p>${p}</p>`).join('\n\n');
    }
    return paragraphs.join('\n\n');
  }

  if (mode === 'sentences') {
    const sentences: string[] = [];
    for (let i = 0; i < count; i++) {
      sentences.push(generateSentence(words, 6, 16));
    }
    if (startWithLorem && sentences.length > 0) {
      sentences[0] = LOREM_OPENER + '.';
    }
    const text = sentences.join(' ');
    if (includeHtml) {
      // Group into paragraphs of ~5 sentences
      const grouped: string[] = [];
      for (let i = 0; i < sentences.length; i += 5) {
        grouped.push(`<p>${sentences.slice(i, i + 5).join(' ')}</p>`);
      }
      return grouped.join('\n\n');
    }
    return text;
  }

  // Words mode
  const wordList: string[] = [];
  for (let i = 0; i < count; i++) {
    wordList.push(pickRandom(words));
  }
  if (startWithLorem && wordList.length >= 2) {
    wordList[0] = 'Lorem';
    wordList[1] = 'ipsum';
  }
  const text = wordList.join(' ');
  if (includeHtml) {
    return `<p>${text}</p>`;
  }
  return text;
}

function countWords(text: string): number {
  // Strip HTML tags for counting
  const clean = text.replace(/<[^>]*>/g, ' ');
  const words = clean.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function countChars(text: string): number {
  const clean = text.replace(/<[^>]*>/g, '');
  return clean.length;
}

// ── LocalStorage ──

const STORAGE_KEY = 'lorem-gen-settings';

function loadSettings(): Settings {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch {
    // ignore
  }
  return {
    mode: 'paragraphs',
    style: 'classic',
    count: 5,
    startWithLorem: true,
    includeHtml: false,
  };
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// ── Component ──

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [generatedText, setGeneratedText] = useState('');
  const [copied, setCopied] = useState(false);
  const [generateKey, setGenerateKey] = useState(0);
  const copyTimeoutRef = useRef<number>();

  const update = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      // Clamp count to valid range
      const limits = MODE_LIMITS[next.mode];
      if (next.count < limits.min) next.count = limits.min;
      if (next.count > limits.max) next.count = limits.max;
      saveSettings(next);
      return next;
    });
  }, []);

  const generate = useCallback(() => {
    const text = generateText(settings);
    setGeneratedText(text);
    setGenerateKey((k) => k + 1);
    setCopied(false);
    trackEvent('generate_lorem', { style: settings.style, mode: settings.mode, count: String(settings.count) });
  }, [settings]);

  // Generate on mount and when settings change
  useEffect(() => {
    generate();
  }, [generate]);

  const handleCopy = async () => {
    if (!generatedText) return;
    try {
      await navigator.clipboard.writeText(generatedText);
      setCopied(true);
      trackEvent('copy_lorem');
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = generatedText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const wordCount = countWords(generatedText);
  const charCount = countChars(generatedText);
  const limits = MODE_LIMITS[settings.mode];

  return (
    <Layout title="Lorem Ipsum Generator">
      <div className={styles.container}>
        {/* Text Style Selector */}
        <Card>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionHeaderIcon}>🎨</span>
            <span>Text Style</span>
            <span className={styles.sectionDivider} />
          </div>
          <div className={styles.styleGrid}>
            {(Object.keys(STYLE_INFO) as TextStyle[]).map((key) => {
              const info = STYLE_INFO[key];
              const isActive = settings.style === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.styleCard} ${isActive ? styles.styleCardActive : ''}`}
                  onClick={() => update({ style: key })}
                >
                  <span className={styles.styleIcon}>{info.icon}</span>
                  <span className={styles.styleLabel}>{info.label}</span>
                  <span className={styles.styleDesc}>{info.desc}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Generate Mode & Count */}
        <Card>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionHeaderIcon}>⚙️</span>
            <span>Settings</span>
            <span className={styles.sectionDivider} />
          </div>

          <SegmentedControl
            options={[
              { label: 'Paragraphs', value: 'paragraphs' as GenerateMode },
              { label: 'Sentences', value: 'sentences' as GenerateMode },
              { label: 'Words', value: 'words' as GenerateMode },
            ]}
            value={settings.mode}
            onChange={(mode) => update({ mode })}
          />

          {/* Count slider */}
          <div className={styles.sliderSection}>
            <div className={styles.sliderHeader}>
              <span className={styles.sliderLabel}>Count</span>
              <span className={styles.sliderValue}>{settings.count}</span>
            </div>
            <input
              type="range"
              className={styles.slider}
              min={limits.min}
              max={limits.max}
              value={settings.count}
              onChange={(e) => update({ count: Number(e.target.value) })}
            />
            <div className={styles.sliderRange}>
              <span>{limits.min}</span>
              <span>{limits.max}</span>
            </div>
          </div>

          {/* Toggle options */}
          <div className={styles.togglesRow}>
            <button
              type="button"
              className={`${styles.toggleButton} ${settings.startWithLorem ? styles.toggleActive : ''}`}
              onClick={() => update({ startWithLorem: !settings.startWithLorem })}
            >
              <span className={styles.toggleCheck}>{settings.startWithLorem ? '✓' : ''}</span>
              <span className={styles.toggleLabel}>Start with "Lorem ipsum..."</span>
            </button>
            <button
              type="button"
              className={`${styles.toggleButton} ${settings.includeHtml ? styles.toggleActive : ''}`}
              onClick={() => update({ includeHtml: !settings.includeHtml })}
            >
              <span className={styles.toggleCheck}>{settings.includeHtml ? '✓' : ''}</span>
              <span className={styles.toggleLabel}>Include &lt;p&gt; tags</span>
            </button>
          </div>
        </Card>

        {/* Generated Text Preview */}
        <div className={styles.previewSection}>
          <Card>
            <div className={styles.previewHeader}>
              <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                <span className={styles.sectionHeaderIcon}>📝</span>
                <span>Preview</span>
                <span className={styles.sectionDivider} />
              </div>
              <div className={styles.stats}>
                <span className={styles.statBadge}>{wordCount} words</span>
                <span className={styles.statBadge}>{charCount} chars</span>
              </div>
            </div>

            <div className={styles.previewBody} key={generateKey}>
              <div className={styles.previewText}>
                {settings.includeHtml ? (
                  <pre className={styles.previewCode}>{generatedText}</pre>
                ) : (
                  generatedText.split('\n\n').map((para, i) => (
                    <p key={i} className={styles.previewParagraph}>{para}</p>
                  ))
                )}
              </div>
            </div>

            {/* Actions */}
            <div className={styles.actionRow}>
              <button
                type="button"
                className={`${styles.copyButton} ${copied ? styles.copyButtonSuccess : ''}`}
                onClick={handleCopy}
              >
                <span className={styles.copyIcon}>{copied ? '✓' : '📋'}</span>
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
              <Button variant="gradient" haptic onClick={generate}>
                Regenerate
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
