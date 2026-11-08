// What to ask next (PLAN.md §5.3), in order:
//   1. learning and relearning words that are due (minutes-long steps), the earliest first;
//   2. review words that are due, the most overdue first;
//   3. new words from the chunk being learned (from the whole deck in whole-deck mode), most
//      common first, while today's new-word limit lasts (no limit for a chunk the person
//      chose to practice);
//   4. extra practice: a word already seen, at random. It counts, but does not move its
//      schedule (the mod shows a card on every turn, so it never just goes quiet).
// The word asked last goes to the end, so it is never asked twice in a row while
// another can be.

import type { Deck, Word } from './deck'
import { srsOf, type CardsByWord } from './progress'
import { shuffled, type Random } from './random'

export const NEW_PER_DAY = 10

export type QueueContext = {
  deck: Deck
  cards: CardsByWord
  now: number
  chunk: number // the automatic chunk: words up to it are in play
  focus: number | null // a chunk chosen to practice: only its words
  newToday: number // new words already introduced today
  newPerDay?: number // the person's limit (NEW_PER_DAY unless set)
  drill?: string[] // a drill under way: the word ids still to get right, in order
  lastId?: string
  wholeDeck?: boolean // every word in play, new ones from anywhere in the deck, most common first
}

// Why a word is asked, as the card's tag shows it: a new word, one back because it was
// missed, extra practice; none for an ordinary review.
export type QueueTag = 'new' | 'again' | 'practice' | 'drill'
export type Queued = { word: Word; isExtra: boolean; tag?: QueueTag }

export function queueOrder(ctx: QueueContext, random: Random): Queued[] {
  // A drill (the Stats page's "drill these"): only its words still to get right, in its
  // order, answered for real (they schedule as usual); the last asked to the end.
  if (ctx.drill !== undefined && ctx.drill.length > 0) {
    const words = ctx.drill.flatMap(id => ctx.deck.words.filter(w => w.id === id)).map(word => ({ word, isExtra: false, tag: 'drill' as const }))
    return [...words.filter(q => q.word.id !== ctx.lastId), ...words.filter(q => q.word.id === ctx.lastId)]
  }
  const isWhole = ctx.wholeDeck === true // a chunk chosen to practice still limits inPlay to it
  const inPlay = ctx.deck.words.filter(w => (ctx.focus !== null ? w.chunk === ctx.focus : isWhole || w.chunk <= ctx.chunk))
  const withSrs = inPlay.map(word => ({ word, srs: srsOf(ctx.cards[word.id], ctx.now) }))
  const due = (states: string[]) =>
    withSrs.filter(x => states.includes(x.srs.state) && x.srs.due <= ctx.now).sort((a, b) => a.srs.due - b.srs.due || a.word.rank - b.word.rank)
  const learning = due(['learning', 'relearning'])
  const reviews = due(['review'])
  const newChunk = ctx.focus ?? ctx.chunk
  const room = ctx.focus !== null ? Infinity : Math.max(0, (ctx.newPerDay ?? NEW_PER_DAY) - ctx.newToday)
  const fresh = withSrs.filter(x => x.srs.state === 'new' && (isWhole || x.word.chunk === newChunk)).sort((a, b) => a.word.rank - b.word.rank).slice(0, room)
  const missed = (x: { word: Word; srs: { state: string } }) => x.srs.state === 'relearning' || (ctx.cards[x.word.id]?.wrong ?? 0) > 0
  const scheduled: Queued[] = [
    ...learning.map(x => ({ word: x.word, isExtra: false, ...(missed(x) ? { tag: 'again' as const } : {}) })),
    ...reviews.map(x => ({ word: x.word, isExtra: false })),
    ...fresh.map(x => ({ word: x.word, isExtra: false, tag: 'new' as const })),
  ]
  const asked = new Set(scheduled.map(q => q.word.id))
  const seen = withSrs.filter(x => x.srs.state !== 'new' && !asked.has(x.word.id))
  const extra = shuffled(seen.length > 0 ? seen : withSrs.filter(x => !asked.has(x.word.id)), random).map(x => ({ word: x.word, isExtra: true, tag: 'practice' as const }))
  const order = [...scheduled, ...extra]

  return [...order.filter(q => q.word.id !== ctx.lastId), ...order.filter(q => q.word.id === ctx.lastId)]
}

// When today started, in local time: `offsetMinutes` is the local zone's offset as
// Date.getTimezoneOffset gives it (minutes behind UTC), so a test can fix it.
const DAY = 86_400_000
export function localDayStart(now: number, offsetMinutes: number): number {
  const local = now - offsetMinutes * 60_000
  return Math.floor(local / DAY) * DAY + offsetMinutes * 60_000
}

// How many new words were introduced since `since` (today's start).
export function newSince(cards: CardsByWord, since: number): number {
  return Object.values(cards).filter(c => c.srs?.firstReview !== undefined && c.srs.firstReview >= since).length
}
