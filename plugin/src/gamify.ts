// Phase 3a (PLAN.md §6.1, §6.2, §6.4): XP and levels, a per-day log, and the daily
// streak with freezes. Pure functions over stored values, as src/progress.ts is.

// ---- XP (§6.1) ----------------------------------------------------------------------

export const XP = { newRight: 10, reviewRight: 5, wrong: 1 } as const
export const RUN_FOR_BONUS = 5 // right answers in a row that earn the bonus
export const RUN_BONUS = 1.5
export const EXTRA_SHARE = 0.5 // extra practice earns half

export type XpAnswer = {
  isCorrect: boolean
  wasNew: boolean // the word had never been answered
  isExtra: boolean // extra practice: nothing was due
  isRevealed: boolean // its meaning was shown first: studied, not answered
  run: number // right answers in a row, this one included
}

// XP for one answer: right on a new word 10, on a review 5, wrong 1 (showing up counts);
// ×1.5 from the fifth right answer in a row; extra practice half; a shown meaning none.
export function xpFor(a: XpAnswer): number {
  if (a.isRevealed) return 0
  const base = !a.isCorrect ? XP.wrong : a.wasNew ? XP.newRight : XP.reviewRight
  const bonus = a.isCorrect && a.run >= RUN_FOR_BONUS ? RUN_BONUS : 1
  const share = a.isExtra ? EXTRA_SHARE : 1
  return Math.max(1, Math.round(base * bonus * share))
}

// ---- Levels (§6.1) ------------------------------------------------------------------

// XP to go from level n to n + 1: 50 · n^1.6, rounded.
export const xpToNext = (level: number) => Math.round(50 * Math.pow(level, 1.6))

export type Level = { level: number; into: number; need: number }

// The level a total of XP reaches, how far into it, and what the next one needs.
export function levelOf(totalXp: number): Level {
  let level = 1
  let left = Math.max(0, Math.floor(totalXp))
  while (left >= xpToNext(level)) {
    left -= xpToNext(level)
    level++
  }
  return { level, into: left, need: xpToNext(level) }
}

// ---- The day log (§6.4) -------------------------------------------------------------

// One local day: cards answered (a shown meaning included: the day's work), right ones,
// graded ones (for accuracy: a shown meaning excluded), new words, XP; and the right and
// graded ones in each language, for each language's accuracy.
export type Graded = { correct: number; graded: number }
export type Day = { answered: number; correct: number; graded: number; fresh: number; xp: number; langs: Record<string, Graded> }
export type DayLog = Record<string, Day> // by local date, YYYY-MM-DD
export const KEEP_DAYS = 90

const MIN = 60_000
const DAY_MS = 86_400_000
const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0)
const DATE = /^\d{4}-\d{2}-\d{2}$/

// The local date of `now`, `offsetMinutes` as Date.getTimezoneOffset gives it.
export function localDate(now: number, offsetMinutes: number): string {
  return new Date(now - offsetMinutes * MIN).toISOString().slice(0, 10)
}

// Milliseconds from `now` to the next local midnight (a second past it, so the new date is
// read), `offsetMinutes` as Date.getTimezoneOffset gives it.
export function msToMidnight(now: number, offsetMinutes: number): number {
  const local = now - offsetMinutes * MIN
  return Math.ceil((local + 1) / DAY_MS) * DAY_MS - local + 1000
}

// Whole days from one date to another (YYYY-MM-DD).
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

export function readDays(stored: unknown): DayLog {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return {}
  const out: DayLog = {}
  for (const [date, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (!DATE.test(date) || raw === null || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const day = { answered: count(r.answered), correct: count(r.correct), graded: count(r.graded), fresh: count(r.fresh), xp: count(r.xp) }
    out[date] = { ...day, langs: readLangs(r.langs, day) }
  }
  return out
}

// A day's right and graded answers by language. A day logged before there was more than one
// language (until 2026-10-29) has none: its answers were all Spanish.
function readLangs(raw: unknown, day: Graded): Record<string, Graded> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return day.graded > 0 ? { es: { correct: day.correct, graded: day.graded } } : {}
  const out: Record<string, Graded> = {}
  for (const [code, g] of Object.entries(raw as Record<string, unknown>)) {
    const r = (g ?? {}) as Record<string, unknown>
    out[code] = { correct: count(r.correct), graded: count(r.graded) }
  }
  return out
}

// The log with `delta` added to `date` (its right and graded answers also to `language`'s),
// and days older than KEEP_DAYS dropped.
export function withDay(stored: unknown, date: string, delta: Partial<Omit<Day, 'langs'>> & { language?: string }): DayLog {
  const log = readDays(stored)
  const was = log[date] ?? { answered: 0, correct: 0, graded: 0, fresh: 0, xp: 0, langs: {} }
  const langs = { ...was.langs }
  if (delta.language !== undefined && (delta.correct || delta.graded)) {
    const had = langs[delta.language] ?? { correct: 0, graded: 0 }
    langs[delta.language] = { correct: had.correct + (delta.correct ?? 0), graded: had.graded + (delta.graded ?? 0) }
  }
  log[date] = {
    answered: was.answered + (delta.answered ?? 0),
    correct: was.correct + (delta.correct ?? 0),
    graded: was.graded + (delta.graded ?? 0),
    fresh: was.fresh + (delta.fresh ?? 0),
    xp: was.xp + (delta.xp ?? 0),
    langs,
  }
  for (const d of Object.keys(log)) if (daysBetween(d, date) >= KEEP_DAYS) delete log[d]
  return log
}

// Two logs merged (an import): per day and field, the larger, so importing the same file
// twice, or a machine's own export, never double-counts a day.
export function mergeDays(mine: unknown, theirs: unknown): DayLog {
  const a = readDays(mine)
  const b = readDays(theirs)
  const out: DayLog = { ...a }
  for (const [date, day] of Object.entries(b)) {
    const have = out[date]
    const langs: Record<string, Graded> = { ...(have?.langs ?? {}) }
    for (const [code, g] of Object.entries(day.langs)) {
      const h = langs[code]
      langs[code] = h === undefined ? g : { correct: Math.max(h.correct, g.correct), graded: Math.max(h.graded, g.graded) }
    }
    out[date] = have === undefined ? day : {
      answered: Math.max(have.answered, day.answered),
      correct: Math.max(have.correct, day.correct),
      graded: Math.max(have.graded, day.graded),
      fresh: Math.max(have.fresh, day.fresh),
      xp: Math.max(have.xp, day.xp),
      langs,
    }
  }
  return out
}

// ---- The daily streak (§6.2) --------------------------------------------------------

export const DAILY_GOAL = 10 // cards answered that make a day count
export const FREEZE_EVERY = 7 // a streak this long earns a freeze
export const MAX_FREEZES = 2

export type Streak = { days: number; lastDay: string | null; freezes: number }
export const noStreak = (): Streak => ({ days: 0, lastDay: null, freezes: 0 })

// A day just reached the goal (call once, when it does): the streak grows by one if the
// last counted day was yesterday, or if freezes cover the days missed between (each
// covered day uses one); otherwise it starts again at 1. Every FREEZE_EVERY days earns a
// freeze, up to MAX_FREEZES.
export function withDayCounted(s: Streak, today: string): Streak {
  if (s.lastDay === today) return s
  const gap = s.lastDay === null ? Infinity : daysBetween(s.lastDay, today)
  const missed = gap - 1
  let days: number
  let freezes = s.freezes
  if (gap === 1) days = s.days + 1
  else if (Number.isFinite(missed) && missed > 0 && missed <= s.freezes) {
    freezes -= missed
    days = s.days + 1
  } else days = 1
  if (days % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1)
  return { days, lastDay: today, freezes }
}

// The streak as it stands today: still alive while the last counted day was today or
// yesterday, or the days missed since are covered by freezes; else 0.
export function streakNow(s: Streak, today: string): number {
  if (s.lastDay === null) return 0
  const gap = daysBetween(s.lastDay, today)
  return gap <= 1 || gap - 1 <= s.freezes ? s.days : 0
}

export function readStreak(stored: unknown): Streak {
  const r = stored !== null && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  const last = typeof r.lastDay === 'string' && DATE.test(r.lastDay) ? r.lastDay : null
  return { days: count(r.days), lastDay: last, freezes: Math.min(MAX_FREEZES, count(r.freezes)) }
}
