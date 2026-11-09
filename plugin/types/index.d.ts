// Lingo's $.state contract.

export type LingoQuestion = {
  wordId: string
  prompt: string // the Spanish, with el/la for nouns
  pos: string
  choices: string[] // four English glosses, shuffled
  answer: number // index into choices
  isExtra?: boolean // extra practice: nothing was due; the answer counts but moves no schedule
  tag?: 'new' | 'again' | 'practice' | 'drill' // why it is asked; none for an ordinary review
}

export type LingoFeedback = { picked: number; isCorrect: boolean }

export type LingoView = 'pane' | 'band'

// A drill under way (the Stats page's "drill these"): its words, those got right, those missed once.
export type LingoDrill = { ids: string[]; done: string[]; missed: string[] }

// What the pane shows: the card, the chunks list, or one chunk's words.
export type LingoPaneScreen = 'card' | 'chunks' | 'stats' | 'settings' | 'placement' | 'flashcards' | 'language' | { chunk: number }

// The Flashcards page (study only, nothing counted): where the cards come from, the order
// this pass goes in, the card shown, and whether it is turned over.
export type LingoFlash = { mode: 'random' | 'chunk'; chunk: number; order: string[]; at: number; isFlipped: boolean }

// What the flashcard (hooks/flashcard.tsx) is handed: the Spanish, the English, which side.
export type LingoFlashcard = { front: string; back: string; isFlipped: boolean; rows: number } // rows: the card's height

// The placement test's search (src/placement.ts): see there for how it moves.
export type Placement = {
  chunks: number // the deck's chunks
  lo: number // the highest chunk passed; 0 for none yet
  hi: number // the lowest chunk failed; chunks + 1 for none yet
  probe: number // the chunk this round asks from
  round: number // 1 to ROUNDS
  asked: number // this round's words answered
  right: number // of them, right
  used: string[] // every word asked, so none comes twice
  missed: string[] // words answered wrong or "I don't know"
  result: number | null // the chunk to start at, once done
}

// The placement test under way, and the question it is asking.
export type LingoPlacement = Placement & { q: LingoQuestion | null }

// The first-run screen's step: the language, then how to start; done once set up.
export type LingoWelcome = 'language' | 'how' | 'done'

// What the pane's card grid (hooks/cards.tsx) is handed: the answers, and
// after a pick, which was right and which was picked.
export type LingoCards = {
  choices: string[]
  correct: number | null
  picked: number | null
  verdict: string // "correcto"/"incorrecto" after an answer, "" before
  layout?: 'grid' | 'row' | 'row-wide' // the pane's 2 × 2 grid (default), the terminal band's row, or the desktop band's (cards the full width, "next" under them)
}

declare module 'claude-code' {
  interface PluginState {
    lingo: {
      question: LingoQuestion | null
      feedback: LingoFeedback | null
      streak: number
      isBandHidden: boolean // closed with ×, until the next turn (switch on) or /lingo
      isBandPinned: boolean // opened by the person (/lingo, /lingo-view band, move to band)
      isTurnActive: boolean // a turn is running and brought up a card
      isAwaiting: boolean // a turn's card is still unanswered
      isShowingResult: boolean // an answer's result stays up RESULT_MS before the band goes
      resultToken: number // which answer the pending hide belongs to
      autoShow: boolean // the switch: a card on every turn (saved in profile.autoShow)
      lastReminder: number // when the "switch is off" toast last showed (epoch ms; 0 = not yet)
      view: LingoView
      paneScreen: LingoPaneScreen
      isMenuOpen: boolean // the pane's menu drop-down, under the gear
      dayTick: number // bumped at each local midnight, so the pane redraws its daily streak
      settingsTick: number // bumped on each change on the Settings page, so it redraws
      speech: 'ok' | 'no-voice' | 'none' // what this session found of speech: a voice missing, or none at all
      drill: LingoDrill | null // a drill of the words missed most, under way this session
      placement: LingoPlacement | null // the placement test, while it is taken
      welcome: LingoWelcome // the first-run screen's step
      flash: LingoFlash | null // the Flashcards page's cards, this session
      welcomePreview: boolean // developer mode's "Show first run": the screen shown, nothing saved
      missed: string[] // words answered wrong this session: right later, they rate Hard
      isRevealed: boolean // the card's new word had its meaning shown: its answer counts for nothing
      totals: { correct: number; answered: number }
    }
  }
}
