import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import {
  CountdownEvent,
  EventCategory,
  TimeRemaining,
  loadEvents,
  saveEvents,
  generateId,
  getTimeRemaining,
  encodeEventToParams,
  decodeEventFromParams,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  CATEGORY_GRADIENTS,
} from './storage';
import styles from './App.module.css';

const CATEGORIES: EventCategory[] = ['birthday', 'holiday', 'deadline', 'travel', 'custom'];

function padTwo(n: number): string {
  return n.toString().padStart(2, '0');
}

function ConfettiOverlay() {
  const particles = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2,
        size: 6 + Math.random() * 8,
        color: ['#f97316', '#ec4899', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'][
          Math.floor(Math.random() * 6)
        ],
        duration: 2 + Math.random() * 2,
      })),
    []
  );

  return (
    <div className={styles.confettiContainer}>
      {particles.map((p) => (
        <div
          key={p.id}
          className={styles.confettiPiece}
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
}

function CountdownDigits({
  value,
  label,
  gradient,
}: {
  value: number;
  label: string;
  gradient: string;
}) {
  const prevRef = useRef(value);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setAnimate(true);
      const t = setTimeout(() => setAnimate(false), 300);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <div className={styles.digitGroup}>
      <div
        className={`${styles.digitBox} ${animate ? styles.digitFlip : ''}`}
        style={{ background: gradient }}
      >
        <span className={styles.digitValue}>{padTwo(value)}</span>
      </div>
      <span className={styles.digitLabel}>{label}</span>
    </div>
  );
}

function HeroCountdown({
  event,
  remaining,
}: {
  event: CountdownEvent;
  remaining: TimeRemaining;
}) {
  const gradient = CATEGORY_GRADIENTS[event.category];

  return (
    <div className={styles.hero}>
      <div className={styles.heroHeader}>
        <span className={styles.heroIcon}>{CATEGORY_ICONS[event.category]}</span>
        <h2 className={styles.heroTitle}>{event.name}</h2>
        <span className={styles.heroDate}>
          {new Date(event.targetDate + 'T12:00:00').toLocaleDateString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </div>

      {remaining.isPast ? (
        <div className={styles.pastHero}>
          <ConfettiOverlay />
          <div className={styles.pastMessage}>
            {remaining.days === 0 ? 'Event is happening now!' : `${remaining.days} day${remaining.days !== 1 ? 's' : ''} ago`}
          </div>
        </div>
      ) : (
        <div className={styles.heroDigits}>
          <CountdownDigits value={remaining.days} label="Days" gradient={gradient} />
          <span className={styles.digitSep}>:</span>
          <CountdownDigits value={remaining.hours} label="Hours" gradient={gradient} />
          <span className={styles.digitSep}>:</span>
          <CountdownDigits value={remaining.minutes} label="Min" gradient={gradient} />
          <span className={styles.digitSep}>:</span>
          <CountdownDigits value={remaining.seconds} label="Sec" gradient={gradient} />
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [events, setEvents] = useState<CountdownEvent[]>(loadEvents);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('00:00');
  const [newCategory, setNewCategory] = useState<EventCategory>('custom');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const importedRef = useRef(false);

  // Import shared event from URL params on first load
  useEffect(() => {
    if (importedRef.current) return;
    importedRef.current = true;
    const shared = decodeEventFromParams(window.location.search);
    if (shared && shared.name && shared.targetDate) {
      const exists = events.some(
        (e) => e.name === shared.name && e.targetDate === shared.targetDate
      );
      if (!exists) {
        const event: CountdownEvent = {
          id: generateId(),
          name: shared.name!,
          targetDate: shared.targetDate!,
          targetTime: shared.targetTime || '00:00',
          category: shared.category || 'custom',
          createdAt: new Date().toISOString(),
        };
        const updated = [...events, event];
        setEvents(updated);
        saveEvents(updated);
      }
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick every second for live countdown
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Sort events: upcoming first (nearest first), then past (most recent first)
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const ra = getTimeRemaining(a.targetDate, a.targetTime);
      const rb = getTimeRemaining(b.targetDate, b.targetTime);
      if (!ra.isPast && !rb.isPast) return ra.total - rb.total;
      if (ra.isPast && rb.isPast) return ra.total - rb.total; // less negative = more recent
      return ra.isPast ? 1 : -1;
    });
  }, [events]);

  const nearestUpcoming = useMemo(() => {
    return sortedEvents.find((e) => !getTimeRemaining(e.targetDate, e.targetTime).isPast) || null;
  }, [sortedEvents]);

  const handleAdd = useCallback(() => {
    const name = newName.trim();
    if (!name || !newDate) return;

    const event: CountdownEvent = {
      id: generateId(),
      name,
      targetDate: newDate,
      targetTime: newTime,
      category: newCategory,
      createdAt: new Date().toISOString(),
    };

    const updated = [...events, event];
    setEvents(updated);
    saveEvents(updated);
    setNewName('');
    setNewDate('');
    setNewTime('00:00');
    setNewCategory('custom');
    setShowAddForm(false);
    trackEvent('countdown_add', { category: newCategory });
  }, [newName, newDate, newTime, newCategory, events]);

  const handleDelete = useCallback(
    (id: string) => {
      const updated = events.filter((e) => e.id !== id);
      setEvents(updated);
      saveEvents(updated);
      setConfirmDeleteId(null);
    },
    [events]
  );

  const handleShare = useCallback((event: CountdownEvent) => {
    const params = encodeEventToParams(event);
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
    navigator.clipboard.writeText(url).then(() => {
      trackEvent('countdown_share');
    });
  }, []);

  const otherEvents = sortedEvents.filter((e) => e.id !== nearestUpcoming?.id);

  return (
    <Layout title="Countdown Timer">
      <div className={styles.container}>
        {/* Hero: nearest upcoming event */}
        {nearestUpcoming && (
          <Card variant="glass" hoverable={false}>
            <HeroCountdown
              event={nearestUpcoming}
              remaining={getTimeRemaining(nearestUpcoming.targetDate, nearestUpcoming.targetTime)}
            />
          </Card>
        )}

        {/* Other events list */}
        {otherEvents.map((event) => {
          const remaining = getTimeRemaining(event.targetDate, event.targetTime);
          const gradient = CATEGORY_GRADIENTS[event.category];

          return (
            <Card key={event.id}>
              <div className={styles.eventCard}>
                <div className={styles.eventHeader}>
                  <div className={styles.eventMeta}>
                    <span
                      className={styles.categoryBadge}
                      style={{ background: gradient }}
                    >
                      {CATEGORY_ICONS[event.category]}
                    </span>
                    <div className={styles.eventInfo}>
                      <span className={styles.eventName}>{event.name}</span>
                      <span className={styles.eventDate}>
                        {new Date(event.targetDate + 'T12:00:00').toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                  <div className={styles.eventActions}>
                    <button
                      className={styles.iconBtn}
                      onClick={() => handleShare(event)}
                      title="Copy share link"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2" />
                        <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                        <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
                        <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </button>
                    <button
                      className={styles.iconBtn}
                      onClick={() => setConfirmDeleteId(event.id)}
                      title="Delete"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {remaining.isPast ? (
                  <div className={styles.pastBadge}>
                    {remaining.days === 0
                      ? 'Happening now!'
                      : `${remaining.days} day${remaining.days !== 1 ? 's' : ''} ago`}
                  </div>
                ) : (
                  <div className={styles.miniDigits}>
                    <div className={styles.miniGroup}>
                      <span className={styles.miniValue} style={{ color: '#f97316' }}>
                        {remaining.days}
                      </span>
                      <span className={styles.miniLabel}>d</span>
                    </div>
                    <span className={styles.miniSep}>:</span>
                    <div className={styles.miniGroup}>
                      <span className={styles.miniValue}>{padTwo(remaining.hours)}</span>
                      <span className={styles.miniLabel}>h</span>
                    </div>
                    <span className={styles.miniSep}>:</span>
                    <div className={styles.miniGroup}>
                      <span className={styles.miniValue}>{padTwo(remaining.minutes)}</span>
                      <span className={styles.miniLabel}>m</span>
                    </div>
                    <span className={styles.miniSep}>:</span>
                    <div className={styles.miniGroup}>
                      <span className={styles.miniValue}>{padTwo(remaining.seconds)}</span>
                      <span className={styles.miniLabel}>s</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        {/* Empty state */}
        {events.length === 0 && !showAddForm && (
          <Card>
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>{'\u{23F3}'}</div>
              <p className={styles.emptyText}>
                No countdowns yet. Add your first event to start tracking!
              </p>
            </div>
          </Card>
        )}

        {/* Add Form */}
        {showAddForm ? (
          <Card>
            <div className={styles.addForm}>
              <div className={styles.addFormTitle}>New Countdown</div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Event Name</label>
                <input
                  className={styles.textInput}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Summer Vacation"
                  autoFocus
                />
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.fieldGroup} style={{ flex: 1 }}>
                  <label className={styles.fieldLabel}>Date</label>
                  <input
                    className={styles.textInput}
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div className={styles.fieldGroup} style={{ width: 120 }}>
                  <label className={styles.fieldLabel}>Time</label>
                  <input
                    className={styles.textInput}
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Category</label>
                <div className={styles.categoryPicker}>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      className={`${styles.categoryOption} ${newCategory === cat ? styles.categorySelected : ''}`}
                      onClick={() => setNewCategory(cat)}
                      style={
                        newCategory === cat
                          ? { background: CATEGORY_GRADIENTS[cat], color: '#fff' }
                          : undefined
                      }
                    >
                      <span>{CATEGORY_ICONS[cat]}</span>
                      <span className={styles.categoryText}>{CATEGORY_LABELS[cat]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.addActions}>
                <Button
                  variant="gradient"
                  onClick={handleAdd}
                  disabled={!newName.trim() || !newDate}
                  style={
                    newName.trim() && newDate
                      ? { background: CATEGORY_GRADIENTS[newCategory] }
                      : undefined
                  }
                >
                  Create Countdown
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewName('');
                    setNewDate('');
                    setNewTime('00:00');
                    setNewCategory('custom');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Button
            variant="gradient"
            onClick={() => setShowAddForm(true)}
            haptic
            style={{ background: 'linear-gradient(135deg, #f97316, #ec4899)' }}
          >
            + Add Countdown
          </Button>
        )}

        {/* Confirm Delete Dialog */}
        {confirmDeleteId && (
          <div className={styles.overlay} onClick={() => setConfirmDeleteId(null)}>
            <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
              <div className={styles.dialogTitle}>Delete Countdown?</div>
              <p className={styles.dialogText}>
                This will permanently remove this countdown event.
              </p>
              <div className={styles.dialogActions}>
                <button
                  className={styles.dialogDeleteBtn}
                  onClick={() => handleDelete(confirmDeleteId)}
                >
                  Delete
                </button>
                <button
                  className={styles.dialogCancelBtn}
                  onClick={() => setConfirmDeleteId(null)}
                >
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
