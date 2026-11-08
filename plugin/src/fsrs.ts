// Spaced repetition (PLAN.md §5): FSRS-6, the scheduler Anki uses, with its
// published default parameters. Our own small version of the reference library
// (ts-fsrs 5.4.2, MIT, open-spaced-repetition), held to its exact numbers by
// tests/fsrs.test.ts against fixtures the library itself produced
// (scripts/fsrs-fixtures.mjs). Written here rather than vendored: the library
// adds methods to the built-in Date, and is 1,900 lines; this works on our
// saved records directly, times as epoch ms. Decided 2026-10-15.

export type Rating = 1 | 2 | 3 | 4 // again, hard, good, easy
export const AGAIN: Rating = 1
export const HARD: Rating = 2
export const GOOD: Rating = 3
export const EASY: Rating = 4

export type SrsState = 'new' | 'learning' | 'review' | 'relearning'

// One word's memory, as the scheduler keeps it.
export type Srs = {
  state: SrsState
  due: number // epoch ms
  stability: number // days until recall falls to 90%
  difficulty: number // 1 (easy) to 10
  reps: number
  lapses: number
  step: number // which learning step a learning or relearning card is on
  scheduledDays: number
  lastReview?: number // epoch ms
  firstReview?: number // epoch ms: when the word was first asked, for the daily new-word limit
}

export const newSrs = (now: number): Srs => ({ state: 'new', due: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, step: 0, scheduledDays: 0 })

// FSRS-6's default parameters, as ts-fsrs 5.4.2 ships them.
const W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 1e-3, 1.8722, 0.1666, 0.796, 1.4835, 0.0614,
  0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
] as const
const w = (i: number) => W[i] as number

// Our settings: target recall 0.92, because picking a word among four is easier than
// recalling it, so plain FSRS would space reviews too far (PLAN.md §5.2). No fuzz.
export const TARGET_RECALL = 0.92
const LEARNING_STEPS = [1, 10] // minutes
const RELEARNING_STEPS = [10]
const MAX_INTERVAL = 36500 // days
const S_MIN = 1e-3
const S_MAX = 36500

const MIN = 60_000
const DAY = 86_400_000
const round8 = (n: number) => Math.round(n * 1e8) / 1e8
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)

const DECAY = -w(20)
const FACTOR = round8(Math.exp(Math.log(0.9) / DECAY) - 1)
// Days per day of stability for a target recall (TARGET_RECALL unless a person set their own).
const intervalModifier = (recall: number) => round8((Math.pow(recall, 1 / DECAY) - 1) / FACTOR)

// The chance of recalling a word `days` after its last review.
export const retrievability = (days: number, stability: number) => round8(Math.pow(1 + (FACTOR * days) / stability, DECAY))

// Whole calendar days between two times, as the library counts them (UTC dates).
function daysBetween(from: number, to: number): number {
  const day = (t: number) => {
    const d = new Date(t)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  return Math.floor((day(to) - day(from)) / DAY)
}

const initStability = (g: Rating) => Math.max(w(g - 1), 0.1)
export const initDifficulty = (g: Rating) => round8(w(4) - Math.exp((g - 1) * w(5)) + 1)

function nextDifficulty(d: number, g: Rating): number {
  const delta = -w(6) * (g - 3)
  const next = d + round8((delta * (10 - d)) / 9)
  return clamp(round8(w(7) * initDifficulty(EASY) + (1 - w(7)) * next), 1, 10)
}

function recallStability(d: number, s: number, r: number, g: Rating): number {
  const hard = g === HARD ? w(15) : 1
  const easy = g === EASY ? w(16) : 1
  return round8(clamp(s * (1 + Math.exp(w(8)) * (11 - d) * Math.pow(s, -w(9)) * (Math.exp((1 - r) * w(10)) - 1) * hard * easy), S_MIN, S_MAX))
}

const forgetStability = (d: number, s: number, r: number) =>
  round8(clamp(w(11) * Math.pow(d, -w(12)) * (Math.pow(s + 1, w(13)) - 1) * Math.exp((1 - r) * w(14)), S_MIN, S_MAX))

function shortTermStability(s: number, g: Rating): number {
  const sinc = Math.pow(s, -w(19)) * Math.exp(w(17) * (g - 3 + w(18)))
  return round8(clamp(s * (g >= HARD ? Math.max(sinc, 1) : sinc), S_MIN, S_MAX))
}

// The memory after an answer `t` days after the last one.
function nextMemory(d: number, s: number, t: number, g: Rating, r?: number): { difficulty: number; stability: number } {
  if (d === 0 && s === 0) return { difficulty: clamp(initDifficulty(g), 1, 10), stability: initStability(g) }
  const recall = r ?? retrievability(t, s)
  let stability: number
  if (t === 0) stability = shortTermStability(s, g)
  else if (g === AGAIN) stability = clamp(round8(s / Math.exp(w(17) * w(18))), S_MIN, forgetStability(d, s, recall))
  else stability = recallStability(d, s, recall, g)
  return { difficulty: nextDifficulty(d, g), stability }
}

const intervalDays = (s: number, recall: number) => Math.min(Math.max(1, Math.round(s * intervalModifier(recall))), MAX_INTERVAL)

// A learning or relearning step's next wait, in minutes, and the step after it;
// null when the card leaves the steps for review.
function stepFor(state: SrsState, step: number, g: Rating): { minutes: number; next: number } | null {
  const steps = state === 'review' || state === 'relearning' ? RELEARNING_STEPS : LEARNING_STEPS
  if (step >= steps.length) return null
  const first = steps[0] as number
  if (state === 'review') return g === AGAIN ? { minutes: steps[Math.max(0, step)] as number, next: 0 } : null
  if (g === AGAIN) return { minutes: first, next: 0 }
  if (g === HARD) return { minutes: steps.length === 1 ? Math.round(first * 1.5) : Math.round((first + (steps[1] as number)) / 2), next: step }
  if (g === GOOD) {
    const following = steps[step + 1]
    return following === undefined ? null : { minutes: Math.round(following), next: step + 1 }
  }
  return null
}

// The card after one answer at `now`.
export function schedule(card: Srs, g: Rating, now: number, recall = TARGET_RECALL): Srs {
  const elapsed = card.state !== 'new' && card.lastReview !== undefined ? daysBetween(card.lastReview, now) : 0
  const base = { ...card, reps: card.reps + 1, lastReview: now, firstReview: card.firstReview ?? now }

  if (card.state === 'review') {
    const r = retrievability(elapsed, card.stability)
    const at = (rating: Rating) => nextMemory(card.difficulty, card.stability, elapsed, rating, r)
    if (g === AGAIN) {
      const memory = at(AGAIN)
      return withSteps({ ...base, ...memory, lapses: card.lapses + 1 }, card, AGAIN, 'relearning', now, recall)
    }
    // Hard below good below easy, at least a day apart, as the library spaces them.
    // (With these parameters Hard never comes out longer than Good, so the first
    // cap is the library's guard and cannot be reached; kept to match it.)
    let hard = intervalDays(at(HARD).stability, recall)
    let good = intervalDays(at(GOOD).stability, recall)
    hard = Math.min(hard, good)
    good = Math.max(good, hard + 1)
    const easy = Math.max(intervalDays(at(EASY).stability, recall), good + 1)
    const days = g === HARD ? hard : g === GOOD ? good : easy
    return { ...base, ...at(g), state: 'review', step: 0, scheduledDays: days, due: now + days * DAY }
  }

  const memory = nextMemory(card.difficulty, card.stability, elapsed, g)
  return withSteps({ ...base, ...memory }, card, g, card.state === 'new' ? 'learning' : card.state, now, recall)
}

// Puts a card on its next learning step, or graduates it to review.
function withSteps(next: Srs, was: Srs, g: Rating, toState: SrsState, now: number, recall: number): Srs {
  const step = stepFor(was.state, was.step ?? 0, g)
  const minutes = Math.max(0, step?.minutes ?? 0)
  if (minutes > 0 && minutes < 1440) {
    return { ...next, state: toState, step: step?.next ?? 0, scheduledDays: 0, due: now + Math.round(minutes) * MIN }
  }
  if (minutes >= 1440) {
    return { ...next, state: 'review', step: step?.next ?? 0, scheduledDays: Math.floor(minutes / 1440), due: now + Math.round(minutes) * MIN }
  }
  const days = intervalDays(next.stability, recall)
  return { ...next, state: 'review', step: 0, scheduledDays: days, due: now + days * DAY }
}
