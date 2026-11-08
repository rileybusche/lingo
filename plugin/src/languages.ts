// The languages the mod can teach, and what differs between them: their names, the article a
// noun takes when its deck names none, the result line, and the voices that say a word.
// A language is offered once its deck is in src/decks.ts.

export type Voice = { name: string; label: string } // `name`: the voice's exact macOS `say` name

export type Language = {
  code: string // the deck's language, and the prefix of its word ids (`es-casa`)
  name: string // in English: "Spanish"
  native: string // in the language: "Español"
  articles: { m: string; f: string } // a noun's singular definite article by gender, unless its deck gives one
  verdict: { correct: string; incorrect: string } // the result line under "next"
  voices: readonly Voice[] // macOS voices that say it, the default first
}

export const LANGUAGES: Record<string, Language> = {
  es: {
    code: 'es',
    name: 'Spanish',
    native: 'Español',
    articles: { m: 'el', f: 'la' },
    verdict: { correct: 'correcto!', incorrect: 'incorrecto.' },
    // Latin American first: the deck's neutral Spanish is closest to it.
    voices: [{ name: 'Paulina', label: 'Paulina (Mexico)' }, { name: 'Mónica', label: 'Mónica (Spain)' }],
  },
  fr: {
    code: 'fr',
    name: 'French',
    native: 'Français',
    articles: { m: 'le', f: 'la' },
    verdict: { correct: 'correct !', incorrect: 'incorrect.' },
    voices: [{ name: 'Thomas', label: 'Thomas (France)' }, { name: 'Jacques', label: 'Jacques (France)' }, { name: 'Amélie', label: 'Amélie (Canada)' }],
  },
  it: {
    code: 'it',
    name: 'Italian',
    native: 'Italiano',
    articles: { m: 'il', f: 'la' },
    verdict: { correct: 'corretto!', incorrect: 'sbagliato.' },
    voices: [{ name: 'Alice', label: 'Alice (Italy)' }],
  },
  pt: {
    code: 'pt',
    name: 'Portuguese',
    native: 'Português',
    articles: { m: 'o', f: 'a' },
    verdict: { correct: 'correto!', incorrect: 'incorreto.' },
    // Brazil first: the deck is Brazilian Portuguese.
    voices: [{ name: 'Luciana', label: 'Luciana (Brazil)' }, { name: 'Joana', label: 'Joana (Portugal)' }],
  },
}

// The language's facts; a code with none gets Spanish's (the first deck), so nothing breaks.
export const languageOf = (code: string): Language => LANGUAGES[code] ?? (LANGUAGES.es as Language)
