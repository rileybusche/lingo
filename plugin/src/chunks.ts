// Moving on through the deck's chunks (PLAN.md §3): a chunk is done when most
// of its words are learned, and the next one opens. "Learned" is the
// scheduler's "known" (src/progress.ts, isKnown): in review with a week's
// stability. Until Phase 2 it was "right twice, more often right than wrong".

import type { Deck } from './deck'
import { isKnown, readCards, type WordProgress } from './progress'

export const ADVANCE_SHARE = 0.8 // the share of a chunk learned that opens the next

export function isLearned(record: WordProgress | undefined): boolean {
  return isKnown(record)
}

export function chunkCount(deck: Deck): number {
  return deck.words.reduce((most, w) => Math.max(most, w.chunk), 0)
}

export type ChunkProgress = { chunk: number; learned: number; total: number; first: number; last: number }

// How much of one chunk is learned, and the ranks it spans.
export function chunkProgress(deck: Deck, stored: unknown, chunk: number): ChunkProgress {
  const cards = readCards(stored)
  const words = deck.words.filter(w => w.chunk === chunk)
  return {
    chunk,
    learned: words.filter(w => isLearned(cards[w.id])).length,
    total: words.length,
    first: words[0]?.rank ?? 0,
    last: words.at(-1)?.rank ?? 0,
  }
}

// The words needed to open the next chunk: the person's number (of a 50-word chunk) when
// set, else ADVANCE_SHARE of it, rounded up; never more than the chunk holds.
export const neededToAdvance = (total: number, toOpen?: number) =>
  Math.min(total, toOpen ?? Math.ceil(total * ADVANCE_SHARE))

// The chunk to be in: `current`, moved on past every chunk already done. Never
// moves back, so a wrong answer cannot take an opened chunk away; never past
// the last chunk.
export function advancedChunk(deck: Deck, stored: unknown, current: number, toOpen?: number): number {
  const last = chunkCount(deck)
  let chunk = Math.min(Math.max(1, current), last)
  while (chunk < last) {
    const p = chunkProgress(deck, stored, chunk)
    if (p.learned < neededToAdvance(p.total, toOpen)) break
    chunk++
  }
  return chunk
}

// The chunk saved in the profile for one language; 1 until one is saved.
export function savedChunk(profile: unknown, language: string): number {
  const chunks = (profile as { chunks?: Record<string, unknown> } | undefined)?.chunks
  const n = chunks?.[language]
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : 1
}

// The profile with one language's chunk set, everything else kept.
export function withChunk(profile: unknown, language: string, chunk: number): Record<string, unknown> {
  const p = (profile ?? {}) as Record<string, unknown>
  const chunks = (p.chunks ?? {}) as Record<string, unknown>
  return { ...p, schemaVersion: (p.schemaVersion as number | undefined) ?? 1, chunks: { ...chunks, [language]: chunk } }
}

// The chunk the person chose to practice for one language (PLAN.md §3, step 2):
// cards come from it alone until they go back to automatic. Null when none is
// chosen, or the saved one is not a chunk of this deck.
export function savedFocus(profile: unknown, language: string, chunks: number): number | null {
  const focus = (profile as { focus?: Record<string, unknown> } | undefined)?.focus
  const n = focus?.[language]
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= chunks ? n : null
}

// The profile with one language's focus set (a chunk) or cleared (null).
export function withFocus(profile: unknown, language: string, chunk: number | null): Record<string, unknown> {
  const p = (profile ?? {}) as Record<string, unknown>
  const { [language]: _, ...others } = (p.focus ?? {}) as Record<string, unknown>
  const focus = chunk === null ? others : { ...others, [language]: chunk }
  return { ...p, schemaVersion: (p.schemaVersion as number | undefined) ?? 1, focus }
}

// How one chunk's words stand: learned, seen but not learned yet, not seen.
export type WordStanding = 'learned' | 'seen' | 'new'
export function standing(record: WordProgress | undefined): WordStanding {
  if (isLearned(record)) return 'learned'
  // Seen: answered, or studied with its meaning shown (a schedule but no answers yet).
  return record !== undefined && (record.seen > 0 || (record.srs !== undefined && record.srs.state !== 'new')) ? 'seen' : 'new'
}

// A chunk's bar in `cells`: learned, then seen but not learned, then the rest.
// A part that is not zero gets at least one cell, so 1 of 50 still shows.
export type BarCells = { learned: number; seen: number; rest: number }
export function barCells(learned: number, seen: number, total: number, cells: number): BarCells {
  if (total <= 0) return { learned: 0, seen: 0, rest: cells }
  const atLeastOne = (n: number, share: number) => (n > 0 ? Math.max(1, Math.round(share * cells)) : 0)
  const l = Math.min(cells, atLeastOne(learned, learned / total))
  const s = Math.min(cells - l, atLeastOne(seen, seen / total))
  return { learned: l, seen: s, rest: cells - l - s }
}
