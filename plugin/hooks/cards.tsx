// The answer cards, drawn by the mod itself (a Client region) so every card is
// the same size and a click anywhere on one acts. Two layouts: the pane's
// `grid` (2 × 2, a full-width "next" card under it, the result under that) and
// the band's `row` (four cards side by side, "next" to their right, the result
// under them). The result shows in the borders: the right card green, a wrong
// pick red. No `$` here: a pick or a next is posted to the hooks module.

import type { ClientModule } from 'claude-code'

import type { LingoCards } from '../types'

const GAP_X = 2
const GAP_Y = 1
// The "next" card's rows, under the grid after a one-row gap. The region keeps
// room for it before an answer, so nothing moves when it appears.
export const NEXT_ROWS = 3
// The result's row under the "next" card, after a VERDICT_GAP-row gap.
export const VERDICT_GAP = 1
export const VERDICT_ROWS = 1
// The band's row: cards ROW_CARD_ROWS tall (two lines of text, so an answer like "that
// (linking, no accent)" stays inside its card), the result on the row under them, "next"
// NEXT_COLS wide after the fourth card.
export const ROW_CARD_ROWS = 4
export const NEXT_COLS = 10
export const BAND_ROWS = ROW_CARD_ROWS + VERDICT_ROWS

export type Layout = 'grid' | 'row' | 'row-wide'

// The width of each of the row's four cards: the terminal's leaves room for "next" after the
// fourth; the desktop's (row-wide) fills the width, "next" going under the cards.
function rowCardWidth(columns: number, layout: Layout = 'row') {
  if (layout === 'row-wide') return Math.max(1, Math.floor((columns - 3 * GAP_X) / 4))
  return Math.max(1, Math.floor((columns - 4 * GAP_X - NEXT_COLS) / 4))
}

// Which card a cell of the region belongs to, or null for the gaps.
export function cardAt(columns: number, rows: number, x: number, y: number, layout: Layout = 'grid'): number | null {
  if (layout === 'row' || layout === 'row-wide') {
    if (y < 0 || y >= ROW_CARD_ROWS) return null
    const width = rowCardWidth(columns, layout)
    for (let i = 0; i < 4; i++) {
      const left = i * (width + GAP_X)
      if (x >= left && x < left + width) return i
    }
    return null
  }
  const { width, height } = cardSize(columns, rows)
  const col = x < width ? 0 : x >= width + GAP_X && x < 2 * width + GAP_X ? 1 : null
  const row = y < height ? 0 : y >= height + GAP_Y && y < 2 * height + GAP_Y ? 1 : null
  return col === null || row === null ? null : row * 2 + col
}

function cardSize(columns: number, rows: number) {
  return {
    width: Math.max(1, Math.floor((columns - GAP_X) / 2)),
    height: Math.max(3, Math.floor((rows - GAP_Y - GAP_Y - NEXT_ROWS - VERDICT_GAP - VERDICT_ROWS) / 2)),
  }
}

// Whether a cell of the region is on the "next" card.
export function isNextAt(columns: number, rows: number, x: number, y: number, layout: Layout = 'grid'): boolean {
  // The desktop band's "next": the right end of the result's row, under the fourth card.
  if (layout === 'row-wide') return y === ROW_CARD_ROWS && x >= columns - NEXT_COLS && x < columns
  if (layout === 'row') {
    const left = 4 * (rowCardWidth(columns) + GAP_X)
    return y >= 0 && y < ROW_CARD_ROWS && x >= left && x < left + NEXT_COLS
  }
  const { width, height } = cardSize(columns, rows)
  const top = 2 * height + GAP_Y + GAP_Y
  return x >= 0 && x < 2 * width + GAP_X && y >= top && y < top + NEXT_ROWS
}

const Cards: ClientModule<LingoCards> = (props, surface) => {
  const { Box, Button, Text } = surface.elements
  const layout = props.layout ?? 'grid'
  const isAnswered = props.picked !== null
  surface.onPointer(event => {
    if (event.type !== 'down' || event.button !== 'left') return
    const pick = cardAt(surface.columns, surface.rows, event.x, event.y, layout)
    if (pick !== null) surface.post({ pick })
    else if (isAnswered && isNextAt(surface.columns, surface.rows, event.x, event.y, layout)) surface.post({ next: true })
  })
  const color = (i: number) =>
    props.picked === null ? undefined : i === props.correct ? 'green' : i === props.picked ? 'red' : undefined
  const card = (i: number, width: number, height: number) => (
    <Box
      key={`card${i + 1}`}
      width={width}
      height={height}
      borderStyle="round"
      borderColor={color(i)}
      alignItems="center"
      justifyContent="center"
    >
      <Button
        key={`a${i + 1}`}
        label={props.choices[i] ?? ''}
        hotkey={String(i + 1)}
        plain
        onPress={() => surface.post({ pick: i })}
      />
    </Box>
  )
  const next = (width: number, height: number) =>
    isAnswered ? (
      <Box key="next-card" width={width} height={height} borderStyle="round" alignItems="center" justifyContent="center">
        <Button key="next" label="next" plain onPress={() => surface.post({ next: true })} />
      </Box>
    ) : (
      // Kept empty before an answer, so nothing moves when "next" appears.
      <Box key="next-room" width={width} height={height} />
    )
  // The result in the deck's language, its row kept empty before an answer.
  const verdict = (extra: Record<string, unknown>) => (
    <Box key="verdict" height={VERDICT_ROWS} {...extra}>
      {isAnswered ? (
        <Text italic color={props.picked === props.correct ? 'green' : 'red'}>
          {props.verdict}
        </Text>
      ) : (
        <Text> </Text>
      )}
    </Box>
  )

  if (layout === 'row-wide') {
    const width = rowCardWidth(surface.columns, layout)
    return (
      <Box flexDirection="column">
        <Box columnGap={GAP_X}>
          {card(0, width, ROW_CARD_ROWS)}
          {card(1, width, ROW_CARD_ROWS)}
          {card(2, width, ROW_CARD_ROWS)}
          {card(3, width, ROW_CARD_ROWS)}
        </Box>
        {/* The result on the left, "next →" on the right of the same row. */}
        <Box key="below" justifyContent="space-between" height={VERDICT_ROWS}>
          {verdict({ paddingLeft: 1 })}
          {isAnswered && (
            <Box key="next-card" width={NEXT_COLS} justifyContent="flex-end">
              <Button key="next" label="next →" plain onPress={() => surface.post({ next: true })} />
            </Box>
          )}
        </Box>
      </Box>
    )
  }

  if (layout === 'row') {
    const width = rowCardWidth(surface.columns)
    return (
      <Box flexDirection="column">
        <Box columnGap={GAP_X}>
          {card(0, width, ROW_CARD_ROWS)}
          {card(1, width, ROW_CARD_ROWS)}
          {card(2, width, ROW_CARD_ROWS)}
          {card(3, width, ROW_CARD_ROWS)}
          {next(NEXT_COLS, ROW_CARD_ROWS)}
        </Box>
        {verdict({ paddingLeft: 1 })}
      </Box>
    )
  }

  const { width, height } = cardSize(surface.columns, surface.rows)
  return (
    <Box flexDirection="column" rowGap={GAP_Y}>
      <Box columnGap={GAP_X}>{card(0, width, height)}{card(1, width, height)}</Box>
      <Box columnGap={GAP_X}>{card(2, width, height)}{card(3, width, height)}</Box>
      {/* "next" and the result under it. */}
      <Box key="below" flexDirection="column">
        {next(2 * width + GAP_X, NEXT_ROWS)}
        {verdict({ justifyContent: 'center', marginTop: VERDICT_GAP })}
      </Box>
    </Box>
  )
}

export default Cards
