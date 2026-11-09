// The placement test (PLAN.md §3): a binary search over the deck's chunks. Each round asks
// PER_ROUND words from one chunk; PASS of them right passes it. The search keeps the
// highest chunk passed (`lo`, 0 for none) and the lowest failed (`hi`, one past the last
// for none), and probes halfway between, so ROUNDS rounds pin the chunk to start at.
// "I don't know" counts as wrong: a blind guess among four is right a quarter of the time.

import type { Deck } from './deck'
import type { Placement } from '../types'
import { AGAIN, GOOD, initDifficulty, newSrs, schedule, type Srs } from './fsrs'
import { KNOWN_STABILITY, readCards, type CardsByWord } from './progress'

export const ROUNDS = 5
export const PER_ROUND = 4
export const PASS = 3
export const SPREAD_DAYS = 21 // the placed words' first reviews, spread over three weeks


const mid = (lo: number, hi: number) => Math.floor((lo + hi) / 2)

export function startPlacement(chunks: number): Placement {
  return { chunks, lo: 0, hi: chunks + 1, probe: mid(0, chunks + 1), round: 1, asked: 0, right: 0, used: [], missed: [], result: null }
}

// One answer (`isRight` false for "I don't know"). A round's last answer moves the search,
// and the test ends after ROUNDS rounds, or once the passed and failed chunks are adjacent.
export function withPlacementAnswer(p: Placement, wordId: string, isRight: boolean): Placement {
  if (p.result !== null) return p
  const next: Placement = {
    ...p,
    asked: p.asked + 1,
    right: p.right + (isRight ? 1 : 0),
    used: [...p.used, wordId],
    missed: isRight ? p.missed : [...p.missed, wordId],
  }
  if (next.asked < PER_ROUND) return next
  const passed = next.right >= PASS
  const lo = passed ? next.probe : next.lo
  const hi = passed ? next.hi : next.probe
  if (next.round >= ROUNDS || hi - lo <= 1) return { ...next, lo, hi, result: Math.min(lo + 1, p.chunks) }
  return { ...next, lo, hi, probe: mid(lo, hi), round: next.round + 1, asked: 0, right: 0 }
}

// The question number, 1-based, out of ROUNDS × PER_ROUND (the test can end sooner).
export const questionNumber = (p: Placement) => (p.round - 1) * PER_ROUND + p.asked + 1
export const QUESTIONS = ROUNDS * PER_ROUND

// A placed word's record: in review with a week's stability, so it counts as learned and
// comes back to be checked. Not answered, so no counts. `firstReview` 0: never one of a
// day's new words (src/queue.ts newSince counts from today's start).
function placedSrs(now: number, dueDays: number): Srs {
  return {
    state: 'review',
    due: now + dueDays * 86_400_000,
    stability: KNOWN_STABILITY,
    difficulty: initDifficulty(GOOD),
    reps: 0,
    lapses: 0,
    step: 0,
    scheduledDays: dueDays,
    lastReview: now,
    firstReview: 0,
  }
}

// The words before chunk `start` with no record yet: placed as probably known, their first
// reviews spread over SPREAD_DAYS, the rarest (nearest the start chunk, least sure) first.
// A word the test missed is left to be learned instead: due now, in learning. A word
// already answered is never touched.
export function withPlacement(deck: Deck, stored: unknown, start: number, missed: readonly string[], now: number): CardsByWord {
  const cards = readCards(stored)
  const before = deck.words.filter(w => w.chunk < start && cards[w.id] === undefined)
  const toPlace = before.filter(w => !missed.includes(w.id)).sort((a, b) => b.rank - a.rank)
  toPlace.forEach((w, i) => {
    const dueDays = 1 + Math.floor((i * SPREAD_DAYS) / toPlace.length)
    cards[w.id] = { seen: 0, correct: 0, wrong: 0, lastSeen: 0, srs: placedSrs(now, dueDays) }
  })
  for (const w of before.filter(w => missed.includes(w.id))) {
    cards[w.id] = { seen: 0, correct: 0, wrong: 0, lastSeen: 0, srs: { ...schedule(newSrs(now), AGAIN, now), firstReview: 0 } }
  }
  return cards
}

// How many words the result places (for the results screen, before anything is saved).
export function placedCount(deck: Deck, stored: unknown, start: number, missed: readonly string[]): number {
  const cards = readCards(stored)
  return deck.words.filter(w => w.chunk < start && cards[w.id] === undefined && !missed.includes(w.id)).length
}
