// What each part of speech is, for the hover tip on a card's "(noun)" tag.

import type { PartOfSpeech } from './deck'

export const POS_HELP: Record<PartOfSpeech, { name: string; help: string }> = {
  noun: { name: 'noun', help: 'a person, place, thing or idea' },
  verb: { name: 'verb', help: 'an action or a state, like "to run" or "to be"' },
  adj: { name: 'adjective', help: 'describes a noun, like "big" or "red"' },
  adv: { name: 'adverb', help: 'says how, when or where, like "quickly" or "here"' },
  pron: { name: 'pronoun', help: 'stands in for a noun, like "I", "she" or "it"' },
  prep: { name: 'preposition', help: 'links a word to a place, time or direction, like "in" or "to"' },
  conj: { name: 'conjunction', help: 'joins words or phrases, like "and" or "but"' },
  det: { name: 'determiner', help: 'comes before a noun to point at it, like "the" or "my"' },
  num: { name: 'number', help: 'a count or an order, like "two" or "third"' },
  interj: { name: 'interjection', help: 'an exclamation or greeting, like "hello" or "wow"' },
}

// The part of speech's full name, for the band's one-line tip: "adjective".
export function posName(pos: string): string {
  return (POS_HELP as Record<string, { name: string } | undefined>)[pos]?.name ?? pos
}

// The tip's text: "noun: a person, place, thing or idea". A question's pos is a
// string in the saved state, so an unknown one names itself.
export function posTipText(pos: string): string {
  const entry = (POS_HELP as Record<string, { name: string; help: string } | undefined>)[pos]
  return entry === undefined ? pos : `${entry.name}: ${entry.help}`
}
