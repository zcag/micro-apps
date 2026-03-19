import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Layout, Card, Button, Input, trackEvent } from '@micro-apps/shared';
import {
  Deck,
  Flashcard,
  Difficulty,
  generateId,
  createDeck,
  createCard,
  rateCard,
  getDueCards,
  getDeckStats,
  parseImport,
  saveDecks,
  loadDecks,
} from './flashcards';
import styles from './App.module.css';

type View = 'decks' | 'deck-detail' | 'study' | 'import';

export default function App() {
  const [decks, setDecks] = useState<Deck[]>(() => loadDecks());
  const [view, setView] = useState<View>('decks');
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyCards, setStudyCards] = useState<Flashcard[]>([]);
  const [newDeckName, setNewDeckName] = useState('');
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardFront, setCardFront] = useState('');
  const [cardBack, setCardBack] = useState('');
  const [importText, setImportText] = useState('');
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, easy: 0, medium: 0, hard: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeDeck = useMemo(
    () => decks.find((d) => d.id === activeDeckId) ?? null,
    [decks, activeDeckId],
  );

  // Auto-save
  useEffect(() => {
    const timer = setTimeout(() => saveDecks(decks), 300);
    return () => clearTimeout(timer);
  }, [decks]);

  const updateDeck = useCallback((deckId: string, updater: (d: Deck) => Deck) => {
    setDecks((prev) => prev.map((d) => (d.id === deckId ? updater(d) : d)));
  }, []);

  // Deck management
  const handleCreateDeck = useCallback(() => {
    if (!newDeckName.trim()) return;
    const deck = createDeck(newDeckName.trim());
    setDecks((prev) => [...prev, deck]);
    setNewDeckName('');
    setActiveDeckId(deck.id);
    setView('deck-detail');
    trackEvent('flashcard_create_deck');
  }, [newDeckName]);

  const handleDeleteDeck = useCallback((id: string) => {
    setDecks((prev) => prev.filter((d) => d.id !== id));
    if (activeDeckId === id) {
      setActiveDeckId(null);
      setView('decks');
    }
    trackEvent('flashcard_delete_deck');
  }, [activeDeckId]);

  const handleRenameDeck = useCallback((id: string, name: string) => {
    updateDeck(id, (d) => ({ ...d, name }));
  }, [updateDeck]);

  // Card management
  const handleAddCard = useCallback(() => {
    if (!activeDeckId || !cardFront.trim() || !cardBack.trim()) return;
    const card = createCard(cardFront.trim(), cardBack.trim());
    updateDeck(activeDeckId, (d) => ({ ...d, cards: [...d.cards, card] }));
    setCardFront('');
    setCardBack('');
    trackEvent('flashcard_add_card');
  }, [activeDeckId, cardFront, cardBack, updateDeck]);

  const handleUpdateCard = useCallback(() => {
    if (!activeDeckId || !editingCardId || !cardFront.trim() || !cardBack.trim()) return;
    updateDeck(activeDeckId, (d) => ({
      ...d,
      cards: d.cards.map((c) =>
        c.id === editingCardId ? { ...c, front: cardFront.trim(), back: cardBack.trim() } : c,
      ),
    }));
    setEditingCardId(null);
    setCardFront('');
    setCardBack('');
    trackEvent('flashcard_edit_card');
  }, [activeDeckId, editingCardId, cardFront, cardBack, updateDeck]);

  const handleDeleteCard = useCallback((cardId: string) => {
    if (!activeDeckId) return;
    updateDeck(activeDeckId, (d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) }));
    trackEvent('flashcard_delete_card');
  }, [activeDeckId, updateDeck]);

  const startEditCard = useCallback((card: Flashcard) => {
    setEditingCardId(card.id);
    setCardFront(card.front);
    setCardBack(card.back);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCardId(null);
    setCardFront('');
    setCardBack('');
  }, []);

  // Study mode
  const startStudy = useCallback(() => {
    if (!activeDeck) return;
    const due = getDueCards(activeDeck.cards);
    if (due.length === 0) return;
    setStudyCards(due);
    setStudyIndex(0);
    setFlipped(false);
    setSessionStats({ reviewed: 0, easy: 0, medium: 0, hard: 0 });
    setView('study');
    trackEvent('flashcard_start_study', { deck: activeDeck.name, cards: String(due.length) });
  }, [activeDeck]);

  const handleRate = useCallback((difficulty: Difficulty) => {
    if (!activeDeckId || studyIndex >= studyCards.length) return;
    const currentCard = studyCards[studyIndex];
    const updated = rateCard(currentCard, difficulty);

    updateDeck(activeDeckId, (d) => ({
      ...d,
      cards: d.cards.map((c) => (c.id === updated.id ? updated : c)),
    }));

    setSessionStats((prev) => ({
      ...prev,
      reviewed: prev.reviewed + 1,
      [difficulty]: prev[difficulty] + 1,
    }));

    if (studyIndex + 1 < studyCards.length) {
      setStudyIndex((prev) => prev + 1);
      setFlipped(false);
    } else {
      setStudyIndex(studyCards.length);
    }

    trackEvent('flashcard_rate', { difficulty });
  }, [activeDeckId, studyIndex, studyCards, updateDeck]);

  // Import
  const handleImportText = useCallback(() => {
    if (!activeDeckId || !importText.trim()) return;
    const parsed = parseImport(importText);
    if (parsed.length === 0) return;
    const newCards = parsed.map((c) => createCard(c.front, c.back));
    updateDeck(activeDeckId, (d) => ({ ...d, cards: [...d.cards, ...newCards] }));
    setImportText('');
    setView('deck-detail');
    trackEvent('flashcard_import', { count: String(parsed.length) });
  }, [activeDeckId, importText, updateDeck]);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setImportText(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const openDeck = useCallback((id: string) => {
    setActiveDeckId(id);
    setView('deck-detail');
    setEditingCardId(null);
    setCardFront('');
    setCardBack('');
  }, []);

  const goBack = useCallback(() => {
    if (view === 'study' || view === 'import') {
      setView('deck-detail');
    } else {
      setView('decks');
      setActiveDeckId(null);
    }
    setFlipped(false);
    setEditingCardId(null);
    setCardFront('');
    setCardBack('');
  }, [view]);

  // Study complete screen
  const isStudyComplete = view === 'study' && studyIndex >= studyCards.length;

  // Deck list view
  if (view === 'decks') {
    return (
      <Layout title="Flashcard Maker">
        <div className={styles.container}>
          {/* Create deck */}
          <Card variant="glass">
            <div className={styles.createDeck}>
              <Input
                label="New Deck Name"
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                placeholder="e.g. Spanish Vocabulary"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateDeck()}
              />
              <Button
                variant="gradient"
                onClick={handleCreateDeck}
                disabled={!newDeckName.trim()}
                haptic
              >
                Create Deck
              </Button>
            </div>
          </Card>

          {/* Deck list */}
          {decks.length === 0 ? (
            <Card>
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>&#x1F4DA;</div>
                <p className={styles.emptyTitle}>No decks yet</p>
                <p className={styles.emptySubtitle}>Create your first deck to start studying</p>
              </div>
            </Card>
          ) : (
            decks.map((deck) => {
              const stats = getDeckStats(deck.cards);
              return (
                <Card key={deck.id} hoverable>
                  <div className={styles.deckCard} onClick={() => openDeck(deck.id)}>
                    <div className={styles.deckInfo}>
                      <div className={styles.deckName}>{deck.name}</div>
                      <div className={styles.deckMeta}>
                        {stats.total} card{stats.total !== 1 ? 's' : ''}
                        {stats.due > 0 && (
                          <span className={styles.dueBadge}>{stats.due} due</span>
                        )}
                      </div>
                    </div>
                    <div className={styles.deckProgress}>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{
                            width: stats.total > 0 ? `${(stats.mastered / stats.total) * 100}%` : '0%',
                          }}
                        />
                      </div>
                      <span className={styles.progressLabel}>
                        {stats.mastered}/{stats.total} mastered
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </Layout>
    );
  }

  // Study view
  if (view === 'study' && activeDeck) {
    if (isStudyComplete) {
      return (
        <Layout title="Flashcard Maker">
          <div className={styles.container}>
            <button className={styles.backBtn} onClick={goBack}>
              &#8592; Back to Deck
            </button>
            <Card variant="glass">
              <div className={styles.studyComplete}>
                <div className={styles.completeIcon}>&#x1F389;</div>
                <h2 className={styles.completeTitle}>Session Complete!</h2>
                <div className={styles.completeStats}>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{sessionStats.reviewed}</span>
                    <span className={styles.statLabel}>Reviewed</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={`${styles.statValue} ${styles.statEasy}`}>{sessionStats.easy}</span>
                    <span className={styles.statLabel}>Easy</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={`${styles.statValue} ${styles.statMedium}`}>{sessionStats.medium}</span>
                    <span className={styles.statLabel}>Medium</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={`${styles.statValue} ${styles.statHard}`}>{sessionStats.hard}</span>
                    <span className={styles.statLabel}>Hard</span>
                  </div>
                </div>
                <Button variant="gradient" onClick={goBack} haptic>
                  Back to Deck
                </Button>
              </div>
            </Card>
          </div>
        </Layout>
      );
    }

    const currentCard = studyCards[studyIndex];
    const progress = studyCards.length > 0 ? ((studyIndex) / studyCards.length) * 100 : 0;

    return (
      <Layout title="Flashcard Maker">
        <div className={styles.container}>
          <div className={styles.studyHeader}>
            <button className={styles.backBtn} onClick={goBack}>
              &#8592; Exit
            </button>
            <span className={styles.studyProgress}>
              {studyIndex + 1} / {studyCards.length}
            </span>
          </div>

          <div className={styles.studyProgressBar}>
            <div className={styles.studyProgressFill} style={{ width: `${progress}%` }} />
          </div>

          {/* Flip card */}
          <div
            className={`${styles.flipContainer} ${flipped ? styles.flipped : ''}`}
            onClick={() => setFlipped((f) => !f)}
          >
            <div className={styles.flipCard}>
              <div className={styles.flipFront}>
                <span className={styles.flipLabel}>FRONT</span>
                <div className={styles.flipContent}>{currentCard.front}</div>
                <span className={styles.flipHint}>Tap to flip</span>
              </div>
              <div className={styles.flipBack}>
                <span className={styles.flipLabel}>BACK</span>
                <div className={styles.flipContent}>{currentCard.back}</div>
                <span className={styles.flipHint}>Tap to flip</span>
              </div>
            </div>
          </div>

          {/* Rating buttons */}
          {flipped && (
            <div className={styles.ratingButtons}>
              <span className={styles.ratingPrompt}>How well did you know this?</span>
              <div className={styles.ratingRow}>
                <button
                  className={`${styles.rateBtn} ${styles.rateBtnHard}`}
                  onClick={() => handleRate('hard')}
                >
                  <span className={styles.rateBtnIcon}>&#x1F534;</span>
                  <span className={styles.rateBtnLabel}>Hard</span>
                  <span className={styles.rateBtnSub}>Again soon</span>
                </button>
                <button
                  className={`${styles.rateBtn} ${styles.rateBtnMedium}`}
                  onClick={() => handleRate('medium')}
                >
                  <span className={styles.rateBtnIcon}>&#x1F7E1;</span>
                  <span className={styles.rateBtnLabel}>Medium</span>
                  <span className={styles.rateBtnSub}>In a few days</span>
                </button>
                <button
                  className={`${styles.rateBtn} ${styles.rateBtnEasy}`}
                  onClick={() => handleRate('easy')}
                >
                  <span className={styles.rateBtnIcon}>&#x1F7E2;</span>
                  <span className={styles.rateBtnLabel}>Easy</span>
                  <span className={styles.rateBtnSub}>Much later</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // Import view
  if (view === 'import' && activeDeck) {
    const parsed = parseImport(importText);
    return (
      <Layout title="Flashcard Maker">
        <div className={styles.container}>
          <button className={styles.backBtn} onClick={goBack}>
            &#8592; Back to {activeDeck.name}
          </button>

          <Card variant="glass">
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Import Cards</span>
              <p className={styles.importHint}>
                One card per line, use <code>|</code> to separate front and back.
                <br />
                Example: <code>Hola | Hello</code>
              </p>
              <textarea
                className={styles.importTextarea}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"Front text | Back text\nBonjour | Hello\nMerci | Thank you"}
                rows={10}
              />
              <div className={styles.importActions}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.tsv"
                  className={styles.hiddenInput}
                  onChange={handleFileImport}
                />
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()} haptic>
                  Load from File
                </Button>
                <Button
                  variant="gradient"
                  onClick={handleImportText}
                  disabled={parsed.length === 0}
                  haptic
                >
                  Import {parsed.length} Card{parsed.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </Card>

          {/* Preview */}
          {parsed.length > 0 && (
            <Card>
              <div className={styles.section}>
                <span className={styles.sectionLabel}>Preview ({parsed.length} cards)</span>
                <div className={styles.previewList}>
                  {parsed.slice(0, 20).map((c, i) => (
                    <div key={i} className={styles.previewItem}>
                      <span className={styles.previewFront}>{c.front}</span>
                      <span className={styles.previewSep}>&#8594;</span>
                      <span className={styles.previewBack}>{c.back}</span>
                    </div>
                  ))}
                  {parsed.length > 20 && (
                    <div className={styles.previewMore}>
                      ...and {parsed.length - 20} more
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </Layout>
    );
  }

  // Deck detail view
  if (view === 'deck-detail' && activeDeck) {
    const stats = getDeckStats(activeDeck.cards);

    return (
      <Layout title="Flashcard Maker">
        <div className={styles.container}>
          <button className={styles.backBtn} onClick={goBack}>
            &#8592; All Decks
          </button>

          {/* Deck header */}
          <Card variant="glass">
            <div className={styles.deckHeader}>
              <input
                type="text"
                className={styles.deckTitleInput}
                value={activeDeck.name}
                onChange={(e) => handleRenameDeck(activeDeck.id, e.target.value)}
              />
              <div className={styles.deckStatsRow}>
                <div className={styles.miniStat}>
                  <span className={styles.miniStatValue}>{stats.total}</span>
                  <span className={styles.miniStatLabel}>Total</span>
                </div>
                <div className={styles.miniStat}>
                  <span className={`${styles.miniStatValue} ${styles.statDue}`}>{stats.due}</span>
                  <span className={styles.miniStatLabel}>Due</span>
                </div>
                <div className={styles.miniStat}>
                  <span className={`${styles.miniStatValue} ${styles.statMastered}`}>{stats.mastered}</span>
                  <span className={styles.miniStatLabel}>Mastered</span>
                </div>
                <div className={styles.miniStat}>
                  <span className={styles.miniStatValue}>{stats.learning}</span>
                  <span className={styles.miniStatLabel}>Learning</span>
                </div>
              </div>
              {stats.total > 0 && (
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${(stats.mastered / stats.total) * 100}%` }}
                  />
                </div>
              )}
              <div className={styles.deckActions}>
                <Button
                  variant="gradient"
                  onClick={startStudy}
                  disabled={stats.due === 0}
                  haptic
                >
                  {stats.due > 0 ? `Study ${stats.due} Due Card${stats.due !== 1 ? 's' : ''}` : 'No Cards Due'}
                </Button>
                <div className={styles.deckActionsRow}>
                  <Button variant="secondary" onClick={() => setView('import')} haptic style={{ flex: 1 }}>
                    Import Cards
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleDeleteDeck(activeDeck.id)}
                    haptic
                    style={{ flex: 1, color: 'var(--error, #ef4444)' }}
                  >
                    Delete Deck
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Add/Edit card form */}
          <Card>
            <div className={styles.section}>
              <span className={styles.sectionLabel}>
                {editingCardId ? 'Edit Card' : 'Add New Card'}
              </span>
              <Input
                label="Front (Question)"
                value={cardFront}
                onChange={(e) => setCardFront(e.target.value)}
                placeholder="What is shown first"
              />
              <Input
                label="Back (Answer)"
                value={cardBack}
                onChange={(e) => setCardBack(e.target.value)}
                placeholder="The answer / definition"
                onKeyDown={(e) => e.key === 'Enter' && (editingCardId ? handleUpdateCard() : handleAddCard())}
              />
              <div className={styles.cardFormActions}>
                {editingCardId ? (
                  <>
                    <Button variant="gradient" onClick={handleUpdateCard} disabled={!cardFront.trim() || !cardBack.trim()} haptic>
                      Save Changes
                    </Button>
                    <Button variant="secondary" onClick={cancelEdit} haptic>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="gradient" onClick={handleAddCard} disabled={!cardFront.trim() || !cardBack.trim()} haptic>
                    Add Card
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Card list */}
          {activeDeck.cards.length > 0 && (
            <Card>
              <div className={styles.section}>
                <span className={styles.sectionLabel}>Cards ({activeDeck.cards.length})</span>
                <div className={styles.cardList}>
                  {activeDeck.cards.map((card) => (
                    <div key={card.id} className={styles.cardItem}>
                      <div className={styles.cardItemContent}>
                        <span className={styles.cardFront}>{card.front}</span>
                        <span className={styles.cardSep}>&#8594;</span>
                        <span className={styles.cardBack}>{card.back}</span>
                      </div>
                      <div className={styles.cardItemActions}>
                        <button
                          className={styles.cardActionBtn}
                          onClick={() => startEditCard(card)}
                          title="Edit"
                        >
                          &#9998;
                        </button>
                        <button
                          className={`${styles.cardActionBtn} ${styles.cardDeleteBtn}`}
                          onClick={() => handleDeleteCard(card.id)}
                          title="Delete"
                        >
                          &#215;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      </Layout>
    );
  }

  // Fallback
  return (
    <Layout title="Flashcard Maker">
      <div className={styles.container}>
        <Button variant="gradient" onClick={() => { setView('decks'); setActiveDeckId(null); }}>
          Go to Decks
        </Button>
      </div>
    </Layout>
  );
}
