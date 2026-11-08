// Where the pane puts the word and its cards (hooks/register.tsx).

// The card grid's rows (hooks/cards.tsx): two 5-row cards with a 1-row gap, then room kept
// for what appears after an answer (a 1-row gap, the 3-row "next" card, a 1-row gap, the
// 1-row result).
export const GRID_ROWS = 17
export const CARD_ROWS = 11
export const KEPT_ROWS = GRID_ROWS - CARD_ROWS

// The pane centres the word and its four cards with flex alone, not with a row count
// worked out from the pane's height (tried 2026-10-15: in the desktop app the margin did
// not land where the reported height said it would). Above the word, KEPT_ROWS of space
// that may shrink, matching the rows kept under the cards, so what shows is symmetric and
// the tips above the word have room; around both, equal flexible space.

// The lines `text` wraps to in `columns`, word by word: where a setting's tip opens above it.
// shortcut: counts characters as cells, which the desktop app's proportional font only
// approximates; measure the drawn row if a tip is seen to cover its name.
export function wrappedLines(text: string, columns: number): number {
  let lines = 1
  let used = 0
  for (const word of text.split(' ')) {
    const need = used === 0 ? word.length : used + 1 + word.length
    if (need <= columns || used === 0) used = need
    else {
      lines++
      used = word.length
    }
  }
  return lines
}

// Where a tip opening above the word goes (its left, from the word row's left edge): centred
// over the word, but held inside the pane, which the desktop app clips at its edge (Riley's
// screenshot, 2026-10-30: over a short word, `il`, the tag's tip ran past the pane's left
// edge). The word row is centred in the pane's `bodyColumns` less its padding, so its left edge
// is half the room the row leaves. Only the left edge needs holding: the word starts the row,
// so a tip centred over it reaches right no further than half the row and half the tip, which
// the room always holds.
// shortcut: `rowColumns` counts characters as cells, which the desktop app's proportional font
// only approximates; a cell of margin each side covers small misses.
export function tipLeft(wordColumns: number, rowColumns: number, bodyColumns: number, width: number): number {
  const room = bodyColumns - 2 // the pane's padding
  const rowLeft = Math.max(0, Math.floor((room - rowColumns) / 2))
  const centred = Math.round((wordColumns - width) / 2)
  return Math.max(-rowLeft + 1, centred)
}
