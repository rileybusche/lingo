// What the store keeps across sessions (PLAN.md §2.4), as pure functions over
// the stored values: the hooks module reads a key, calls one of these, and
// writes the result straight back, so two windows lose nothing between them.

import { AGAIN, GOOD, HARD, initDifficulty, newSrs, schedule, type Rating, type Srs, type SrsState } from './fsrs'
import { readStreak, type Streak } from './gamify'
import { readEarned, type Earned } from './badges'

export const SCHEMA_VERSION = 1

// One word's record: Phase 1's counts (PLAN.md §4.5), and from Phase 2 its
// schedule (§5.4). A record without `srs` is from Phase 1; srsOf gives it one.
export type WordProgress = { seen: number; correct: number; wrong: number; lastSeen: number; srs?: Srs }
export type CardsByWord = Record<string, WordProgress>
// `streak` is right answers in a row (the XP bonus; named before Phase 3, kept so stored
// values read on); `xp` all XP earned; `daily` the daily streak and its freezes (§6.2).
export type Stats = { streak: number; xp: number; daily: Streak; badges: Earned }
export type Profile = { schemaVersion: number; view?: 'pane' | 'band' } & Record<string, unknown>

export const cardsKey = (language: string) => `cards:${language}`

const count = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0)

// The stored map, every malformed entry dropped (a hand edit, a bad write).
export function readCards(stored: unknown): CardsByWord {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return {}
  const out: CardsByWord = {}
  for (const [id, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (raw === null || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const srs = readSrs(r.srs)
    out[id] = { seen: count(r.seen), correct: count(r.correct), wrong: count(r.wrong), lastSeen: count(r.lastSeen), ...(srs ? { srs } : {}) }
  }
  return out
}

const STATES: readonly SrsState[] = ['new', 'learning', 'review', 'relearning']
const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null)

// A stored schedule, or undefined when it is missing or malformed (the word is
// then scheduled afresh from its counts, as a Phase 1 record is).
function readSrs(raw: unknown): Srs | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const fields = [r.due, r.stability, r.difficulty, r.reps, r.lapses, r.step, r.scheduledDays].map(num)
  if (!STATES.includes(r.state as SrsState) || fields.some(f => f === null)) return undefined
  const [due, stability, difficulty, reps, lapses, step, scheduledDays] = fields as number[]
  const lastReview = num(r.lastReview)
  const firstReview = num(r.firstReview)
  return {
    state: r.state as SrsState,
    due: due as number,
    stability: stability as number,
    difficulty: difficulty as number,
    reps: reps as number,
    lapses: lapses as number,
    step: step as number,
    scheduledDays: scheduledDays as number,
    ...(lastReview !== null ? { lastReview } : {}),
    ...(firstReview !== null ? { firstReview } : {}),
  }
}

// A Phase 1 word's starting schedule (PLAN.md §5.4), worked out when it is read
// rather than written in one go, so nothing is migrated in place: right twice
// and more often right than wrong, a review with three days' stability; seen
// otherwise, a learning card; both due now, so they are checked soon, with a
// difficulty from how often they were right. Never seen: new.
export const MIGRATED_STABILITY = 3
export function srsOf(record: WordProgress | undefined, now: number): Srs {
  if (record?.srs) return record.srs
  if (record === undefined || record.seen === 0) return newSrs(now)
  const ratio = record.correct / record.seen
  const hardest = initDifficulty(AGAIN) // FSRS's first difficulty after Again
  const easiest = initDifficulty(GOOD) // and after Good
  const difficulty = Math.round((hardest - (hardest - easiest) * ratio) * 1e8) / 1e8
  const wasLearned = record.correct >= 2 && record.correct > record.wrong
  return {
    state: wasLearned ? 'review' : 'learning',
    due: now,
    stability: wasLearned ? MIGRATED_STABILITY : 0.212,
    difficulty,
    reps: record.seen,
    lapses: 0,
    step: 0,
    scheduledDays: wasLearned ? MIGRATED_STABILITY : 0,
    lastReview: record.lastSeen,
    // Introduced back in Phase 1: answering it now does not use up today's new words.
    firstReview: record.lastSeen,
  }
}

// A word is known (PLAN.md §5.3) once it is in review with a week's stability:
// the scheduler expects you to still recall it after seven days.
export const KNOWN_STABILITY = 7
export const isKnown = (record: WordProgress | undefined) => {
  const srs = record?.srs ?? (record ? srsOf(record, 0) : undefined)
  return srs !== undefined && srs.state === 'review' && srs.stability >= KNOWN_STABILITY
}

// The rating an answer gives (PLAN.md §5.2, changed 2026-10-15): wrong is Again;
// right after missing the word earlier this session is Hard; right is Good. No
// timing: a card waits while the person reads or types, so time to answer
// measures attention, not memory.
export const ratingFor = (isCorrect: boolean, missedThisSession: boolean): Rating =>
  !isCorrect ? AGAIN : missedThisSession ? HARD : GOOD

// The map with one answer added to `wordId`, on top of whatever was stored:
// its counts, and its schedule moved on by `rating`. An extra-practice answer
// (`rating` null) counts but leaves the schedule as it was.
export function withAnswer(stored: unknown, wordId: string, isCorrect: boolean, now: number, rating: Rating | null = null, recall?: number): CardsByWord {
  const cards = readCards(stored)
  const was = cards[wordId] ?? { seen: 0, correct: 0, wrong: 0, lastSeen: 0 }
  const srs = rating === null ? was.srs : schedule(srsOf(was, now), rating, now, recall)
  cards[wordId] = {
    seen: was.seen + 1,
    correct: was.correct + (isCorrect ? 1 : 0),
    wrong: was.wrong + (isCorrect ? 0 : 1),
    lastSeen: now,
    ...(srs ? { srs } : {}),
  }
  return cards
}

// The map with `wordId` studied rather than answered: its meaning was shown before
// the answer, so its counts stay as they were and it is scheduled as missed (Again),
// back in a minute to be tried without help.
export function withStudied(stored: unknown, wordId: string, now: number, recall?: number): CardsByWord {
  const cards = readCards(stored)
  const was = cards[wordId] ?? { seen: 0, correct: 0, wrong: 0, lastSeen: 0 }
  cards[wordId] = { ...was, lastSeen: now, srs: schedule(srsOf(was, now), AGAIN, now, recall) }
  return cards
}

export function readStats(stored: unknown): Stats {
  const s = stored !== null && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  return { streak: count(s.streak), xp: count(s.xp), daily: readStreak(s.daily), badges: readEarned(s.badges) }
}

// A right answer extends the streak, a wrong one ends it.
export function withStreak(stored: unknown, isCorrect: boolean): Stats {
  const stats = readStats(stored)
  return { ...stats, streak: isCorrect ? stats.streak + 1 : 0 }
}

// The profile brought up to SCHEMA_VERSION, or null when it needs no write:
// it is current, or from a newer version of the mod (never downgraded).
export function migratedProfile(stored: unknown): Profile | null {
  const p = stored !== null && typeof stored === 'object' && !Array.isArray(stored)
    ? (stored as Record<string, unknown>)
    : {}
  const version = typeof p.schemaVersion === 'number' ? p.schemaVersion : 0
  if (version >= SCHEMA_VERSION) return null
  // 0 → 1: the first versioned profile; a view outside pane/band is dropped.
  const { view, ...rest } = p
  const kept: Partial<Profile> = view === 'pane' || view === 'band' ? { view } : {}
  return { ...rest, ...kept, schemaVersion: SCHEMA_VERSION }
}

export type Totals = { correct: number; answered: number }

// All-time right answers over all answers, from the per-word records.
export function totals(stored: unknown): Totals {
  let correct = 0
  let answered = 0
  for (const card of Object.values(readCards(stored))) {
    correct += card.correct
    answered += card.seen
  }
  return { correct, answered }
}
