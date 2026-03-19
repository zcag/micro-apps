import { useState, useCallback, useMemo, useRef } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import {
  Habit,
  Completions,
  loadHabits,
  saveHabits,
  loadCompletions,
  saveCompletions,
  toggleCompletion,
  isCompletedOn,
  getCurrentStreak,
  getBestStreak,
  getCompletionRate,
  getLast7Days,
  todayKey,
} from './storage';
import styles from './App.module.css';

const MOTIVATIONAL_MESSAGES = [
  'All habits done! You\'re on fire!',
  'Perfect day! Keep the momentum going!',
  'Crushed it! Every day counts!',
  'Amazing discipline! You\'re building greatness!',
  'All checked off! Future you says thanks!',
  '100% today! Consistency is your superpower!',
];

const DEFAULT_EMOJIS = ['', '', '', '', '', '', '', '', '', '', '', ''];

export default function App() {
  const [habits, setHabits] = useState<Habit[]>(loadHabits);
  const [completions, setCompletions] = useState<Completions>(loadCompletions);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const analyticsRef = useRef(false);

  const today = todayKey();
  const last7Days = useMemo(() => getLast7Days(), []);

  const todayDone = useMemo(
    () => habits.filter((h) => isCompletedOn(completions, h.id, today)).length,
    [habits, completions, today]
  );

  const allDone = habits.length > 0 && todayDone === habits.length;
  const progressPct = habits.length > 0 ? Math.round((todayDone / habits.length) * 100) : 0;

  const motivationalMsg = useMemo(() => {
    if (!allDone) return '';
    return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);

  const handleToggle = useCallback(
    (habitId: string) => {
      const updated = toggleCompletion(completions, habitId, today);
      setCompletions(updated);
      saveCompletions(updated);

      if (!analyticsRef.current) {
        trackEvent('habit_toggle', { habit_count: String(habits.length) });
        analyticsRef.current = true;
      }
    },
    [completions, today, habits.length]
  );

  const handleAdd = useCallback(() => {
    const name = newName.trim();
    if (!name) return;

    const habit: Habit = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      emoji: newEmoji || '',
      createdAt: todayKey(),
    };

    const updated = [...habits, habit];
    setHabits(updated);
    saveHabits(updated);
    setNewName('');
    setNewEmoji('');
    setShowAddForm(false);
    trackEvent('habit_add', { name });
  }, [newName, newEmoji, habits]);

  const handleEdit = useCallback(
    (id: string) => {
      const name = editName.trim();
      if (!name) return;

      const updated = habits.map((h) =>
        h.id === id ? { ...h, name, emoji: editEmoji || h.emoji } : h
      );
      setHabits(updated);
      saveHabits(updated);
      setEditingId(null);
    },
    [editName, editEmoji, habits]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const updated = habits.filter((h) => h.id !== id);
      setHabits(updated);
      saveHabits(updated);
      const { [id]: _, ...rest } = completions;
      setCompletions(rest);
      saveCompletions(rest);
      setConfirmDeleteId(null);
    },
    [habits, completions]
  );

  const handleResetStreak = useCallback(
    (id: string) => {
      const updated = { ...completions, [id]: [] };
      setCompletions(updated);
      saveCompletions(updated);
      setConfirmResetId(null);
    },
    [completions]
  );

  const startEdit = useCallback(
    (habit: Habit) => {
      setEditingId(habit.id);
      setEditName(habit.name);
      setEditEmoji(habit.emoji);
    },
    []
  );

  const dayLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()];
  };

  return (
    <Layout title="Habit Tracker">
      <div className={styles.container}>
        {/* Daily Progress */}
        {habits.length > 0 && (
          <Card>
            <div className={styles.progressSection}>
              <div className={styles.progressHeader}>
                <span className={styles.progressLabel}>Today's Progress</span>
                <span className={styles.progressCount}>
                  {todayDone}/{habits.length}
                </span>
              </div>
              <div className={styles.progressBarTrack}>
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {allDone && (
                <div className={styles.motivational}>{motivationalMsg}</div>
              )}
            </div>
          </Card>
        )}

        {/* Habit List */}
        {habits.map((habit) => {
          const done = isCompletedOn(completions, habit.id, today);
          const streak = getCurrentStreak(completions, habit.id);
          const best = getBestStreak(completions, habit.id);
          const rate = getCompletionRate(completions, habit.id, habit);

          if (editingId === habit.id) {
            return (
              <Card key={habit.id}>
                <div className={styles.editForm}>
                  <div className={styles.editRow}>
                    <input
                      className={styles.emojiInput}
                      value={editEmoji}
                      onChange={(e) => setEditEmoji(e.target.value)}
                      placeholder=""
                      maxLength={2}
                    />
                    <input
                      className={styles.nameInput}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Habit name"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleEdit(habit.id)}
                    />
                  </div>
                  <div className={styles.editActions}>
                    <button className={styles.saveBtn} onClick={() => handleEdit(habit.id)}>
                      Save
                    </button>
                    <button className={styles.cancelBtn} onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </Card>
            );
          }

          return (
            <Card key={habit.id}>
              <div className={`${styles.habitCard} ${done ? styles.habitDone : ''}`}>
                <div className={styles.habitMain}>
                  <button
                    className={`${styles.checkBtn} ${done ? styles.checked : ''}`}
                    onClick={() => handleToggle(habit.id)}
                    aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {done ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
                  <div className={styles.habitInfo}>
                    <div className={styles.habitName}>
                      <span className={styles.habitEmoji}>{habit.emoji}</span>
                      <span className={done ? styles.nameStrikethrough : ''}>{habit.name}</span>
                    </div>
                    <div className={styles.habitStats}>
                      <span className={styles.statItem} title="Current streak">
                        {streak > 0 ? `${streak}d streak` : 'No streak'}
                      </span>
                      <span className={styles.statDivider}>|</span>
                      <span className={styles.statItem} title="Best streak">
                        Best: {best}d
                      </span>
                      <span className={styles.statDivider}>|</span>
                      <span className={styles.statItem} title="Completion rate">
                        {rate}%
                      </span>
                    </div>
                  </div>
                  <div className={styles.habitActions}>
                    <button className={styles.iconBtn} onClick={() => startEdit(habit)} title="Edit">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      className={styles.iconBtn}
                      onClick={() => setConfirmResetId(habit.id)}
                      title="Reset streak"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M1 4v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      className={styles.iconBtn}
                      onClick={() => setConfirmDeleteId(habit.id)}
                      title="Delete"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Weekly Heat Map */}
                <div className={styles.heatMap}>
                  {last7Days.map((dateStr) => {
                    const completed = isCompletedOn(completions, habit.id, dateStr);
                    return (
                      <div key={dateStr} className={styles.heatDay}>
                        <span className={styles.heatLabel}>{dayLabel(dateStr)}</span>
                        <div
                          className={`${styles.heatCell} ${completed ? styles.heatFilled : styles.heatEmpty}`}
                          title={`${dateStr}: ${completed ? 'Done' : 'Missed'}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })}

        {/* Empty State */}
        {habits.length === 0 && !showAddForm && (
          <Card>
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>+</div>
              <p className={styles.emptyText}>No habits yet. Add your first habit to start tracking!</p>
            </div>
          </Card>
        )}

        {/* Add Habit Form */}
        {showAddForm ? (
          <Card>
            <div className={styles.addForm}>
              <div className={styles.addFormTitle}>New Habit</div>
              <div className={styles.addRow}>
                <input
                  className={styles.emojiInput}
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  placeholder=""
                  maxLength={2}
                />
                <input
                  className={styles.nameInput}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Habit name (e.g. Meditate)"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className={styles.emojiPicker}>
                {DEFAULT_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    className={`${styles.emojiOption} ${newEmoji === emoji ? styles.emojiSelected : ''}`}
                    onClick={() => setNewEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className={styles.addActions}>
                <Button variant="gradient" onClick={handleAdd} disabled={!newName.trim()}>
                  Add Habit
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewName('');
                    setNewEmoji('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Button variant="gradient" onClick={() => setShowAddForm(true)} haptic>
            + Add Habit
          </Button>
        )}

        {/* Confirm Delete Dialog */}
        {confirmDeleteId && (
          <div className={styles.overlay} onClick={() => setConfirmDeleteId(null)}>
            <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
              <div className={styles.dialogTitle}>Delete Habit?</div>
              <p className={styles.dialogText}>
                This will permanently delete this habit and all its tracking data.
              </p>
              <div className={styles.dialogActions}>
                <button className={styles.dialogDeleteBtn} onClick={() => handleDelete(confirmDeleteId)}>
                  Delete
                </button>
                <button className={styles.dialogCancelBtn} onClick={() => setConfirmDeleteId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Reset Dialog */}
        {confirmResetId && (
          <div className={styles.overlay} onClick={() => setConfirmResetId(null)}>
            <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
              <div className={styles.dialogTitle}>Reset Streak?</div>
              <p className={styles.dialogText}>
                This will clear all completion data for this habit. Your streak will be reset to 0.
              </p>
              <div className={styles.dialogActions}>
                <button className={styles.dialogDeleteBtn} onClick={() => handleResetStreak(confirmResetId)}>
                  Reset
                </button>
                <button className={styles.dialogCancelBtn} onClick={() => setConfirmResetId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
