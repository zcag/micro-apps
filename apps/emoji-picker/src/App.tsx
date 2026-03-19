import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Layout, Card } from '@micro-apps/shared';
import {
  EMOJIS, CATEGORIES, CATEGORY_INFO, SKIN_TONES,
  applySkinTone, getHtmlEntity, getUnicodeEscape, getCssContent, getShortcode,
  type EmojiData, type Category,
} from './emojis';
import styles from './App.module.css';

const LS_RECENT = 'emoji-picker-recent';
const LS_FAVS = 'emoji-picker-favorites';
const MAX_RECENT = 50;

type ViewMode = 'grid' | 'list';
type CopyFormat = 'char' | 'html' | 'unicode' | 'css';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

export default function App() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [selectedEmoji, setSelectedEmoji] = useState<EmojiData | null>(null);
  const [skinToneIndex, setSkinToneIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [recent, setRecent] = useState<string[]>(() => loadJson(LS_RECENT, []));
  const [favorites, setFavorites] = useState<string[]>(() => loadJson(LS_FAVS, []));
  const [toast, setToast] = useState<string | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<CopyFormat | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  const gridRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<Map<Category, HTMLDivElement>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);

  // Persist recent + favorites
  useEffect(() => { localStorage.setItem(LS_RECENT, JSON.stringify(recent)); }, [recent]);
  useEffect(() => { localStorage.setItem(LS_FAVS, JSON.stringify(favorites)); }, [favorites]);

  // Emoji map for lookups
  const emojiMap = useMemo(() => {
    const m = new Map<string, EmojiData>();
    EMOJIS.forEach(e => m.set(e.emoji, e));
    return m;
  }, []);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    CATEGORIES.forEach(c => {
      counts[c] = EMOJIS.filter(e => e.category === c).length;
    });
    return counts;
  }, []);

  // Filtered emojis
  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return EMOJIS;
    const q = search.toLowerCase().trim();
    return EMOJIS.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.keywords.some(k => k.includes(q))
    );
  }, [search]);

  // Grouped by category
  const groupedEmojis = useMemo(() => {
    const groups: [Category, EmojiData[]][] = [];
    CATEGORIES.forEach(cat => {
      const items = filteredEmojis.filter(e => e.category === cat);
      if (items.length > 0) groups.push([cat, items]);
    });
    return groups;
  }, [filteredEmojis]);

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1500);
  }, []);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${label}!`);
      if (navigator.vibrate) navigator.vibrate(10);
    } catch {
      showToast('Failed to copy');
    }
  }, [showToast]);

  const handleEmojiClick = useCallback((emoji: EmojiData) => {
    const skinMod = SKIN_TONES[skinToneIndex].modifier;
    const displayed = emoji.hasSkinTone ? applySkinTone(emoji.emoji, skinMod) : emoji.emoji;
    copyToClipboard(displayed, displayed);

    // Add to recent
    setRecent(prev => {
      const next = [emoji.emoji, ...prev.filter(e => e !== emoji.emoji)];
      return next.slice(0, MAX_RECENT);
    });
  }, [skinToneIndex, copyToClipboard]);

  const handleEmojiSelect = useCallback((emoji: EmojiData) => {
    setSelectedEmoji(prev => prev?.emoji === emoji.emoji ? null : emoji);
  }, []);

  const toggleFavorite = useCallback((emojiChar: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFavorites(prev =>
      prev.includes(emojiChar)
        ? prev.filter(f => f !== emojiChar)
        : [...prev, emojiChar]
    );
  }, []);

  const handleCopyFormat = useCallback((format: CopyFormat, emoji: EmojiData) => {
    const skinMod = SKIN_TONES[skinToneIndex].modifier;
    const displayed = emoji.hasSkinTone ? applySkinTone(emoji.emoji, skinMod) : emoji.emoji;
    let text = '';
    let label = '';
    switch (format) {
      case 'char': text = displayed; label = 'emoji'; break;
      case 'html': text = getHtmlEntity(displayed); label = 'HTML entity'; break;
      case 'unicode': text = getUnicodeEscape(displayed); label = 'Unicode escape'; break;
      case 'css': text = getCssContent(displayed); label = 'CSS content'; break;
    }
    copyToClipboard(text, label);
    clearTimeout(copiedTimer.current);
    setCopiedFormat(format);
    copiedTimer.current = setTimeout(() => setCopiedFormat(null), 1500);
  }, [skinToneIndex, copyToClipboard]);

  const scrollToCategory = useCallback((cat: Category) => {
    setActiveCategory(cat);
    setSearch('');
    const el = categoryRefs.current.get(cat);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        if (active?.tagName !== 'INPUT') {
          e.preventDefault();
          searchRef.current?.focus();
        }
      }
      if (e.key === 'Escape') {
        setSelectedEmoji(null);
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const renderEmojiItem = useCallback((emoji: EmojiData, key: string) => {
    const skinMod = SKIN_TONES[skinToneIndex].modifier;
    const displayed = emoji.hasSkinTone ? applySkinTone(emoji.emoji, skinMod) : emoji.emoji;
    const isFav = favorites.includes(emoji.emoji);

    if (viewMode === 'list') {
      return (
        <button
          key={key}
          className={styles.emojiListItem}
          onClick={() => handleEmojiClick(emoji)}
          onDoubleClick={() => handleEmojiSelect(emoji)}
          title={`${emoji.name} — double-click for details`}
        >
          <span className={styles.emojiListEmoji}>{displayed}</span>
          <div className={styles.emojiListInfo}>
            <div className={styles.emojiListName}>{emoji.name}</div>
            <div className={styles.emojiListMeta}>{getShortcode(emoji.name)} · {emoji.codepoint}</div>
          </div>
          <button
            className={styles.emojiListFav}
            data-active={isFav || undefined}
            onClick={(e) => toggleFavorite(emoji.emoji, e)}
            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFav ? '❤️' : '🤍'}
          </button>
        </button>
      );
    }

    return (
      <button
        key={key}
        className={styles.emojiCell}
        onClick={() => handleEmojiClick(emoji)}
        onDoubleClick={() => handleEmojiSelect(emoji)}
        title={`${emoji.name} — click to copy, double-click for details`}
      >
        {displayed}
        <button
          className={styles.favBtn}
          onClick={(e) => toggleFavorite(emoji.emoji, e)}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFav ? '❤️' : '🤍'}
        </button>
      </button>
    );
  }, [skinToneIndex, viewMode, favorites, handleEmojiClick, handleEmojiSelect, toggleFavorite]);

  const skinMod = SKIN_TONES[skinToneIndex].modifier;

  return (
    <Layout title="Emoji Picker">
      <div className={styles.container}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            ref={searchRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search emojis by name or keyword… (press / to focus)"
            value={search}
            onChange={e => { setSearch(e.target.value); setActiveCategory(null); }}
          />
        </div>

        {/* Category tabs */}
        {!search && (
          <div className={styles.categoryTabs}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`${styles.categoryTab} ${activeCategory === cat ? styles.categoryTabActive : ''}`}
                onClick={() => scrollToCategory(cat)}
              >
                <span className={styles.categoryTabIcon}>{CATEGORY_INFO[cat].icon}</span>
                <span className={styles.categoryTabLabel}>{cat}</span>
                <span className={styles.categoryTabCount}>{categoryCounts[cat]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Controls: skin tone + view toggle */}
        <div className={styles.controls}>
          <div className={styles.skinToneSelector}>
            {SKIN_TONES.map((st, i) => (
              <button
                key={i}
                className={`${styles.skinToneBtn} ${skinToneIndex === i ? styles.skinToneBtnActive : ''}`}
                onClick={() => setSkinToneIndex(i)}
                title={st.label}
              >
                {st.preview}
              </button>
            ))}
          </div>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('grid')}
            >
              Grid
            </button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
          </div>
        </div>

        {/* Detail panel */}
        {selectedEmoji && (
          <Card>
            <div className={styles.detailPanel}>
              <div className={styles.detailTop}>
                <span className={styles.detailEmoji}>
                  {selectedEmoji.hasSkinTone
                    ? applySkinTone(selectedEmoji.emoji, skinMod)
                    : selectedEmoji.emoji}
                </span>
                <div className={styles.detailInfo}>
                  <div className={styles.detailName}>{selectedEmoji.name}</div>
                  <div className={styles.detailCodepoint}>{selectedEmoji.codepoint}</div>
                  <div className={styles.detailShortcode}>{getShortcode(selectedEmoji.name)}</div>
                </div>
                <button className={styles.detailClose} onClick={() => setSelectedEmoji(null)}>✕</button>
              </div>
              <div className={styles.copyFormats}>
                {([
                  ['char', 'Emoji', selectedEmoji.hasSkinTone ? applySkinTone(selectedEmoji.emoji, skinMod) : selectedEmoji.emoji],
                  ['html', 'HTML Entity', getHtmlEntity(selectedEmoji.hasSkinTone ? applySkinTone(selectedEmoji.emoji, skinMod) : selectedEmoji.emoji)],
                  ['unicode', 'Unicode', getUnicodeEscape(selectedEmoji.hasSkinTone ? applySkinTone(selectedEmoji.emoji, skinMod) : selectedEmoji.emoji)],
                  ['css', 'CSS Content', getCssContent(selectedEmoji.hasSkinTone ? applySkinTone(selectedEmoji.emoji, skinMod) : selectedEmoji.emoji)],
                ] as [CopyFormat, string, string][]).map(([fmt, label, value]) => (
                  <button
                    key={fmt}
                    className={`${styles.copyFormatBtn} ${copiedFormat === fmt ? styles.copyFormatBtnCopied : ''}`}
                    onClick={() => handleCopyFormat(fmt, selectedEmoji)}
                  >
                    <span className={styles.copyFormatLabel}>
                      {copiedFormat === fmt ? '✓ Copied' : label}
                    </span>
                    <span className={styles.copyFormatValue}>{value}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Favorites section */}
        {!search && favorites.length > 0 && (
          <>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>⭐ Favorites ({favorites.length})</span>
              <button className={styles.clearBtn} onClick={() => setFavorites([])}>Clear</button>
            </div>
            <div className={viewMode === 'grid' ? styles.emojiGrid : styles.emojiList}>
              {favorites
                .map(f => emojiMap.get(f))
                .filter((e): e is EmojiData => !!e)
                .map(emoji => renderEmojiItem(emoji, `fav-${emoji.emoji}`))}
            </div>
          </>
        )}

        {/* Recent section */}
        {!search && recent.length > 0 && (
          <>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>🕐 Recently Used ({recent.length})</span>
              <button className={styles.clearBtn} onClick={() => setRecent([])}>Clear</button>
            </div>
            <div className={viewMode === 'grid' ? styles.emojiGrid : styles.emojiList}>
              {recent
                .map(r => emojiMap.get(r))
                .filter((e): e is EmojiData => !!e)
                .slice(0, 20)
                .map(emoji => renderEmojiItem(emoji, `recent-${emoji.emoji}`))}
            </div>
          </>
        )}

        {/* Main emoji catalog */}
        <div ref={gridRef}>
          {filteredEmojis.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🔍</span>
              <span className={styles.emptyText}>No emojis found for "{search}"</span>
            </div>
          ) : search ? (
            <>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>
                  Results ({filteredEmojis.length})
                </span>
              </div>
              <div className={viewMode === 'grid' ? styles.emojiGrid : styles.emojiList}>
                {filteredEmojis.map(emoji => renderEmojiItem(emoji, `search-${emoji.emoji}`))}
              </div>
            </>
          ) : (
            groupedEmojis.map(([cat, items]) => (
              <div
                key={cat}
                ref={el => { if (el) categoryRefs.current.set(cat, el); }}
              >
                <div className={styles.categoryHeading}>
                  <span className={styles.categoryHeadingIcon}>{CATEGORY_INFO[cat].icon}</span>
                  <span className={styles.categoryHeadingText}>{CATEGORY_INFO[cat].label}</span>
                  <span className={styles.categoryHeadingCount}>{items.length}</span>
                </div>
                <div className={viewMode === 'grid' ? styles.emojiGrid : styles.emojiList}>
                  {items.map(emoji => renderEmojiItem(emoji, `cat-${emoji.emoji}`))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Toast */}
        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </Layout>
  );
}
