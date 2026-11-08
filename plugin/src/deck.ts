// The shape of a word deck (PLAN.md §2.3).

export type PartOfSpeech =
  | 'noun' | 'verb' | 'adj' | 'adv' | 'pron' | 'prep' | 'conj' | 'det' | 'num' | 'interj'

export type Word = {
  id: string // stable, lemma-based: survives re-ranking
  rank: number // frequency rank, 1 = most common
  lemma: string
  pos: PartOfSpeech
  gender?: 'm' | 'f' // nouns: their article, unless `article` gives it
  article?: string // nouns: the article as written before it, where not its gender's (el agua, l'homme)
  gloss: string[] // the first is shown on cards
  note?: string // tells near-identical glosses apart
  forms?: string[] // the commonest forms in the frequency list, most common first
  example?: { text: string; en: string } // one short sentence in the deck's language, and its English; not shown on cards yet
  chunk: number
}

export type Deck = {
  language: string
  deckVersion: number
  source: string
  words: Word[]
}
