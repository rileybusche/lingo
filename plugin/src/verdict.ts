// "correct" and "incorrect" in each deck's language, shown under "next" (src/languages.ts).

import { languageOf } from './languages'

export function verdictText(language: string, isCorrect: boolean): string {
  const words = languageOf(language).verdict
  return isCorrect ? words.correct : words.incorrect
}
