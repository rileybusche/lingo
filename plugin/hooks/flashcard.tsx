// One flashcard, drawn by the mod (a Client region) so a click anywhere on it turns it
// over: the Spanish on the front; turned, the English under it. No `$` here: a turn is
// posted to the hooks module. Its height is handed in (`rows`), not read from the surface:
// sized by `surface.rows`, the desktop app drew it one row tall in an 11-row region (Riley's
// screenshots, 2026-10-26 and 27).

import type { ClientModule } from 'claude-code'

import type { LingoFlashcard } from '../types'

const Flashcard: ClientModule<LingoFlashcard> = (props, surface) => {
  const { Box, Button, Text } = surface.elements
  surface.onPointer(event => {
    if (event.type === 'down' && event.button === 'left') surface.post({ flip: true })
  })
  return (
    <Box key="flash-face" width={surface.columns} height={props.rows} minHeight={props.rows} borderStyle="round" paddingX={2} paddingY={1} flexDirection="column" alignItems="center" justifyContent="center">
      {props.isFlipped ? (
        <Box key="flash-back" flexDirection="column" alignItems="center">
          <Text dimColor>{props.front}</Text>
          <Button key="flash-turn" label={props.back} plain onPress={() => surface.post({ flip: true })} />
        </Box>
      ) : (
        <Button key="flash-turn" label={props.front} plain onPress={() => surface.post({ flip: true })} />
      )}
    </Box>
  )
}

export default Flashcard
