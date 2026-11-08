// The decks the mod carries, by language code: a language is offered on the first-run screen
// and in Settings once its deck is here (README "Building a deck" makes one).

import { deck as es } from '../data/es/deck'
import { deck as fr } from '../data/fr/deck'
import { deck as it } from '../data/it/deck'
import { deck as pt } from '../data/pt/deck'
import type { Deck } from './deck'
import { LANGUAGES, type Language } from './languages'

export const DECKS: Record<string, Deck> = { es, fr, it, pt }

// The languages with a deck, in the order LANGUAGES lists them.
export const offered = (): Language[] => Object.values(LANGUAGES).filter(l => DECKS[l.code] !== undefined)

// The deck for a language; an unknown one, or one without a deck, gets Spanish's.
export const deckFor = (code: unknown): Deck => (typeof code === 'string' ? DECKS[code] : undefined) ?? es
