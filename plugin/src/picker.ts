// Building a question (PLAN.md §4.3): three wrong answers for the word the
// queue (src/queue.ts) puts first, and what the card shows.

import type { Deck, Word } from './deck'
import { languageOf } from './languages'
import { shuffled } from './random'
import type { Random } from './random'
import type { LingoQuestion } from '../types'

// Distractors within this many ranks of the target are preferred.
export const NEAR_RANKS = 100

// "to be (state)" and "To be" both mean "be": two glosses overlap when any of
// their meanings, so normalised, are the same.
function meanings(word: Word): Set<string> {
  return new Set(
    word.gloss.map(g =>
      g
        .toLowerCase()
        .replace(/\(.*?\)/g, '')
        .replace(/^to\s+/, '')
        .trim(),
    ),
  )
}

function overlaps(a: Word, b: Word): boolean {
  const theirs = meanings(b)
  for (const m of meanings(a)) if (theirs.has(m)) return true
  return false
}

// Three wrong answers for `target`, or null when the deck cannot supply them:
// same part of speech, preferring words within NEAR_RANKS, never one whose
// meaning overlaps the target's or another pick's.
export function pickDistractors(deck: Deck, target: Word, random: Random): Word[] | null {
  const candidates = deck.words.filter(
    w => w.id !== target.id && w.pos === target.pos && !overlaps(w, target),
  )
  const near = shuffled(candidates.filter(w => Math.abs(w.rank - target.rank) <= NEAR_RANKS), random)
  const far = shuffled(candidates.filter(w => Math.abs(w.rank - target.rank) > NEAR_RANKS), random)
  const picked: Word[] = []
  for (const w of [...near, ...far]) {
    if (picked.length === 3) break
    if (picked.some(p => overlaps(p, w))) continue
    picked.push(w)
  }

  return picked.length === 3 ? picked : null
}

// What the card shows for a word: the first gloss, with its note when it has one.
export function choiceText(word: Word): string {
  const gloss = word.gloss[0] ?? word.lemma
  return word.note ? `${gloss} (${word.note})` : gloss
}

// The word as the card shows it: a noun with its article, its own (el agua, l'homme) or its
// language's for its gender; no space after an elided one (l').
export function promptText(word: Word, language: string): string {
  if (word.pos !== 'noun') return word.lemma
  const article = word.article ?? (word.gender === undefined ? undefined : languageOf(language).articles[word.gender])
  if (article === undefined) return word.lemma
  return article.endsWith("'") || article.endsWith('’') ? `${article}${word.lemma}` : `${article} ${word.lemma}`
}

// A whole question: the first queued word (src/queue.ts) that has three
// distractors, its answers shuffled; null when none of them can be asked.
export function questionFrom(deck: Deck, queued: readonly { word: Word; isExtra: boolean; tag?: 'new' | 'again' | 'practice' | 'drill' }[], random: Random): LingoQuestion | null {
  for (const { word, isExtra, tag } of queued) {
    const wrong = pickDistractors(deck, word, random)
    if (wrong === null) continue
    const order = shuffled([word, ...wrong], random)

    return {
      wordId: word.id,
      prompt: promptText(word, deck.language),
      pos: word.pos,
      choices: order.map(choiceText),
      answer: order.indexOf(word),
      isExtra,
      ...(tag ? { tag } : {}),
    }
  }

  return null
}
