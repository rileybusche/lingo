// Lingo: vocab cards while Claude works (PLAN.md §4). A card comes up when
// a turn starts, in the person's chosen view: a side pane (a 2 × 2 card grid)
// or a band above the prompt. /lingo opens it any time.

import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ClientProps, ElementConstructor, EngineInterface, Register, SelectProps, SvgProps, TextProps } from 'claude-code'

import type { Deck } from '../src/deck'
import { DECKS, deckFor, offered } from '../src/decks'
import { languageOf } from '../src/languages'
import { advancedChunk, barCells, chunkCount, chunkProgress, neededToAdvance, savedChunk, savedFocus, standing, withChunk, withFocus } from '../src/chunks'
import { choiceText, promptText, questionFrom } from '../src/picker'
import { localDayStart, newSince, queueOrder } from '../src/queue'
import { barSvg, blankSvg, chipSvg } from '../src/bar'
import { CORE_BADGES, chunkBadges, newlyEarned } from '../src/badges'
import { LIMITS, readSettings, voiceFor, withDefaults, withNextVoice, withNudge, withToggled, withVoice, type SettingKey, type Settings, type Switch } from '../src/settings'
import { CARD_ROWS, GRID_ROWS, KEPT_ROWS, tipLeft, wrappedLines } from '../src/layout'
import { gradientAt } from '../src/colour'
import { accuracy, daysSparkline, daysSvg, heatmap, heatmapLines, heatmapSvg, lastDays, mostMissed } from '../src/stats'
import { POS_HELP, posName, posTipText } from '../src/pos'
import { BAND_ROWS } from './cards'
import { cardsKey, isKnown, migratedProfile, ratingFor, readCards, readStats, srsOf, totals, withAnswer, withStreak, withStudied } from '../src/progress'
import { RUN_FOR_BONUS, type Level, levelOf, localDate, msToMidnight, readDays, streakNow, withDay, withDayCounted, xpFor } from '../src/gamify'
import { chimeBase64 } from '../src/chime'
import { exportText, importWrites, isOurKey } from '../src/transfer'
import { seeded, shuffled } from '../src/random'
import { QUESTIONS, SPREAD_DAYS, placedCount, questionNumber, startPlacement, withPlacement, withPlacementAnswer, type Placement } from '../src/placement'
import { verdictText } from '../src/verdict'
import type { LingoCards, LingoDrill, LingoFeedback, LingoFlash, LingoFlashcard, LingoPaneScreen, LingoPlacement, LingoQuestion, LingoView, LingoWelcome } from '../types'

const PANE = 'lingo'

// The deck of the language being learned (profile.language; Spanish until one is chosen).
// shortcut: one module variable, set from the saved profile at the start of every hook
// (syncDeck) and on a switch, which every function reads, rather than the deck being handed
// down through each call. Pass it down instead if a path is found that reads it unsynced.
let deck: Deck = deckFor('es')
async function syncDeck($: EngineInterface): Promise<Deck> {
  deck = deckFor(((await $.store.get('profile')) as { language?: unknown } | undefined)?.language)
  return deck
}
const question = atom({ plugin: 'lingo', key: 'question' } as const, null)
const feedback = atom({ plugin: 'lingo', key: 'feedback' } as const, null)
const streak = atom({ plugin: 'lingo', key: 'streak' } as const, 0)
const isBandHidden = atom({ plugin: 'lingo', key: 'isBandHidden' } as const, false)
const isBandPinned = atom({ plugin: 'lingo', key: 'isBandPinned' } as const, false)
const isTurnActive = atom({ plugin: 'lingo', key: 'isTurnActive' } as const, false)
const isAwaiting = atom({ plugin: 'lingo', key: 'isAwaiting' } as const, false)
// After an answer the band stays this long, so the result can be seen, then
// goes (unless a turn, a waiting card or the person keeps it up).
const RESULT_MS = 4000
const isShowingResult = atom({ plugin: 'lingo', key: 'isShowingResult' } as const, false)
const resultAt = atom({ plugin: 'lingo', key: 'resultAt' } as const, 0)
// The switch: on, a card comes up every time Claude starts working; off, only
// with /lingo. Saved in the store's profile, so it holds across sessions.
const autoShow = atom({ plugin: 'lingo', key: 'autoShow' } as const, true)
const lastReminder = atom({ plugin: 'lingo', key: 'lastReminder' } as const, 0)
// While the switch is off, a toast says how to turn it on: on a session's first
// turn, then at most this often.
const REMIND_EVERY_MS = 60 * 60 * 1000
// The person's choice of view, kept in $.store's `profile` across sessions.
const view = atom({ plugin: 'lingo', key: 'view' } as const, 'band')
// This session's right answers over its answers, for the pane's score. All-time
// totals live in the store's per-word records (for the stats view to come).
const score = atom({ plugin: 'lingo', key: 'totals' } as const, { correct: 0, answered: 0 })
// The card's new word had its meaning shown ("show meaning"): its answer counts
// toward nothing, and the word is scheduled to come back to be tried unaided.
const isRevealed = atom({ plugin: 'lingo', key: 'isRevealed' } as const, false)
// Every tip is solid, so what is under it does not show through: dark with light text,
// the usual tooltip look, the same in a light or dark theme (no theme key is a plain background).
const TIP = { background: '#1f2328', text: '#e6edf3' } as const
// The menu's gear, in its emoji presentation (the variation selector asks for the emoji glyph).
const MENU_GEAR = '\u2699\uFE0F'
// A new word's colour: no theme key is purple, so a fixed one that reads on light and dark.
const NEW_WORD = '#a371f7'
// Why the word is here, after its part of speech: dim, hover for what it means. The
// band, short of room, shows a symbol.
const TAGS = {
  new: { pane: 'new', band: '•', name: 'new word', tip: 'A new word. "show meaning" shows it; this card then counts toward nothing.' },
  again: { pane: '↻ again', band: '↻', name: 'missed recently', tip: "You missed this one recently; it's back so it sticks." },
  practice: { pane: 'practice', band: '·', name: 'extra practice', tip: "Nothing is due right now; this one doesn't change its schedule." },
  drill: { pane: 'drill', band: '◎', name: 'drill', tip: 'Drilling the words you miss most: cards come only from them until each is right once, or you press stop.' },
} as const
const TAG_SCOPE = 'lingo-tip-tag'
// The words answered wrong this session: right later, they count as Hard.
const missedWords = atom({ plugin: 'lingo', key: 'missed' } as const, [] as string[])
// A drill of the words missed most, under way this session (the Stats page's "drill these").
const drill = atom({ plugin: 'lingo', key: 'drill' } as const, null as LingoDrill | null)
// Bumped on each change on the Settings page, so it redraws.
const settingsTick = atom({ plugin: 'lingo', key: 'settingsTick' } as const, 0)
// What this session found of speech: a voice missing (the system's own speaks instead), or
// none at all (the 🔊 hides).
const speech = atom({ plugin: 'lingo', key: 'speech' } as const, 'ok')
const placement = atom({ plugin: 'lingo', key: 'placement' } as const, null as LingoPlacement | null)
const welcome = atom({ plugin: 'lingo', key: 'welcome' } as const, 'language' as LingoWelcome)
const welcomePreview = atom({ plugin: 'lingo', key: 'welcomePreview' } as const, false)
const flash = atom({ plugin: 'lingo', key: 'flash' } as const, null as LingoFlash | null)
// Bumped at each local midnight so the pane redraws its daily streak.
const dayTick = atom({ plugin: 'lingo', key: 'dayTick' } as const, 0)
// The pane's menu drop-down (the gear, top right of the card) is open.
const isMenuOpen = atom({ plugin: 'lingo', key: 'isMenuOpen' } as const, false)
// What the pane shows: the card, the chunks list, or one chunk's words.
const paneScreen = atom({ plugin: 'lingo', key: 'paneScreen' } as const, 'card' as LingoPaneScreen)
// The chunks list's progress bars, in cells, and its colours (theme keys, so they
// follow the person's light or dark theme).
// Each bar is a one-row track filled from the left: learned cells shade from
// green to blue by where they sit along it, seen ones a muted slate, the rest
// the track's own grey. No outline: a border takes whole cells, and the desktop
// app draws its line through the middle of them, leaving a half-cell gap round
// the fill. Fixed colours (a gradient needs exact shades), for light and dark.
const BAR_CELLS = 16
const BAR = { from: '#2ea043', to: '#1f6feb', seen: '#5b7a99', track: '#30363d' } as const
// The desktop app's SVG bar, in CSS pixels: rounded, closer to square than a pill,
// drawn in a taller box (`pad` above and below) so the rows have a little space
// between them there. Box spacing comes only in whole cells on this build (it
// refuses the "xs" step its types allow), and a whole row would double the list.
const BAR_SVG = { width: 140, height: 12, radius: 3, pad: 6 } as const
// The key's chips: the bar's height and corners, a short block.
const LEGEND_CHIP = { width: 18, height: 12, radius: 3 } as const

export const register: Register = (on, options) => {
  const showOnTurn = options.showOnTurn !== false

  on('session.start', async ($, e, next) => {
    await syncDeck($)
    await $.command.register({
      name: 'lingo',
      description: 'Open the vocab card in your chosen view and show it on every turn; off or on',
      argumentHint: '[off | on]',
    })
    await $.command.register({
      name: 'lingo-stats',
      description: 'Your daily streak, level, the last 30 days, accuracy and the words you miss most',
    })
    await $.command.register({
      name: 'lingo-chunk',
      description: "Which chunk of 50 words you're on, and how many of it you've learned",
    })
    await $.command.register({
      name: 'lingo-export',
      description: "Save your progress to lingo-progress.json in this session's folder",
    })
    await $.command.register({
      name: 'lingo-import',
      description: "Load progress, merged with what is saved: lingo-progress.json in this session's folder, or the file you name",
      argumentHint: '[file]',
    })
    await $.command.register({
      name: 'lingo-view',
      description: 'Choose where the vocab card shows: the side pane or the band above the prompt',
      argumentHint: '[pane|band]',
    })
    // For development: shows a Developer section on the Settings page. Left out of the
    // typeahead and /help (the command.describe hook below), so only someone who knows it
    // runs it.
    await $.command.register({
      name: 'lingo-dev',
      description: 'Developer mode: a Level up button on the Settings page; run again to turn it off',
    })
    const profile = migratedProfile(await $.store.get('profile'))
    if (profile !== null) await $.store.set('profile', profile)
    const saved = await savedView($)
    await update($, view, () => saved)
    const isOn = await savedAutoShow($, showOnTurn)
    await update($, autoShow, () => isOn)
    await refresh($)
    // A reload keeps the card on screen; a new session gets a fresh one.
    if ((await read($, question)) === null) await nextCard($, false) // nothing is on screen yet
    await atMidnight($)

    return next(e)
  })

  on('command.run', { command: 'lingo' }, async ($, e) => {
    await syncDeck($)
    const [sub = ''] = e.args.trim().split(/\s+/)
    // The forms these had before they were commands of their own (2026-10-15).
    if (sub === 'export' || sub === 'import' || sub === 'chunk') return { text: `This is now /lingo-${sub}.` }
    if (sub === 'off') {
      await setAutoShow($, false)
      await update($, isAwaiting, () => false)
      // Closed now, as the reply says (Riley, 2026-11-08: the pane stayed open): the pane, and
      // the band even when /lingo had opened it. The switch on the card turns it off without
      // closing it, since the person is looking at it.
      await $.ui.close({ id: PANE })
      await closeBand($)
      return { text: 'lingo is off: it stays closed until you run /lingo. /lingo on shows it on every turn again.' }
    }
    if (sub === 'on') {
      await setAutoShow($, true)
      return { text: 'lingo is on: a card comes up each time Claude starts working.' }
    }
    if (sub !== '') return { text: 'Use /lingo, /lingo off or /lingo on; /lingo-chunk, /lingo-view, /lingo-export and /lingo-import for the rest.' }
    const chosen = await read($, view)
    await setAutoShow($, true)
    await show($, chosen)

    return { text: `lingo ${chosen} opened; it comes up each time Claude starts working.` }
  })

  // The status line, and the chunks list opened in the pane: the keyboard's
  // route to it.
  on('command.run', { command: 'lingo-stats' }, async $ => {
    await syncDeck($)
    await update($, paneScreen, (): LingoPaneScreen => 'stats')
    await $.ui.open({ id: PANE, title: 'lingo', focus: true })
    return { text: await statsLine($) }
  })
  on('command.run', { command: 'lingo-chunk' }, async $ => {
    await syncDeck($)
    await update($, paneScreen, (): LingoPaneScreen => 'chunks')
    await $.ui.open({ id: PANE, title: 'lingo', focus: true })
    return { text: await chunkStatus($) }
  })
  on('command.describe', { command: 'lingo-dev' }, ($, e, next) => next({ ...e, isHidden: true }))
  on('command.run', { command: 'lingo-dev' }, async $ => {
    await syncDeck($)
    const p = ((await $.store.get('profile')) ?? {}) as Record<string, unknown>
    const isDev = p.dev !== true
    await $.store.set('profile', { ...p, schemaVersion: (p.schemaVersion as number | undefined) ?? 1, dev: isDev })
    await update($, settingsTick, n => n + 1)
    return { text: isDev ? 'lingo developer mode is on: • Settings has a Level up button. /lingo-dev again turns it off.' : 'lingo developer mode is off.' }
  })
  on('command.run', { command: 'lingo-export' }, async ($, e) => {
    await syncDeck($)
    return { text: await exportProgress($, e.args.trim()) }
  })
  on('command.run', { command: 'lingo-import' }, async ($, e) => {
    await syncDeck($)
    return { text: await importProgress($, e.args.trim()) }
  })

  on('command.run', { command: 'lingo-view' }, async ($, e) => {
    await syncDeck($)
    const wanted = e.args.trim()
    if (wanted !== 'pane' && wanted !== 'band') {
      const chosen = await read($, view)
      return { text: `lingo shows in the ${chosen}. Use /lingo-view pane or /lingo-view band.` }
    }
    await choose($, wanted)

    return { text: `lingo will show in the ${wanted} from now on.` }
  })

  // A turn started. With the switch on, bring up a card (a fresh one if the
  // last was answered; an unanswered one stays) in the chosen view: a band
  // closed with × comes back, and the pane opens without the keyboard so it
  // never takes the person's typing. With it off, remind them now and then.
  on('turn.start', async ($, e, next) => {
    await syncDeck($)
    // Read fresh each turn: another window may have flipped the switch.
    const isOn = await savedAutoShow($, showOnTurn)
    await update($, autoShow, () => isOn)
    if (!isOn) {
      await remind($)
      return next(e)
    }
    if ((await read($, feedback)) !== null) await nextCard($)
    await update($, isBandHidden, () => false)
    await update($, isTurnActive, () => true)
    await update($, isAwaiting, () => true)
    if ((await read($, view)) === 'pane') {
      const panes = await $.ui.panes()
      if (!panes.some(p => p.id === PANE)) await $.ui.open({ id: PANE, title: 'lingo' })
    }

    return next(e)
  })

  // The turn ended: an answered card leaves the band; an unanswered one stays.
  on('turn.complete', async ($, e, next) => {
    await syncDeck($)
    await update($, isTurnActive, () => false)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await syncDeck($)
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // A dropdown where the surface draws one (not the mobile app); buttons stand in elsewhere.
    const Select = e.surface !== 'mobile' && 'Select' in elements ? (elements.Select as ElementConstructor<SelectProps>) : null
    // The card grid is a Client: drawn on the terminal and the desktop only
    // (VS Code lists one but draws an empty box in its place).
    const Client = (e.surface === 'terminal' || e.surface === 'desktop') && 'Client' in elements ? elements.Client : null
    const screen = await read($, paneScreen)
    // Rounded SVG bars where the surface draws Svg; the terminal keeps cell bars.
    // By surface, not by `'Svg' in elements`: the terminal's table answers that
    // too, and there an element it does not draw renders as nothing.
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? (elements.Svg as ElementConstructor<SvgProps>) : null
    if (screen === 'chunks') return chunksList($, Box, Button, Text, Svg, await chunksNow($), e.props.bodyColumns)
    if (screen === 'stats') return statsPage($, Box, Button, Text, Svg, await statsNow($))
    if (screen === 'settings') {
      await read($, settingsTick) // redraw on a change
      const p = (await $.store.get('profile')) as { dev?: unknown } | undefined
      const dev = p?.dev === true ? levelOf(readStats(await $.store.get('stats')).xp) : null
      return settingsPage($, Box, Button, Text, Select, await settingsNow($), e.props.scroll.bodyRows, dev, e.props.bodyColumns, e.surface === 'desktop')
    }
    if (screen === 'language') return languagePage($, Box, Button, Text)
    if (screen === 'flashcards') return flashcardsPage($, Box, Button, Text, Select, Client, await read($, flash), e.props.scroll.bodyRows)
    if (screen === 'placement') return placementPage($, Box, Button, Text, Client, await read($, placement), e.props.scroll.bodyRows)
    if (screen !== 'card') return chunkWords($, Box, Button, Text, screen.chunk, await chunksNow($))
    // First run: the language, then how to start, before any card.
    const step = await read($, welcome)
    if (await read($, welcomePreview)) return welcomePage($, Box, Button, Text, step === 'done' ? 'language' : step, 'pane', e.props.scroll.bodyRows)
    if (step !== 'done' && !(await isSetUp($))) return welcomePage($, Box, Button, Text, step, 'pane', e.props.scroll.bodyRows)
    const q = await read($, question)
    if (q === null) return <Text dimColor>No card yet.</Text>
    const fb = await read($, feedback)
    const revealed = await read($, isRevealed)
    const menuOpen = await read($, isMenuOpen)
    const saying = await read($, speech)
    const drilling = await read($, drill)
    const run = await read($, streak)
    await read($, dayTick) // redraw at local midnight
    await read($, settingsTick) // redraw when the voice switch turns
    const sayOn = (await settingsNow($)).sayOnShow
    const saved = readStats(await $.store.get('stats'))
    const xpNow = saved.xp
    const clockNow = await $.clock.now()
    const dailyNow = streakNow(saved.daily, localDate(clockNow, new Date(clockNow).getTimezoneOffset()))
    // The word, its part of speech, tag and tips: on the card, and beside the menu drawer.
    // The row's width, for keeping the tips inside the pane: the word and its part of speech,
    // then the tag, "show meaning" and 🔊 when they show.
    const rowColumns = q.prompt.length + q.pos.length + 3
      + (q.tag !== undefined ? TAGS[q.tag].pane.length + 1 : 0)
      + (q.tag === 'new' && fb === null && !revealed ? 'show meaning'.length + 1 : 0)
      + (saying !== 'none' ? 3 : 0)
    const tipAt = { above: { wordColumns: q.prompt.length + q.pos.length + 3, rowColumns, bodyColumns: e.props.bodyColumns } }
    const wordBox = (
      <Box key="word">
        {wordText(Text, q)}
        {posTag(Box, Text, q.pos)}
        {tagView(Box, Text, q.tag, 'pane')}
        {drillView($, Box, Button, Text, q, drilling, 'pane')}
        {meaning($, Box, Button, Text, q, fb, revealed, 'pane')}
        {sayButton($, Box, Button, q, saying)}
        {posTip(Box, Text, q.pos, tipAt)}
        {tagTip(Box, Text, q.tag, tipAt)}
      </Box>
    )
    const tally = await read($, score)
    const isOn = await read($, autoShow)
    const cards: LingoCards = {
      choices: q.choices,
      correct: fb === null ? null : q.answer,
      picked: fb === null ? null : fb.picked,
      verdict: fb === null ? '' : verdictText(deck.language, fb.isCorrect),
    }

    // Fills the pane's body: the switch top left, the score and the menu (⚙) top right;
    // the word and the card grid in the middle, "next" and the result under it; the
    // streak bottom left.
    return (
      <Box key="card" flexDirection="column" width="100%" height={e.props.scroll.bodyRows} paddingX={1}>
        {/* Top left the switch; top right this session's right answers / answers.
            Hover any of them for what it means. */}
        <Box key="top" justifyContent="space-between">
          {autoSwitch($, Box, Button, Text, isOn, 'left')}
          <Box key="score">
            {tip(Box, Text, 'correct', tally.correct, `${tally.correct} correct this session`)}
            <Text dimColor>/</Text>
            {tip(Box, Text, 'answered', tally.answered, `${tally.answered} answered this session`)}
            <Box key="menu-button" marginLeft={2}>
              {Select !== null ? (
                // The menu as a dropdown (Riley, 2026-10-27): the gear its label, resting on
                // "Menu" so every page is a pick away; it covers nothing, so the cards stay.
                // The gear inside the box, in the resting option's name: the desktop app draws a
                // Select's label small and grey beside the box (Riley's screenshot, 2026-10-27).
                <Select
                  key="menu"
                  options={[{ value: MENU_REST, label: `${MENU_GEAR} Menu` }, ...MENU.map(item => ({ value: item.key, label: menuLabel(item).replace(/^• /, '') }))]}
                  value={MENU_REST}
                  onSelect={value => void (value === MENU_REST ? undefined : goTo($, value as MenuKey))}
                />
              ) : (
                // No dropdown (the mobile app): the gear opens the drawer. The emoji form of
                // the gear (U+2699 U+FE0F), plain: the colour emoji font draws it larger than
                // the text-style glyph, and it reads as a control on its own.
                <Button key="menu" label={MENU_GEAR} plain onPress={() => update($, isMenuOpen, open => !open)} />
              )}
            </Box>
          </Box>
        </Box>
        {/* The menu open: the body splits, the word on the left, the drawer on the right;
            the answer cards are hidden until it closes. */}
        {menuOpen && (
          <Box key="drawer-body" flexDirection="row" flexGrow={1} flexShrink={1} minHeight={0}>
            <Box key="drawer-left" width="50%" justifyContent="center" alignItems="center">
              {wordBox}
            </Box>
            {menuDrawer($, Box, Button, Text)}
          </Box>
        )}
        {/* The word and the four cards centred by flex (src/layout.ts): equal space
            around them, and KEPT_ROWS above the word (shrinking in a short pane) to match
            the rows kept under the cards, which also leaves the tips room. Without the
            card grid (VS Code), the buttons are centred as before. */}
        {/* minHeight 0 lets this shrink below its contents: without it the desktop app's
            flexbox holds the middle at full height and pushes the footer off the pane, so the
            space above the word gives way first, and the pane scrolls only when the word,
            the cards and the footer cannot all fit. */}
        {!menuOpen && <Box key="middle" flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} justifyContent={Client !== null ? 'flex-start' : 'center'}>
          {Client !== null && <Box key="space-above" flexGrow={1} />}
          {Client !== null && <Box key="tip-room" height={KEPT_ROWS} flexShrink={1} minHeight={0} />}
          <Box key="word-row" justifyContent="center" marginTop={Client !== null ? 0 : 1} marginBottom={1}>
            {wordBox}
          </Box>
          {Client !== null ? (
            <Client key="cards" module="./cards.tsx" props={cards} width="100%" height={GRID_ROWS} />
          ) : (
            // VS Code and mobile draw no Client: plain buttons, keys 1–4.
            <Box flexDirection="column" alignItems="center" rowGap={1}>
              {[0, 2].map(row => (
                <Box key={`row${row}`} columnGap={2}>
                  {[row, row + 1].map(i => (
                    <Button
                      key={`a${i + 1}`}
                      label={q.choices[i] ?? ''}
                      hotkey={String(i + 1)}
                      variant={fb !== null && i === q.answer ? 'primary' : undefined}
                      onPress={() => answer($, i)}
                    />
                  ))}
                </Box>
              ))}
            </Box>
          )}
          {Client !== null && <Box key="space-below" flexGrow={1} />}
        </Box>}
        {!menuOpen && Client === null && (
          // Without the card grid there are no borders: say the result in words.
          <Box flexDirection="column" alignItems="center" marginY={1}>
            {line(Text, q, fb)}
            {fb !== null && <Button key="next" label="next" variant="primary" onPress={() => askAnother($)} />}
          </Box>
        )}
        <Box key="footer" justifyContent="space-between" flexShrink={0}>
          {/* The daily streak first, as the old 🔥 was: the desktop app does not show a
              mod's status line, so the pane carries it too. Then the level. */}
          <Box key="footer-left" gap={3}>
            <Box key="daily"><Text>{`🔥 ${dailyNow}`}</Text></Box>
            {xpLine(Box, Text, xpNow, run)}
          </Box>
          {/* Bottom right, the voice switch (Riley, 2026-11-08): "Say the word when shown",
              one click from the card. Hidden with the 🔊 when there is no speech. */}
          {saying !== 'none' && voiceSwitch($, Box, Button, Text, sayOn)}
        </Box>
      </Box>
    )
  })

  // From the card grid: a pick (a click anywhere on a card, or its hotkey), or
  // "next" once the card is answered.
  on('ui.message', { element: 'cards' }, async ($, e) => {
    await syncDeck($)
    const data = (e.data ?? {}) as { pick?: unknown; next?: unknown }
    const pick = data.pick
    if (typeof pick === 'number' && Number.isInteger(pick) && pick >= 0 && pick < 4) await answer($, pick)
    else if (data.next === true && (await read($, feedback)) !== null) await askAnother($)

    return {}
  })

  // From the flashcard: turned over.
  on('ui.message', { element: 'flash-card' }, async ($, e) => {
    await syncDeck($)
    if (((e.data ?? {}) as { flip?: unknown }).flip === true) await flipCard($)

    return {}
  })

  // From the placement test's card grid: a pick.
  on('ui.message', { element: 'place-cards' }, async ($, e) => {
    await syncDeck($)
    const pick = ((e.data ?? {}) as { pick?: unknown }).pick
    if (typeof pick === 'number' && Number.isInteger(pick) && pick >= 0 && pick < 4) await placementAnswer($, pick)

    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await syncDeck($)
    if (e.props.hasSurvey || (await read($, view)) !== 'band') return next(e)
    const q = await read($, question)
    if (q === null || (await read($, isBandHidden))) return next(e)
    // Shown while a turn runs, while a card waits for an answer, for RESULT_MS
    // after an answer, or when the person opened it; otherwise out of the way.
    const isWanted =
      (await read($, isTurnActive)) ||
      (await read($, isAwaiting)) ||
      (await read($, isShowingResult)) ||
      (await read($, isBandPinned))
    if (!isWanted) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const step = await read($, welcome)
    if (step !== 'done' && !(await isSetUp($))) return welcomePage($, Box, Button, Text, step, 'band')
    // The card row is a Client, as in the pane: terminal and desktop only.
    const Client = (e.surface === 'terminal' || e.surface === 'desktop') && 'Client' in elements ? elements.Client : null
    const fb = await read($, feedback)
    const revealed = await read($, isRevealed)
    const drilling = await read($, drill)
    const isOn = await read($, autoShow)
    const saying = await read($, speech)
    await read($, settingsTick) // redraw when the voice switch turns
    const sayOn = (await settingsNow($)).sayOnShow
    const word = (
      <Box key="word" minWidth={BAND_WORD_COLUMNS}>
        {wordText(Text, q)}
        {posTag(Box, Text, q.pos.slice(0, 1))}
        {tagView(Box, Text, q.tag, 'band')}
        {drillView($, Box, Button, Text, q, drilling, 'band')}
        {meaning($, Box, Button, Text, q, fb, revealed, 'band')}
        {sayButton($, Box, Button, q, saying)}
        {posTip(Box, Text, q.pos, 'below')}
        {tagTip(Box, Text, q.tag, 'below')}
      </Box>
    )
    const cards: LingoCards = {
      choices: q.choices,
      correct: fb === null ? null : q.answer,
      picked: fb === null ? null : fb.picked,
      verdict: fb === null ? '' : verdictText(deck.language, fb.isCorrect),
      // The desktop's own band (Riley, 2026-11-08): the cards fill the width, "next" under them.
      layout: e.surface === 'desktop' ? 'row-wide' : 'row',
    }
    const isDesktop = e.surface === 'desktop'
    // Between the top line's controls on the desktop: a dim dot, so the two switches read apart.
    const dot = (key: string) => (isDesktop ? <Box key={key}><Text dimColor>·</Text></Box> : null)

    // Two rows (Riley, 2026-11-08): the word on the left and every control on the right of the
    // top line, so nothing is clipped at the band's edge; then the four cards across the full
    // width, two lines of text tall, "next" after them and the result under them.
    return (
      <Box width="100%" flexDirection="column">
        <Box key="band-top" justifyContent="space-between" flexWrap="wrap">
          {word}
          {/* × hides the band until the next turn (or /lingo when the switch is off). */}
          <Box key="top-right" gap={2}>
            {saying !== 'none' && voiceSwitch($, Box, Button, Text, sayOn, 'below')}
            {saying !== 'none' && dot('dot-voice')}
            {autoSwitch($, Box, Button, Text, isOn, 'right', isDesktop ? 'lingo' : undefined)}
            {dot('dot-auto')}
            <Button key="to-pane" label="move to pane" plain onPress={() => choose($, 'pane')} />
            <Button key="close" label="×" role="dismiss" onPress={() => closeBand($)} />
          </Box>
        </Box>
        {Client !== null ? (
          <Box key="cards-row" marginTop={1}>
            <Client key="cards" module="./cards.tsx" props={cards} width="100%" height={BAND_ROWS} />
          </Box>
        ) : (
          // VS Code and mobile draw no Client: plain buttons, keys 1–4, the result in words.
          <Box flexDirection="column" marginTop={1}>
            <Box gap={1} flexWrap="wrap">
              {q.choices.map((choice, i) => (
                <Button
                  key={`a${i + 1}`}
                  label={choice}
                  hotkey={String(i + 1)}
                  variant={fb !== null && i === q.answer ? 'primary' : undefined}
                  onPress={() => answer($, i)}
                />
              ))}
            </Box>
            <Box gap={1}>
              {line(Text, q, fb)}
              {fb !== null && <Button key="next" label="next" variant="primary" onPress={() => askAnother($)} />}
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}

// The view saved in the store's profile; the band until one is chosen.
async function savedView($: EngineInterface): Promise<LingoView> {
  const profile = (await $.store.get('profile')) as { view?: unknown } | undefined
  return profile?.view === 'pane' ? 'pane' : 'band'
}

// Saves the person's choice of view and switches to it.
async function choose($: EngineInterface, chosen: LingoView) {
  const profile = ((await $.store.get('profile')) ?? {}) as Record<string, unknown>
  await $.store.set('profile', { ...profile, schemaVersion: 1, view: chosen })
  await update($, view, () => chosen)
  await show($, chosen)
}

// Shows the card in one view and puts the other away. Opening the pane from a
// command or a button counts as asked, so it is placed at any width; focus
// lets 1–4 answer at once.
async function show($: EngineInterface, shown: LingoView) {
  if (shown === 'pane') {
    await $.ui.open({ id: PANE, title: 'lingo', focus: true })
  } else {
    await $.ui.close({ id: PANE })
    await update($, isBandHidden, () => false)
    await update($, isBandPinned, () => true)
  }
}

// × on the band: hidden until the next turn (switch on) or /lingo.
async function closeBand($: EngineInterface) {
  await update($, isBandHidden, () => true)
  await update($, isBandPinned, () => false)
}

// The switch as saved in the profile; until it is set, the showOnTurn setting.
async function savedAutoShow($: EngineInterface, fallback: boolean): Promise<boolean> {
  const profile = (await $.store.get('profile')) as { autoShow?: unknown } | undefined
  return typeof profile?.autoShow === 'boolean' ? profile.autoShow : fallback
}

// Flips the switch and saves it, on top of the profile as stored right now.
async function setAutoShow($: EngineInterface, isOn: boolean) {
  const profile = ((await $.store.get('profile')) ?? {}) as Record<string, unknown>
  await $.store.set('profile', { ...profile, schemaVersion: 1, autoShow: isOn })
  await update($, autoShow, () => isOn)
}

// While the switch is off: a toast on the session's first turn, then at most
// once per REMIND_EVERY_MS, saying how to turn it back on.
async function remind($: EngineInterface) {
  const now = await $.clock.now()
  const last = await read($, lastReminder)
  if (last !== 0 && now - last < REMIND_EVERY_MS) return
  $.ui.toast('lingo is off. Run /lingo on to get a card each time Claude starts working.', { timeoutMs: 8000 })
  await update($, lastReminder, () => now)
}

// The chunk being learned, as saved in the profile (read fresh: another window
// may have moved on).
async function currentChunk($: EngineInterface): Promise<number> {
  return Math.min(savedChunk(await $.store.get('profile'), deck.language), chunkCount(deck))
}

// Moves on past every chunk now done (PLAN.md §3), saves it on top of the
// profile as stored right now, and says so in a toast. Never moves back.
// The person's limits (src/settings.ts), from the profile as stored now.
async function settingsNow($: EngineInterface): Promise<Settings> {
  return readSettings(await $.store.get('profile'))
}

async function advance($: EngineInterface) {
  const was = await currentChunk($)
  const now = advancedChunk(deck, await $.store.get(cardsKey(deck.language)), was, (await settingsNow($)).toOpenNext)
  if (now <= was) return
  await $.store.set('profile', withChunk(await $.store.get('profile'), deck.language, now))
  // In whole-deck mode the chunk still moves on (it earns the chunk badges, and is where a
  // switch back to chunks resumes), but nothing was locked, so no toast.
  if ((await settingsNow($)).wholeDeck) return
  const p = chunkProgress(deck, undefined, now)
  $.ui.toast(`Chunk ${now} unlocked: words ${p.first}–${p.last}. Words from earlier chunks keep coming back.`, { timeoutMs: 8000 })
}

// /lingo-chunk: where you are and what moves you on.
async function chunkStatus($: EngineInterface): Promise<string> {
  const chunk = await currentChunk($)
  const of = chunkCount(deck)
  const p = chunkProgress(deck, await $.store.get(cardsKey(deck.language)), chunk)
  const cards = readCards(await $.store.get(cardsKey(deck.language)))
  const seen = deck.words.filter(w => w.chunk === chunk && standing(cards[w.id]) === 'seen').length
  const where = `Chunk ${chunk} of ${of}: words ${p.first}–${p.last}. You have learned ${p.learned} of its ${p.total} (${seen} more seen)`
  const learned = 'a word counts as learned once you would likely still recall it a week later'
  const status = chunk === of
    ? `${where} (${learned}). It is the last chunk.`
    : `${where}; ${neededToAdvance(p.total, (await settingsNow($)).toOpenNext)} opens chunk ${chunk + 1} (${learned}).`
  const focus = await focusedChunk($)
  if (focus === null && (await settingsNow($)).wholeDeck) {
    const cards = readCards(await $.store.get(cardsKey(deck.language)))
    const known = deck.words.filter(w => isKnown(cards[w.id])).length
    return `Whole deck: all ${deck.words.length.toLocaleString('en-US')} words are in play, new ones most common first. You have learned ${known} of them. Turn it off in Settings to work chunk by chunk.`
  }

  return focus === null ? status : `${status} You are practicing chunk ${focus}; back to automatic from the chunks view.`
}

// Every chunk's progress, the automatic chunk and the chosen one: what the
// chunks screens draw.
type ChunksNow = {
  progress: ReturnType<typeof chunkProgress>[]
  seen: number[] // per chunk, by index: words seen but not learned yet
  current: number
  focus: number | null
  cards: ReturnType<typeof readCards>
  toOpen: number // the person's "learned to open the next chunk"
  wholeDeck: boolean // whole-deck mode: no chunk is current, none has to open
}
async function chunksNow($: EngineInterface): Promise<ChunksNow> {
  const stored = await $.store.get(cardsKey(deck.language))
  const cards = readCards(stored)
  const chunks = chunkCount(deck)
  return {
    progress: Array.from({ length: chunks }, (_, i) => chunkProgress(deck, stored, i + 1)),
    seen: Array.from({ length: chunks }, (_, i) => deck.words.filter(w => w.chunk === i + 1 && standing(cards[w.id]) === 'seen').length),
    current: await currentChunk($),
    focus: await focusedChunk($),
    cards,
    toOpen: (await settingsNow($)).toOpenNext,
    wholeDeck: (await settingsNow($)).wholeDeck,
  }
}

// Practice one chunk (cards from it alone), or go back to automatic (null);
// saved on top of the profile as stored now, then a fresh card, on the card screen.
async function practice($: EngineInterface, chunk: number | null) {
  await $.store.set('profile', withFocus(await $.store.get('profile'), deck.language, chunk))
  await askAnother($)
  await update($, paneScreen, (): LingoPaneScreen => 'card')
}

// The chunk the person chose to practice, or null for automatic.
async function focusedChunk($: EngineInterface): Promise<number | null> {
  return savedFocus(await $.store.get('profile'), deck.language, chunkCount(deck))
}

// A fresh card, its answer not yet picked: the word the schedule wants next
// (src/queue.ts), never the one just asked while another can be. From the
// chosen chunk alone while one is chosen; else every chunk up to the automatic one.
// `isShown`: the card comes up now (a turn, or "next"), so it is said when that is on.
async function nextCard($: EngineInterface, isShown = true) {
  const last = await read($, question)
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
  const random = seeded(seed)
  const now = await $.clock.now()
  const cards = readCards(await $.store.get(cardsKey(deck.language)))
  const queued = queueOrder({
    deck,
    cards,
    now,
    chunk: await currentChunk($),
    focus: await focusedChunk($),
    newToday: newSince(cards, localDayStart(now, new Date(now).getTimezoneOffset())),
    newPerDay: (await settingsNow($)).newPerDay,
    wholeDeck: (await settingsNow($)).wholeDeck,
    ...(last ? { lastId: last.wordId } : {}),
    ...(await drillLeft($)),
  }, random)
  const next = questionFrom(deck, queued, random)
  await update($, isRevealed, () => false)
  await update($, question, () => next)
  await update($, feedback, () => null)
  // Not awaited: speech resolves only once the word has been said.
  if (isShown && next !== null && (await settingsNow($)).sayOnShow) void sayWord($, next.prompt)
}

// "next", pressed by the person: a fresh card that waits for its answer, so the
// band stays up for it even between turns.
async function askAnother($: EngineInterface) {
  await nextCard($)
  await update($, isShowingResult, () => false)
  await update($, isAwaiting, () => true)
}

// The result's time is up, unless a newer answer has started its own.
async function hideResult($: EngineInterface, answeredAt: number) {
  if ((await read($, resultAt)) === answeredAt) await update($, isShowingResult, () => false)
}

// Records a pick once per card: the first press counts, later ones do nothing.
async function answer($: EngineInterface, picked: number) {
  const q = await read($, question)
  if (q === null || (await read($, feedback)) !== null) return
  const isCorrect = picked === q.answer
  await update($, feedback, (): LingoFeedback => ({ picked, isCorrect }))
  await update($, isAwaiting, () => false)
  // Saved by adding to what is stored right now, read just before each write,
  // so an answer from another Claude window in between is kept.
  const now = await $.clock.now()
  // Keep the result up for RESULT_MS; a later answer's own timer takes over.
  await update($, isShowingResult, () => true)
  await update($, resultAt, () => now)
  $.clock.after(RESULT_MS, () => void hideResult($, now))
  const key = cardsKey(deck.language)
  const wasNew = srsOf(readCards(await $.store.get(key))[q.wordId], now).state === 'new'
  // A new word whose meaning was shown first: studied, not answered. No counts, no
  // streak, no score, no XP; scheduled to come back in a minute to be tried unaided. It
  // still counts toward the day's cards: the day's work was done.
  if (await read($, isRevealed)) {
    await $.store.set(key, withStudied(await $.store.get(key), q.wordId, now, (await settingsNow($)).targetRecall / 100))
    await logDay($, now, { answered: 1, fresh: wasNew ? 1 : 0, language: deck.language })
    return
  }
  // Extra practice moves no schedule; a word missed earlier this session is Hard when right.
  const missed = await read($, missedWords)
  const rating = q.isExtra === true ? null : ratingFor(isCorrect, missed.includes(q.wordId))
  if (!isCorrect && !missed.includes(q.wordId)) await update($, missedWords, m => [...m, q.wordId])
  const cards = withAnswer(await $.store.get(key), q.wordId, isCorrect, now, rating, (await settingsNow($)).targetRecall / 100)
  await $.store.set(key, cards)
  await advance($)
  const ran = withStreak(await $.store.get('stats'), isCorrect)
  const xp = xpFor({ isCorrect, wasNew, isExtra: q.isExtra === true, isRevealed: false, run: ran.streak })
  const stats = { ...ran, xp: ran.xp + xp }
  await $.store.set('stats', stats)
  await update($, streak, () => stats.streak)
  await update($, score, s => ({ correct: (s?.correct ?? 0) + (isCorrect ? 1 : 0), answered: (s?.answered ?? 0) + 1 }))
  await announceLevel($, ran.xp, stats.xp)
  await logDay($, now, { answered: 1, correct: isCorrect ? 1 : 0, graded: 1, fresh: wasNew ? 1 : 0, xp, language: deck.language })
  if (q.tag === 'drill') await drillAnswered($, q.wordId, isCorrect)
  await checkBadges($, now)
}

// Hear the word (PLAN.md §8): the Spanish as the card shows it (nouns with el/la), in the
// chosen voice. A voice not installed: the system's own says it, and a toast says so once.
// No speech at all (no synthesizer): the 🔊 hides for the session, with a toast.
async function sayWord($: EngineInterface, text: string) {
  const state = await read($, speech)
  if (state === 'none') return
  const voice = voiceFor(await settingsNow($), deck.language).name
  if (state === 'ok') {
    try {
      await $.audio.speak(text, { voice })
      return
    } catch {
      // Tried again below without the voice, to tell a missing voice from no speech.
    }
  }
  try {
    await $.audio.speak(text)
    if (state === 'ok') {
      await update($, speech, () => 'no-voice' as const)
      $.ui.toast(`The ${voice} voice isn't installed, so your system's voice said it. Add it in System Settings → Accessibility → Spoken Content.`, { timeoutMs: 8000 })
    }
  } catch {
    await update($, speech, () => 'none' as const)
    $.ui.toast("Speech isn't available here, so 🔊 is hidden.", { timeoutMs: 6000 })
  }
}

function sayButton($: EngineInterface, Box: ElementConstructor<BoxProps>, Button: ElementConstructor<ButtonProps>, q: LingoQuestion, state: 'ok' | 'no-voice' | 'none') {
  if (state === 'none') return null
  return (
    <Box key="say-box" marginLeft={1}>
      <Button key="say" label="🔊" plain onPress={() => sayWord($, q.prompt)} />
    </Box>
  )
}


// A new level reached: its toast, and the chime (src/chime.ts, made as it plays) unless
// turned off.
async function announceLevel($: EngineInterface, wasXp: number, isXp: number) {
  const is = levelOf(isXp).level
  if (is <= levelOf(wasXp).level) return
  $.ui.toast(`Level ${is}! ${isXp} XP so far.`, { timeoutMs: 6000 })
  if ((await settingsNow($)).sounds) void $.audio.play({ base64: chimeBase64(), mime: 'audio/wav' }).catch(() => undefined)
}

// Developer mode's Show first run: the first-run screen on the card, as a new person sees
// it. Its choices save nothing (saveLanguage and startHere end the preview instead).
async function showFirstRun($: EngineInterface) {
  await update($, welcomePreview, () => true)
  await update($, welcome, (): LingoWelcome => 'language')
  await update($, paneScreen, (): LingoPaneScreen => 'card')
}

// The preview ended, with a toast; false when none was on.
async function endPreview($: EngineInterface): Promise<boolean> {
  if (!(await read($, welcomePreview))) return false
  await update($, welcomePreview, () => false)
  await update($, welcome, (): LingoWelcome => 'done')
  $.ui.toast('First-run preview: nothing was saved.', { timeoutMs: 5000 })
  return true
}

// Developer mode's Level up: the XP still needed for the next level, added to the saved
// total, with the level-up's toast and chime. Not an answer: no day logged, no run, no badge.
async function devLevelUp($: EngineInterface) {
  const stats = readStats(await $.store.get('stats'))
  const { into, need } = levelOf(stats.xp)
  const xp = stats.xp + (need - into)
  await $.store.set('stats', { ...stats, xp })
  await update($, settingsTick, n => n + 1)
  await announceLevel($, stats.xp, xp)
}

// The drill's words still to get right, for the queue; nothing when none is under way.
async function drillLeft($: EngineInterface): Promise<{ drill?: string[] }> {
  const d = await read($, drill)
  return d === null ? {} : { drill: d.ids.filter(id => !d.done.includes(id)) }
}

// A drill answer: right, the word is done; wrong, it stays (and is no longer right first
// time). Every word done: the drill ends, and a toast says how it went.
async function drillAnswered($: EngineInterface, wordId: string, isCorrect: boolean) {
  const d = await read($, drill)
  if (d === null) return
  const next: LingoDrill = isCorrect
    ? { ...d, done: d.done.includes(wordId) ? d.done : [...d.done, wordId] }
    : { ...d, missed: d.missed.includes(wordId) ? d.missed : [...d.missed, wordId] }
  if (next.ids.every(id => next.done.includes(id))) {
    const firstTime = next.ids.filter(id => !next.missed.includes(id)).length
    $.ui.toast(`Drill done: ${next.ids.length} words, ${firstTime} right first time.`, { timeoutMs: 6000 })
    await update($, drill, () => null)
    return
  }
  await update($, drill, () => next)
}

// Starts a drill of the words missed most (the Stats page), on the card, with a fresh card.
async function startDrill($: EngineInterface, ids: string[]) {
  await update($, drill, (): LingoDrill => ({ ids, done: [], missed: [] }))
  await update($, paneScreen, (): LingoPaneScreen => 'card')
  await askAnother($)
}

// Badges earned by now (src/badges.ts), each saved once with today's date, and a toast.
async function checkBadges($: EngineInterface, now: number) {
  const today = localDate(now, new Date(now).getTimezoneOffset())
  const stats = readStats(await $.store.get('stats'))
  // Words learned in every language (the core badges are shared); this language's chunk.
  const records = (await allCards($)).flatMap(c => Object.values(c.cards))
  const earned = newlyEarned([...CORE_BADGES, ...chunkBadges(deck.language, chunkCount(deck))], {
    learned: records.filter(r => isKnown(r)).length,
    run: stats.streak,
    dailyStreak: streakNow(stats.daily, today),
    chunk: await currentChunk($),
    localHour: new Date(now).getHours(),
    comeback: records.some(r => (r.srs?.lapses ?? 0) > 0 && isKnown(r)),
  }, stats.badges)
  if (earned.length === 0) return
  const badges = { ...stats.badges, ...Object.fromEntries(earned.map(b => [b.id, today])) }
  await $.store.set('stats', { ...readStats(await $.store.get('stats')), badges })
  for (const b of earned) $.ui.toast(`🏅 Badge earned: ${b.name}`, { timeoutMs: 6000 })
}

// Every language's saved words, with its code: the shared badges and Stats' "All languages".
async function allCards($: EngineInterface): Promise<{ code: string; cards: ReturnType<typeof readCards> }[]> {
  const keys = (await $.store.keys()).filter(k => k.startsWith('cards:')).sort()
  return Promise.all(keys.map(async k => ({ code: k.slice('cards:'.length), cards: readCards(await $.store.get(k)) })))
}

// Adds an answer to today's log (local date), and when today reaches the daily goal,
// counts the day toward the daily streak; then shows the streak in the status line.
async function logDay($: EngineInterface, now: number, delta: Parameters<typeof withDay>[2]) {
  const today = localDate(now, new Date(now).getTimezoneOffset())
  const days = withDay(await $.store.get('days'), today, delta)
  await $.store.set('days', days)
  await countDay($, now)
}

// Counts today toward the daily streak once its cards reach the person's goal (also on
// lowering the goal mid-day: a day already past it counts then). Once a day.
async function countDay($: EngineInterface, now: number) {
  const today = localDate(now, new Date(now).getTimezoneOffset())
  const answered = readDays(await $.store.get('days'))[today]?.answered ?? 0
  const stats = readStats(await $.store.get('stats'))
  if (answered >= (await settingsNow($)).dailyGoal && stats.daily.lastDay !== today) {
    await $.store.set('stats', { ...stats, daily: withDayCounted(stats.daily, today) })
  }
  await showStreak($, now)
}

// At each local midnight, the daily streak shown again (footer and status line), even
// with no answer: a day missed with no freeze then shows 0 straight away. One timer at a
// time: a new session or a reload replaces it.
let midnight: { cancel: () => void } | null = null
async function atMidnight($: EngineInterface) {
  midnight?.cancel()
  const now = await $.clock.now()
  midnight = $.clock.after(msToMidnight(now, new Date(now).getTimezoneOffset()), () => {
    void (async () => {
      await update($, dayTick, n => n + 1)
      await showStreak($, await $.clock.now())
      await atMidnight($)
    })()
  })
}

// The daily streak in the status line, "🔥 3"; cleared while there is none.
async function showStreak($: EngineInterface, now: number) {
  const today = localDate(now, new Date(now).getTimezoneOffset())
  const days = streakNow(readStats(await $.store.get('stats')).daily, today)
  $.ui.status(days > 0 ? `🔥 ${days}` : undefined)
}

// Reads the streak back from the store into the session.
async function refresh($: EngineInterface) {
  const run = readStats(await $.store.get('stats')).streak
  await update($, streak, () => run)
  await showStreak($, await $.clock.now())
}

// /lingo-export: the profile, streak and every word's record, as JSON, always to
// lingo-progress.json in the folder the session runs in. A fixed name (Riley, 2026-11-09): a
// path typed by the person could name a start-up or settings file (`~/.zshrc`) and replace it,
// and the directory's verifier holds a mod that writes a path it cannot read off the source.
// No HOME read either: the verifier holds any environment read for review.
const EXPORT_FILE = 'lingo-progress.json'
async function exportProgress($: EngineInterface, args: string): Promise<string> {
  if (args !== '') return `/lingo-export takes no file name: it always writes ${EXPORT_FILE} in this session's folder. Run it on its own.`
  const now = await $.clock.now()
  const store: Record<string, unknown> = {}
  for (const key of (await $.store.keys()).filter(isOurKey)) store[key] = await $.store.get(key)
  const folder = await $.session.cwd()
  try {
    await $.fs.write('lingo-progress.json', exportText(store, now))
  } catch (err) {
    return `Could not write ${EXPORT_FILE} in ${folder}: ${err instanceof Error ? err.message : String(err)}`
  }
  const { correct, answered } = totals(store[cardsKey(deck.language)])

  return `Exported ${answered} answers (${correct} correct) to ${EXPORT_FILE} in ${folder}. Import it with /lingo-import, in a session in that folder, or /lingo-import <full path to the file>.`
}

// /lingo-import [file]: merged into what is saved, never losing an answer. lingo-progress.json
// in the session's folder, or the file named (a full path, or one relative to that folder).
async function importProgress($: EngineInterface, file: string): Promise<string> {
  if (file.startsWith('~')) return 'Give the full path, without ~ (for example /Users/you/lingo-progress.json).'
  const path = file === '' ? EXPORT_FILE : file
  let text: string
  try {
    text = String(await $.fs.read(path))
  } catch (err) {
    return `Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`
  }
  const store: Record<string, unknown> = {}
  for (const key of (await $.store.keys()).filter(isOurKey)) store[key] = await $.store.get(key)
  const result = importWrites(store, text)
  if (!result.ok) return `Nothing imported: ${result.reason}.`
  for (const [key, value] of Object.entries(result.writes)) await $.store.set(key, value)
  await advance($)
  await refresh($)
  const saved = await savedView($)
  await update($, view, () => saved)

  return `Imported ${path}: ${result.added} new words, ${result.updated} updated.`
}

// The ✓/✗ line after an answer, or nothing before one.
function line(
  Text: (props: { color: 'green' | 'red'; children: string }) => JSX.Element,
  q: LingoQuestion,
  fb: LingoFeedback | null,
) {
  if (fb === null) return null
  const right = q.choices[q.answer] ?? ''
  if (fb.isCorrect) return <Text color="green">{`✓ ${right}`}</Text>

  return <Text color="red">{`✗ ${q.choices[fb.picked] ?? ''}: it's ${right}`}</Text>
}

// A number that shows `label` while hovered: the label is a box drawn hidden
// under it, revealed by the hover group the number lights.
function tip(
  Box: ElementConstructor<BoxProps>,
  Text: ElementConstructor<TextProps>,
  name: string,
  value: number,
  label: string,
) {
  const scope = `lingo-tip-${name}`
  return (
    <Box key={`tip-${name}`}>
      <Box key={`n-${name}`}>
        <Text hover={{ scope, underline: true }}>{String(value)}</Text>
      </Box>
      <Box
        key={`tip-${name}-label`}
        position="absolute"
        top={1}
        right={0}
        display="none"
        hover={{ scope, display: 'flex' }}
        borderStyle="round"
        paddingX={1}
        backgroundColor={TIP.background}
      >
        <Text color={TIP.text}>{label}</Text>
      </Box>
    </Box>
  )
}

// The switch: "● on" / "○ off", pressed (or t) to flip, with a hover tip
// saying what each means. `side` is where the tip hangs from.
// The word's part of speech after it, " (noun)", underlined so it reads as
// something to hover. Its tip is drawn by posTip, last in the same row, so it
// paints over the row and never under the cards drawn after it.
const POS_SCOPE = 'lingo-tip-pos'
// Wide enough for the longest one-line tip under the word, and its padding either side.
const BAND_WORD_COLUMNS = Math.max(...Object.values(POS_HELP).map(p => p.name.length), ...Object.values(TAGS).map(t => t.name.length)) + 2

function posTag(Box: ElementConstructor<BoxProps>, Text: ElementConstructor<TextProps>, shown: string) {
  return (
    <Box key="pos-tip">
      <Text dimColor> (</Text>
      <Box key="pos">
        <Text dimColor underline hover={{ scope: POS_SCOPE, dimColor: false }}>{shown}</Text>
      </Box>
      <Text dimColor>)</Text>
    </Box>
  )
}

// The pane's tip: the full explanation, bordered, in the free rows above the
// word and centred on it. The band's: the name alone, one row under the word,
// inside the word's column (BAND_WORD_COLUMNS wide), so it covers no card.
function posTip(
  Box: ElementConstructor<BoxProps>,
  Text: ElementConstructor<TextProps>,
  pos: string,
  where: { above: { wordColumns: number; rowColumns: number; bodyColumns: number } } | 'below',
) {
  const hidden = { position: 'absolute', display: 'none', hover: { scope: POS_SCOPE, display: 'flex' } } as const
  if (where === 'below') {
    return (
      <Box key="tip-pos-label" {...hidden} top={1} left={0} backgroundColor={TIP.background} paddingX={1}>
        <Text color={TIP.text}>{posName(pos)}</Text>
      </Box>
    )
  }
  const width = Math.max(16, Math.min(36, where.above.bodyColumns - 2))
  return (
    <Box
      key="tip-pos-label"
      {...hidden}
      bottom={1}
      left={tipLeft(where.above.wordColumns, where.above.rowColumns, where.above.bodyColumns, width)}
      width={width}
      borderStyle="round"
      paddingX={1}
      backgroundColor={TIP.background}
    >
      <Text color={TIP.text}>{posTipText(pos)}</Text>
    </Box>
  )
}

// The card's footer: the level, a bar of the way to the next, XP into it; and ×1.5
// while right answers in a row earn the bonus (PLAN.md §6.1).
const XP_BAR = 5
function xpLine(Box: ElementConstructor<BoxProps>, Text: ElementConstructor<TextProps>, xp: number, run: number) {
  const { level, into, need } = levelOf(xp)
  const filled = Math.min(XP_BAR, Math.floor((into / need) * XP_BAR))
  return (
    <Box key="xp" gap={1}>
      <Text bold>{`Lv ${level}`}</Text>
      <Text color={BAR.from}>{'▰'.repeat(filled)}<Text dimColor>{'▱'.repeat(XP_BAR - filled)}</Text></Text>
      <Text dimColor>{`${into}/${need}`}</Text>
      {run >= RUN_FOR_BONUS && <Box key="bonus"><Text color="claude">×1.5</Text></Box>}
    </Box>
  )
}

// Everything the Stats page draws.
type StatsNow = {
  today: string
  log: ReturnType<typeof readDays>
  badges: ReturnType<typeof readStats>['badges']
  daily: number
  freezes: number
  xp: number
  days: ReturnType<typeof lastDays>
  accuracy: ReturnType<typeof accuracy>
  learned: number
  seen: number
  missed: { word: (typeof deck.words)[number]; wrong: number; correct: number }[]
  goal: number // the person's daily goal
  languages: { code: string; learned: number; seen: number }[] // every language with words saved
}
async function statsNow($: EngineInterface): Promise<StatsNow> {
  const now = await $.clock.now()
  const today = localDate(now, new Date(now).getTimezoneOffset())
  const stats = readStats(await $.store.get('stats'))
  const log = readDays(await $.store.get('days'))
  const cards = readCards(await $.store.get(cardsKey(deck.language)))
  const stands = deck.words.map(w => standing(cards[w.id]))
  return {
    today,
    log,
    badges: stats.badges,
    daily: streakNow(stats.daily, today),
    freezes: stats.daily.freezes,
    xp: stats.xp,
    days: lastDays(log, today),
    accuracy: accuracy(log, today, deck.language),
    learned: stands.filter(x => x === 'learned').length,
    seen: stands.filter(x => x === 'seen').length,
    goal: (await settingsNow($)).dailyGoal,
    languages: (await allCards($)).filter(c => DECKS[c.code] !== undefined && Object.keys(c.cards).length > 0).map(c => {
      const words = deckFor(c.code).words
      const all = words.map(w => standing(c.cards[w.id]))
      return { code: c.code, learned: all.filter(x => x === 'learned').length, seen: all.filter(x => x === 'seen').length }
    }),
    missed: mostMissed(cards).flatMap(m => {
      const word = deck.words.find(w => w.id === m.id)
      return word ? [{ word, wrong: m.wrong, correct: m.correct }] : []
    }),
  }
}

// /lingo-stats' one line.
async function statsLine($: EngineInterface): Promise<string> {
  const s = await statsNow($)
  const { level } = levelOf(s.xp)
  const acc = s.accuracy.thisWeek === null ? 'no answers this week yet' : `${s.accuracy.thisWeek}% right this week`
  return `🔥 ${s.daily} day streak · level ${level} (${s.xp} XP) · ${acc} · ${s.learned} ${languageOf(deck.language).name} words learned, ${s.seen} more seen.`
}

const pct = (n: number | null) => (n === null ? '–' : `${n}%`)
// The heatmap's squares (CSS pixels) and shades: none, under the goal, the goal met, twice it.
const HEAT = { cell: 10, gap: 2, colours: ['#30363d', '#5b7a99', '#2ea043', '#56d364'] } as const
const CHART = { width: 300, height: 48 } as const

// The Stats page (PLAN.md §6.4): the streak and level, the last 30 days, accuracy,
// words learned, and the words missed most.
function statsPage(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  Svg: ElementConstructor<SvgProps> | null,
  s: StatsNow,
) {
  const { level, into, need } = levelOf(s.xp)
  return (
    <Box key="stats" flexDirection="column" width="100%" paddingX={1}>
      <Box key="stats-top" justifyContent="space-between">
        <Button key="to-card" label="← card" plain onPress={() => update($, paneScreen, (): LingoPaneScreen => 'card')} />
        <Text bold>Stats</Text>
        <Text> </Text>
      </Box>
      {/* A narrow pane (Riley's screenshot, 2026-10-27): the level drops under the streak
          rather than both being squeezed into wrapped columns. */}
      <Box key="stats-head" marginTop={1} columnGap={3} flexWrap="wrap">
        <Box key="stats-streak" flexShrink={0}><Text bold>{`🔥 ${s.daily} day streak`}</Text>{s.freezes > 0 && <Text dimColor>{`  ${'❄'.repeat(s.freezes)} freeze${s.freezes > 1 ? 's' : ''}`}</Text>}</Box>
        <Box key="stats-level" flexShrink={0}><Text bold>{`Level ${level}`}</Text><Text dimColor>{`  ${s.xp} XP · ${into}/${need} to the next`}</Text></Box>
      </Box>
      <Box key="stats-days-head" marginTop={1}><Text dimColor>{`Cards a day, last 30 days (the line is your daily goal, ${s.goal})`}</Text></Box>
      <Box key="stats-days">
        {Svg !== null
          ? <Svg source={daysSvg(s.days, s.goal, CHART, { bar: BAR.seen, met: BAR.from, goal: '#9aa4b2' })} alt={`Cards a day for the last 30 days, up to ${Math.max(...s.days.map(d => d.answered))}`} width={CHART.width} height={CHART.height} />
          : <Text color={BAR.from}>{daysSparkline(s.days, s.goal)}</Text>}
      </Box>
      <Box key="stats-accuracy" marginTop={1}>
        <Text>{`Accuracy: ${pct(s.accuracy.thisWeek)} this week`}</Text>
        <Text dimColor>{`  (last week ${pct(s.accuracy.lastWeek)})`}</Text>
      </Box>
      <Box key="stats-words"><Text>{`${languageOf(deck.language).name} words: ${s.learned} learned, ${s.seen} more seen, of ${deck.words.length.toLocaleString('en-US')}`}</Text></Box>
      {/* Each language studied, once more than one has words: XP, level and streak above are shared. */}
      {s.languages.length > 1 && (
        <Box key="stats-languages" flexDirection="column">
          <Text dimColor>All languages</Text>
          {s.languages.map(l => (
            <Box key={`stats-language-${l.code}`} gap={1}>
              <Box width={12} flexShrink={0}><Text bold={l.code === deck.language}>{languageOf(l.code).name}</Text></Box>
              <Box flexShrink={1} minWidth={0}><Text dimColor>{`${l.learned} learned, ${l.seen} more seen`}</Text></Box>
            </Box>
          ))}
        </Box>
      )}
      <Box key="stats-heat-head" marginTop={1}><Text dimColor>Last 13 weeks</Text></Box>
      <Box key="stats-heat" flexDirection="column">
        {Svg !== null
          ? <Svg source={heatmapSvg(heatmap(s.log, s.today, s.goal), HEAT.cell, HEAT.gap, HEAT.colours)} alt="Cards a day for the last 13 weeks, a square a day" width={13 * (HEAT.cell + HEAT.gap) - HEAT.gap} height={7 * (HEAT.cell + HEAT.gap) - HEAT.gap} />
          : heatmapLines(heatmap(s.log, s.today, s.goal)).map((line, i) => <Text key={`heat-${i}`} color={BAR.from}>{line}</Text>)}
      </Box>
      <Box key="stats-badges-head" marginTop={1}><Text bold>Badges</Text></Box>
      <Box key="stats-badges" flexDirection="column">
        {CORE_BADGES.map(b => (
          // The icon and name keep their width, so every hint starts in one column; a long
          // hint wraps inside it.
          <Box key={`badge-${b.id}`} gap={1}>
            <Box key={`badge-${b.id}-icon`} width={2} flexShrink={0}><Text>{s.badges[b.id] !== undefined ? '🏅' : '○'}</Text></Box>
            <Box key={`badge-${b.id}-name`} width={12} flexShrink={0}><Text bold={s.badges[b.id] !== undefined} dimColor={s.badges[b.id] === undefined}>{b.name}</Text></Box>
            <Box key={`badge-${b.id}-hint`} flexShrink={1} minWidth={0}><Text dimColor>{s.badges[b.id] ?? b.hint}</Text></Box>
          </Box>
        ))}
        <Box key="badge-chunks"><Text dimColor>{`Chunk badges: ${chunkBadges(deck.language, chunkCount(deck)).filter(b => s.badges[b.id] !== undefined).length} of ${chunkCount(deck) - 1} (one for each chunk you open)`}</Text></Box>
      </Box>
      <Box key="stats-missed-head" marginTop={1} gap={2}>
        <Text bold>Missed most</Text>
        {s.missed.length > 0 && <Button key="drill-start" label="drill these" onPress={() => startDrill($, s.missed.map(m => m.word.id))} />}
      </Box>
      {s.missed.length === 0
        ? <Box key="stats-missed-none"><Text dimColor>Nothing missed yet.</Text></Box>
        : (
          <Box key="stats-missed" flexDirection="column">
            {s.missed.map(m => (
              // The word and counts keep their width, so the meanings start in one column and
              // a long one wraps inside it.
              <Box key={`missed-${m.word.id}`} gap={1}>
                <Box key={`missed-${m.word.id}-word`} width={14} flexShrink={0}><Text bold>{promptText(m.word, deck.language)}</Text></Box>
                <Box key={`missed-${m.word.id}-gloss`} flexGrow={1} flexShrink={1} minWidth={0}><Text dimColor>{choiceText(m.word)}</Text></Box>
                <Box key={`missed-${m.word.id}-counts`} flexShrink={0} gap={1}>
                  <Text color="error">{`✗${m.wrong}`}</Text>
                  <Text color={BAR.from}>{`✓${m.correct}`}</Text>
                </Box>
              </Box>
            ))}
          </Box>
        )}
    </Box>
  )
}

// The Settings page (PLAN.md §4.4): a person's own limits, each a row of its name (hover
// for what it does), − and + (a Button holds only text, so two), the value, its range.
// A change is saved in the profile at once and applies from the next card; lowering what
// opens the next chunk, or the daily goal, can open a chunk or count today straight away.
const SETTING_ROWS: { key: SettingKey; label: string; tip: string; unit?: string }[] = [
  { key: 'newPerDay', label: 'New words a day', tip: "How many words you meet for the first time each day. Reviews aren't limited." },
  { key: 'dailyGoal', label: 'Daily goal (cards)', tip: 'Cards a day that keep your 🔥 streak going.' },
  { key: 'toOpenNext', label: 'Learned to open next chunk', tip: "How many of a chunk's 50 words you need learned before the next chunk opens." },
  { key: 'targetRecall', label: 'Target recall', tip: 'How sure you want to be of remembering a word when it comes back. Higher means more reviews and firmer memory.', unit: '%' },
]
// Then the rows with a choice rather than a number: a dropdown of languages or of voices, or a
// switch.
type ChoiceKey = Switch | 'voice'
const CHOICE_ROWS: { key: ChoiceKey; label: string; tip: string }[] = [
  { key: 'sounds', label: 'Sounds', tip: 'A gentle ding when you reach a new level.' },
  { key: 'sayOnShow', label: 'Say the word when shown', tip: 'Says the word aloud when a new card comes up. 🔊 on the card says it any time.' },
  { key: 'voice', label: 'Voice', tip: "The voice that says the word, for the language you are learning. If it isn't installed, your system's voice is used." },
  { key: 'wholeDeck', label: 'Whole deck (no chunks)', tip: 'All 1,000 words in play: new words come most common first at your daily limit, and no chunk has to be learned before the next.' },
]
// A voice for the language being learned, picked from the dropdown (its name), or the next
// one (null: the stand-in button).
async function chooseVoice($: EngineInterface, name: string | null) {
  const profile = await $.store.get('profile')
  await $.store.set('profile', name === null ? withNextVoice(profile, deck.language) : withVoice(profile, deck.language, name))
  await update($, speech, s => (s === 'no-voice' ? 'ok' : s)) // a new voice gets tried
  await update($, settingsTick, n => n + 1)
}

const languageLabel = (code: string) => `${languageOf(code).name} (${languageOf(code).native})`

function choiceLabel(key: ChoiceKey, values: Settings): string {
  if (key === 'voice') return voiceFor(values, deck.language).label
  return values[key] ? '● on' : '○ off'
}

// A press of a choice's stand-in button (no dropdown): the next voice, or the switch turned.
async function pressChoice($: EngineInterface, key: ChoiceKey) {
  if (key === 'voice') return chooseVoice($, null)
  await $.store.set('profile', withToggled(await $.store.get('profile'), key))
  await update($, settingsTick, n => n + 1)
}
const SETTING_LABEL_COLUMNS = 28
// The controls' column: − value + range, a switch, or the voice dropdown, all starting at one
// place. Narrower than a name and this together, a row puts its controls under its name.
const SETTING_CONTROL_COLUMNS = 26


async function changeSetting($: EngineInterface, key: SettingKey, direction: 1 | -1 | 0) {
  const profile = await $.store.get('profile')
  await $.store.set('profile', direction === 0 ? withDefaults(profile) : withNudge(profile, key, direction))
  await update($, settingsTick, n => n + 1)
  await advance($) // a lower "learned to open next chunk" may open one now
  await countDay($, await $.clock.now()) // a lower daily goal may count today now
}

function settingsPage(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  Select: ElementConstructor<SelectProps> | null,
  values: Settings,
  bodyRows: number,
  dev: Level | null, // developer mode (/lingo-dev): the level now; null when off
  bodyColumns: number,
  isDesktop: boolean,
) {
  // Riley's screenshots, 2026-10-27: in a narrow pane the names' column was squeezed, so the
  // controls started at a different place on each row and the voice was cut short. Each row
  // is one line: its name on the left, wrapping inside the room it has, and its controls in
  // a column at the right that does not shrink, so every row's start at one place. (Names
  // above their controls was tried the same day and turned down.) A row of space between
  // rows on the desktop app, whose buttons fill a row's height.
  const nameColumns = Math.max(8, bodyColumns - 2 - SETTING_CONTROL_COLUMNS - 1)
  const tipWidth = Math.max(16, Math.min(44, bodyColumns - 2))
  // Each tip in its own row, opening upward (over the row before, drawn earlier), so no
  // count of the rows above places it; above as many lines as its name wraps to.
  const tipFor = (key: string, tip: string, label: string) => (
    <Box
      key={`tip-set-${key}`}
      position="absolute"
      bottom={wrappedLines(label, nameColumns)}
      left={0}
      width={tipWidth}
      display="none"
      hover={{ scope: `lingo-tip-set-${key}`, display: 'flex' }}
      borderStyle="round"
      paddingX={1}
      backgroundColor={TIP.background}
    >
      <Text color={TIP.text}>{tip}</Text>
    </Box>
  )
  // `controls` a list, not a fragment: the desktop app drew a fragment as a block of its own,
  // stacking every control on its own line (Riley's screenshot, 2026-10-27).
  const row = (key: string, label: JSX.Element, controls: JSX.Element | JSX.Element[], tip?: { text: string; label: string }) => (
    <Box key={`setting-${key}`} flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
      <Box key={`setting-${key}-name`} flexGrow={1} flexShrink={1} minWidth={0}>{label}</Box>
      <Box key={`setting-${key}-controls`} flexDirection="row" width={SETTING_CONTROL_COLUMNS} flexShrink={0} gap={1} alignItems="center">
        {controls}
      </Box>
      {tip !== undefined && tipFor(key, tip.text, tip.label)}
    </Box>
  )
  const name = (key: string, label: string) => <Text underline hover={{ scope: `lingo-tip-set-${key}`, bold: true }}>{label}</Text>
  return (
    <Box key="settings" flexDirection="column" width="100%" minHeight={bodyRows} paddingX={1}>
      <Box key="settings-top" justifyContent="space-between">
        <Button key="to-card" label="← card" plain onPress={() => update($, paneScreen, (): LingoPaneScreen => 'card')} />
        <Text bold>Settings</Text>
        <Text> </Text>
      </Box>
      <Box key="setting-rows" flexDirection="column" marginTop={1} rowGap={isDesktop ? 1 : 0}>
        {SETTING_ROWS.map(r => {
          const { min, max } = LIMITS[r.key]
          const unit = r.unit ?? ''
          return row(r.key, name(r.key, r.label), [
            <Button key={`set-${r.key}-down`} label="−" onPress={() => changeSetting($, r.key, -1)} />,
            <Box key={`set-${r.key}-value`} width={5} justifyContent="center"><Text bold>{`${values[r.key]}${unit}`}</Text></Box>,
            <Button key={`set-${r.key}-up`} label="+" onPress={() => changeSetting($, r.key, 1)} />,
            <Box key={`set-${r.key}-range`}><Text dimColor>{`${min}–${max}${unit}`}</Text></Box>,
          ], { text: r.tip, label: r.label })
        })}
        {CHOICE_ROWS.map(r => row(r.key, name(r.key, r.label), r.key === 'voice' && Select !== null ? (
          <Select
            key="set-voice"
            options={languageOf(deck.language).voices.map(v => ({ value: v.name, label: v.label }))}
            value={voiceFor(values, deck.language).name}
            onSelect={name => void chooseVoice($, name)}
          />
        ) : (
          <Button key={`set-${r.key}`} label={choiceLabel(r.key, values)} onPress={() => pressChoice($, r.key)} />
        ), { text: r.tip, label: r.label }))}
      </Box>
      <Box key="settings-reset" marginTop={1}>
        <Button key="set-reset" label="reset to defaults" plain dimColor onPress={() => changeSetting($, 'newPerDay', 0)} />
      </Box>
      {dev !== null && (
        <Box key="settings-dev" flexDirection="column" marginTop={1} rowGap={isDesktop ? 1 : 0}>
          {row('dev-level', <Text dimColor>Developer</Text>, [
            <Button key="dev-level-up" label={`Level up → ${dev.level + 1}`} onPress={() => devLevelUp($)} />,
            <Box key="dev-level" flexShrink={0}><Text dimColor>{`Lv ${dev.level}, ${dev.into}/${dev.need}`}</Text></Box>,
          ])}
          {row('dev-first-run', <Text> </Text>, <Button key="dev-first-run" label="Show first run" onPress={() => showFirstRun($)} />)}
        </Box>
      )}
    </Box>
  )
}

// The pane's menu: a drawer down the right half of the body, opened and closed by the
// gear (or its ×, or a pick). The body is laid out again around it rather than covered by
// it: a press on a box drawn over others lands on what is under it, and the keyboard
// reaches in-layout buttons. The answer cards are hidden while it is open (half of them
// would hold the answer); the word stays on the left. New pages go here. No fill: nothing
// is under it, and a Button's text cannot be coloured to suit a dark fill in a light theme.
// Each a choice of its own, marked with a leading bullet.
const MENU = [
  { key: 'menu-language', label: '• Language' }, // shown as "Language: Spanish" (menuLabel)
  { key: 'menu-chunks', label: '• Word Chunks' },
  { key: 'menu-flashcards', label: '• Flashcards' },
  { key: 'menu-placement', label: '• Placement test' },
  { key: 'menu-stats', label: '• Stats' },
  { key: 'menu-settings', label: '• Settings' },
  { key: 'menu-band', label: '• Switch to band view' },
] as const
type MenuKey = (typeof MENU)[number]['key']
const MENU_REST = 'menu' // the dropdown's resting option: a pick of it goes nowhere
// An item's label, the language one naming the language being learned (Riley, 2026-10-30:
// the language is chosen from the menu, not from inside Settings).
const menuLabel = (item: (typeof MENU)[number]) =>
  item.key === 'menu-language' ? `• Language: ${languageOf(deck.language).name}` : item.label

// A page of the menu, from the dropdown or the drawer.
function goTo($: EngineInterface, key: MenuKey): Promise<unknown> {
  const go: Record<MenuKey, () => Promise<unknown>> = {
    'menu-language': () => update($, paneScreen, (): LingoPaneScreen => 'language'),
    'menu-chunks': () => update($, paneScreen, (): LingoPaneScreen => 'chunks'),
    'menu-placement': () => beginPlacement($),
    'menu-flashcards': () => openFlashcards($),
    'menu-stats': () => update($, paneScreen, (): LingoPaneScreen => 'stats'),
    'menu-settings': () => update($, paneScreen, (): LingoPaneScreen => 'settings'),
    'menu-band': () => choose($, 'band'),
  }
  return go[key]()
}

function menuDrawer($: EngineInterface, Box: ElementConstructor<BoxProps>, Button: ElementConstructor<ButtonProps>, Text: ElementConstructor<TextProps>) {
  return (
    <Box key="menu-drawer" flexDirection="column" width="50%" borderStyle="round" paddingX={1}>
      <Box key="drawer-top" justifyContent="space-between">
        <Text bold>Menu</Text>
        <Button key="menu-close" label="×" plain onPress={() => update($, isMenuOpen, () => false)} />
      </Box>
      {MENU.map(item => (
        <Box key={`${item.key}-row`} flexDirection="column" marginTop={1}>
          <Button
            key={item.key}
            label={menuLabel(item)}
            plain
            onPress={async () => {
              await update($, isMenuOpen, () => false)
              await goTo($, item.key)
            }}
          />
        </Box>
      ))}
    </Box>
  )
}

// The chunks list (PLAN.md §3, step 2): one row per chunk, its learned words as
// a bar, the automatic chunk, the chosen one and the finished ones marked; a
// row opens that chunk's words. Taller than the pane, it scrolls.
function chunksList(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  Svg: ElementConstructor<SvgProps> | null,
  now: ChunksNow,
  bodyColumns: number,
) {
  // A narrow pane (Riley's screenshot, 2026-10-27): the marks shorten to their symbol, the
  // number, count and mark columns keep their width (the bar gives way instead), and every
  // tip is held inside the pane, which the desktop app clips at its edge.
  const isNarrow = bodyColumns < CHUNKS_WIDE_COLUMNS
  const markColumns = isNarrow ? 2 : 12
  const tipWidth = (most: number) => Math.max(16, Math.min(most, bodyColumns - 2))
  return (
    <Box key="chunks" flexDirection="column" width="100%" paddingX={1}>
      <Box key="chunks-top" justifyContent="space-between">
        <Button key="to-card" label="← card" plain onPress={() => update($, paneScreen, (): LingoPaneScreen => 'card')} />
        <Text bold>Word Chunks</Text>
        {/* The mode, and while a chunk is practiced, the way back right beside it. */}
        <Box key="mode-row" gap={2}>
          <Box key="mode"><Text dimColor underline hover={{ scope: MODE_SCOPE, dimColor: false }}>{now.focus !== null ? `focus: ${now.focus}` : now.wholeDeck ? 'whole deck' : 'automatic'}</Text></Box>
          {now.focus !== null && <Button key="auto-mode" label={now.wholeDeck ? 'back to whole deck' : 'back to automatic'} plain onPress={() => practice($, null)} />}
        </Box>
      </Box>
      <Box key="instructions" marginTop={1}>
        <Text dimColor>{now.wholeDeck ? 'Whole deck: every word is in play. Pick a number to see its words.' : `${now.toOpen} learned opens the next chunk. Pick a number to see its words.`}</Text>
      </Box>
      {/* Still at the start: the placement test may skip what is known already. */}
      {now.current === 1 && now.progress.every(p => p.learned === 0) && (
        <Box key="chunks-placement" marginTop={1}>
          <Button key="chunks-placement-start" label={`Know some ${languageOf(deck.language).name}? Take the placement test`} plain onPress={() => beginPlacement($)} />
        </Box>
      )}
      {/* Fixed-width columns, so the rows line up in any font: the number, the
          bar (learned, seen, the rest), the count, the mark. */}
      <Box key="chunk-rows" flexDirection="column" marginY={1}>
        {/* Column heads, lined up with the rows: the same number column, an empty bar the
            bar's width, then the count columns. "learned" explains itself on hover; its tip
            is the last thing in this block, one row down, so it opens just under the heads
            and the rows (drawn before it) do not paint over it. */}
        <Box key="chunk-head" gap={1}>
          <Box key="number-head" width={NUMBER_COLUMNS} flexShrink={0} />
          {Svg !== null
            ? <Box key="bar-head" flexShrink={1} minWidth={0}><Svg source={blankSvg(BAR_SVG.width, 1)} alt="column heads" width={BAR_SVG.width} height={1} /></Box>
            : <Box key="bar-head" width={BAR_CELLS} flexShrink={1} minWidth={0} />}
          <Box key="count-head" width={COUNT_COLUMNS} flexShrink={0} gap={1}>
            <Box key="head-learned" width={COLS.learned} justifyContent="flex-end">
              <Text color={BAR.from} underline hover={{ scope: LEARNED_SCOPE, bold: true }}>learned</Text>
            </Box>
            <Box key="head-seen" width={COLS.seen} justifyContent="flex-end"><Text color={BAR.seen}>seen</Text></Box>
            <Box key="head-total" width={COLS.total} justifyContent="flex-end"><Text dimColor>total</Text></Box>
          </Box>
          <Box key="mark-head" width={markColumns} flexShrink={0} />
        </Box>
        {now.progress.map((p, i) => {
          const bar = barCells(p.learned, now.seen[i] ?? 0, p.total, BAR_CELLS)
          const isMine = p.chunk === now.focus || (p.chunk === now.current && now.focus === null && !now.wholeDeck)
          const isDone = p.learned >= neededToAdvance(p.total, now.toOpen)
          const mark = p.chunk === now.focus ? (isNarrow ? '◀' : '◀ practicing') : isMine ? (isNarrow ? '◀' : '◀ current') : isDone ? (isNarrow ? '✓' : '✓ done') : ''
          return (
            <Box key={`chunk-${p.chunk}`} gap={1}>
              <Box key={`number-${p.chunk}`} width={NUMBER_COLUMNS} flexShrink={0} justifyContent="flex-end">
                <Button key={`open-${p.chunk}`} label={String(p.chunk)} plain onPress={() => update($, paneScreen, (): LingoPaneScreen => ({ chunk: p.chunk }))} />
              </Box>
              {/* The desktop app: a rounded SVG bar (src/bar.ts). The terminal: coloured
                  boxes, not coloured spaces, since a box's background fills its whole
                  area, so the fill runs edge to edge over the track with no gaps. */}
              {Svg !== null ? (
                <Box key={`bar-${p.chunk}`} alignItems="center" flexShrink={1} minWidth={0}>
                  <Svg
                    source={barSvg(p.learned, now.seen[i] ?? 0, p.total, BAR_SVG, BAR)}
                    alt={`Chunk ${p.chunk}: ${p.learned} of ${p.total} learned, ${now.seen[i] ?? 0} seen`}
                    width={BAR_SVG.width}
                    height={BAR_SVG.height + 2 * BAR_SVG.pad}
                  />
                </Box>
              ) : (
                <Box key={`bar-${p.chunk}`} width={BAR_CELLS} height={1} flexShrink={1} minWidth={0} backgroundColor={BAR.track} alignItems="stretch">
                  {bar.learned > 0 && (
                    <Box key={`bar-${p.chunk}-learned`} width={bar.learned} alignItems="stretch">
                      {Array.from({ length: bar.learned }, (_, cell) => (
                        <Box key={`c${cell}`} width={1} backgroundColor={gradientAt(BAR.from, BAR.to, BAR_CELLS, cell)} />
                      ))}
                    </Box>
                  )}
                  {bar.seen > 0 && <Box key={`bar-${p.chunk}-seen`} width={bar.seen} backgroundColor={BAR.seen} />}
                  {bar.rest > 0 && <Box key={`bar-${p.chunk}-rest`} width={bar.rest} />}
                </Box>
              )}
              {chunkCount$(Box, Text, p.chunk, p.learned, now.seen[i] ?? 0, p.total, isMine)}
              <Box key={`mark-${p.chunk}`} width={markColumns} flexShrink={0}>
                <Text color={isMine ? 'claude' : isDone ? 'success' : undefined}>{mark}</Text>
              </Box>
              {countTip(Box, Text, p.chunk, p.learned, now.seen[i] ?? 0, p.total, now.toOpen, tipWidth(36))}
            </Box>
          )
        })}
        <Box
          key="tip-learned-label"
          position="absolute"
          top={1}
          left={0}
          width={tipWidth(44)}
          display="none"
          hover={{ scope: LEARNED_SCOPE, display: 'flex' }}
          borderStyle="round"
          paddingX={1}
          backgroundColor={TIP.background}
        >
          <Text color={TIP.text}>{learnedTip(now.toOpen)}</Text>
        </Box>
      </Box>
      {/* The key, lined up under the bars (past the number column and its gap): a chip per
          part, drawn as the bars are (rounded SVG on the desktop app, a cell on the terminal). */}
      <Box key="legend" gap={isNarrow ? 2 : 3} paddingLeft={NUMBER_COLUMNS + 1}>
        {(['learned', 'seen', 'rest'] as const).map(part => (
          <Box key={`legend-${part}`} gap={1} alignItems="center" flexShrink={0}>
            {Svg !== null
              ? <Svg source={chipSvg(part, LEGEND_CHIP, BAR)} alt={part === 'rest' ? 'not yet' : part} width={LEGEND_CHIP.width} height={LEGEND_CHIP.height} />
              : <Box key={`chip-${part}`} width={2} height={1} backgroundColor={part === 'learned' ? BAR.from : part === 'seen' ? BAR.seen : BAR.track} />}
            <Text dimColor>{part === 'rest' ? 'not yet' : part}</Text>
          </Box>
        ))}
      </Box>
      {/* The mode's tip, under the top row at the right. Last in the list, so nothing drawn
          after it paints over it. */}
      <Box
        key="tip-mode-label"
        position="absolute"
        top={1}
        right={1}
        width={tipWidth(40)}
        display="none"
        hover={{ scope: MODE_SCOPE, display: 'flex' }}
        borderStyle="round"
        paddingX={1}
        backgroundColor={TIP.background}
      >
        <Text color={TIP.text}>{now.focus !== null ? MODE_TIP.focus(now.focus) : now.wholeDeck ? MODE_TIP.whole : MODE_TIP.automatic(now.toOpen)}</Text>
      </Box>
    </Box>
  )
}

// A chunk's count, in its bar's colours: learned (green), seen but not learned yet
// (slate), then "/50"; a part that is zero dim. Hover for it in words. The tip sits above
// the count: a tip paints over the rows before it, and the rows after paint over it.
// The count columns, each right-aligned in a fixed width so the digits line up under
// their heads in any font: learned, seen, total.
const COLS = { learned: 7, seen: 4, total: 5 } as const
const COUNT_COLUMNS = COLS.learned + COLS.seen + COLS.total + 2
const LEARNED_SCOPE = 'lingo-tip-learned'
const MODE_SCOPE = 'lingo-tip-mode'
const MODE_TIP = {
  automatic: (toOpen: number) =>
    `Automatic: cards come from your current chunk and the ones before it, and the next chunk opens by itself at ${toOpen} learned. To work on one chunk, open it and press "practice this chunk".`,
  whole: 'Whole deck: cards come from all the words, new ones most common first at your daily limit; no chunk has to be learned first. Turn it off in Settings.',
  focus: (chunk: number) =>
    `Practicing chunk ${chunk}: cards come only from it, with no daily limit on new words. Press "back to automatic", beside this, to return to your current chunk.`,
}
const learnedTip = (toOpen: number) =>
  `A word is learned once you'd likely still recall it a week later. Usually: right when it's new, right again 10 minutes later, then right at its review a couple of days on. A miss sets it back. ${toOpen} learned opens the next chunk.`
function chunkCount$(
  Box: ElementConstructor<BoxProps>,
  Text: ElementConstructor<TextProps>,
  chunk: number,
  learned: number,
  seen: number,
  total: number,
  isMine: boolean,
) {
  const scope = `lingo-tip-count-${chunk}`
  return (
    <Box key={`count-${chunk}`} width={COUNT_COLUMNS} flexShrink={0} gap={1}>
      <Box key={`learned-${chunk}`} width={COLS.learned} justifyContent="flex-end"><Text bold={isMine} color={learned > 0 ? BAR.from : undefined} dimColor={learned === 0} hover={{ scope, underline: true }}>{String(learned)}</Text></Box>
      <Box key={`seen-${chunk}`} width={COLS.seen} justifyContent="flex-end"><Text bold={isMine} color={seen > 0 ? BAR.seen : undefined} dimColor={seen === 0} hover={{ scope, underline: true }}>{String(seen)}</Text></Box>
      <Box key={`total-${chunk}`} width={COLS.total} justifyContent="flex-end"><Text dimColor>{String(total)}</Text></Box>
    </Box>
  )
}

// A chunk's count in words, on hover: above its row, from the row's left edge (not the
// count's right one, which in a narrow pane put it past the pane's left edge), last in the
// row so the row does not paint over it.
function countTip(
  Box: ElementConstructor<BoxProps>,
  Text: ElementConstructor<TextProps>,
  chunk: number,
  learned: number,
  seen: number,
  total: number,
  toOpen: number,
  width: number,
) {
  return (
    <Box
      key={`tip-count-${chunk}`}
      position="absolute"
      bottom={1}
      left={0}
      width={width}
      display="none"
      hover={{ scope: `lingo-tip-count-${chunk}`, display: 'flex' }}
      borderStyle="round"
      paddingX={1}
      backgroundColor={TIP.background}
    >
      <Text color={TIP.text}>{`${learned} learned, ${seen} seen, of ${total}. ${toOpen} learned opens the next chunk.`}</Text>
    </Box>
  )
}
// The chunk number's column: "20" and the button's own padding. 3 cut "10" to "1.." in the
// desktop app's narrow pane (Riley's screenshot, 2026-10-27), whose digits are not one cell.
const NUMBER_COLUMNS = 5
// Below this many columns the chunks list is laid out narrow.
const CHUNKS_WIDE_COLUMNS = 52

// One chunk's words: learned (✓), seen but not learned yet (~), not seen (·),
// with its answer; "practice this chunk" makes cards come from it alone.
function chunkWords(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  chunk: number,
  now: ChunksNow,
) {
  const words = deck.words.filter(w => w.chunk === chunk)
  const stands = words.map(w => standing(now.cards[w.id]))
  const count = (s: string) => stands.filter(x => x === s).length
  const p = now.progress[chunk - 1]
  const MARK = { learned: '✓', seen: '~', new: '·' } as const
  return (
    <Box key="chunk-words" flexDirection="column" width="100%" paddingX={1}>
      <Box key="words-top" justifyContent="space-between">
        <Button key="to-chunks" label="← chunks" plain onPress={() => update($, paneScreen, (): LingoPaneScreen => 'chunks')} />
        <Text bold>{`Chunk ${chunk} · words ${p?.first ?? 0}–${p?.last ?? 0}`}</Text>
      </Box>
      <Box key="words-summary"><Text dimColor>{`${count('learned')} learned · ${count('seen')} seen · ${count('new')} not yet`}</Text></Box>
      <Box key="word-rows" flexDirection="column" marginY={1}>
        {words.map((w, i) => (
          <Box key={`w-${w.id}`} gap={1}>
            <Box key={`m-${w.id}`}>
              <Text color={stands[i] === 'learned' ? 'success' : undefined} dimColor={stands[i] === 'new'}>{MARK[stands[i] ?? 'new']}</Text>
            </Box>
            <Text bold>{promptText(w, deck.language)}</Text>
            <Text dimColor>{choiceText(w)}</Text>
          </Box>
        ))}
      </Box>
      {now.focus === chunk
        ? <Button key="auto-mode" label="back to automatic" onPress={() => practice($, null)} />
        : <Button key="focus" label="practice this chunk" variant="primary" onPress={() => practice($, chunk)} />}
    </Box>
  )
}

// The word: a new one purple and underlined.
function wordText(Text: ElementConstructor<TextProps>, q: LingoQuestion) {
  const isNew = q.tag === 'new'
  return <Text bold {...(isNew ? { color: NEW_WORD, underline: true } : {})}>{q.prompt}</Text>
}


function tagView(Box: ElementConstructor<BoxProps>, Text: ElementConstructor<TextProps>, tag: LingoQuestion['tag'], where: 'pane' | 'band') {
  if (tag === undefined) return null
  return (
    <Box key="tag" marginLeft={1}>
      <Text color={tag === 'new' ? NEW_WORD : undefined} dimColor={tag !== 'new'} hover={{ scope: TAG_SCOPE, dimColor: false }}>{TAGS[tag][where]}</Text>
    </Box>
  )
}

// A drill under way: its progress after the tag ("3/10", words got right of its words) and
// "stop", which ends it and goes back to the schedule.
function drillView(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  q: LingoQuestion,
  d: LingoDrill | null,
  where: 'pane' | 'band',
) {
  if (d === null || q.tag !== 'drill') return null
  return (
    <Box key="drill-progress" marginLeft={1} gap={1}>
      <Text dimColor>{`${d.done.length}/${d.ids.length}`}</Text>
      <Button key="drill-stop" label={where === 'pane' ? 'stop' : '×'} plain onPress={async () => {
        await update($, drill, () => null)
        await askAnother($)
      }} />
    </Box>
  )
}

// The tag's tip: like the part of speech's, above the word in the pane, its name one row
// under it in the band.
function tagTip(
  Box: ElementConstructor<BoxProps>,
  Text: ElementConstructor<TextProps>,
  tag: LingoQuestion['tag'],
  where: { above: { wordColumns: number; rowColumns: number; bodyColumns: number } } | 'below',
) {
  if (tag === undefined) return null
  const hidden = { position: 'absolute', display: 'none', hover: { scope: TAG_SCOPE, display: 'flex' } } as const
  if (where === 'below') {
    return <Box key="tip-tag-label" {...hidden} top={1} left={0} backgroundColor={TIP.background} paddingX={1}><Text color={TIP.text}>{TAGS[tag].name}</Text></Box>
  }
  const width = Math.max(16, Math.min(36, where.above.bodyColumns - 2))
  return (
    <Box key="tip-tag-label" {...hidden} bottom={1} left={tipLeft(where.above.wordColumns, where.above.rowColumns, where.above.bodyColumns, width)} width={width} borderStyle="round" paddingX={1} backgroundColor={TIP.background}>
      <Text color={TIP.text}>{TAGS[tag].tip}</Text>
    </Box>
  )
}

// A new word's meaning on request: "show meaning" until answered; once shown, the
// meaning itself, in the new word's colour. A button beside the tag rather than in the
// tip: a press on a tip (an absolute box) lands on its parent, and the keyboard cannot
// reach a tip at all.
function meaning(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  q: LingoQuestion,
  fb: LingoFeedback | null,
  revealed: boolean,
  where: 'pane' | 'band',
) {
  if (q.tag !== 'new') return null
  if (revealed) return <Box key="meaning" marginLeft={1}><Text color={NEW_WORD}>{`= ${q.choices[q.answer] ?? ''}`}</Text></Box>
  if (fb !== null) return null
  return (
    <Box key="reveal" marginLeft={1}>
      <Button key="show-meaning" label={where === 'pane' ? 'show meaning' : 'show'} plain onPress={() => update($, isRevealed, () => true)} />
    </Box>
  )
}

function autoSwitch(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  isOn: boolean,
  side: 'left' | 'right',
  name?: string, // shown before the switch (the desktop band's "lingo", beside the voice switch)
) {
  const scope = 'lingo-tip-auto'
  const label = isOn
    ? 'On: opens every time Claude starts working. Closing it hides it until the next turn.'
    : 'Off: stays closed until you run /lingo.'
  return (
    <Box key="auto-switch" gap={1}>
      {name !== undefined && <Text>{name}</Text>}
      <Button
        key="auto"
        label={isOn ? '● on' : '○ off'}
       
        plain
        hover={{ scope, underline: true }}
        onPress={() => setAutoShow($, !isOn)}
      />
      <Box
        key="tip-auto-label"
        position="absolute"
        top={1}
        {...(side === 'left' ? { left: 0 } : { right: 0 })}
        width={36}
        display="none"
        hover={{ scope, display: 'flex' }}
        borderStyle="round"
        paddingX={1}
        backgroundColor={TIP.background}
      >
        <Text color={TIP.text}>{label}</Text>
      </Box>
    </Box>
  )
}

// The voice switch, bottom right of the pane and on the band's top line: "🔊 voice" and a switch drawn like the top left's
// (Riley, 2026-11-08). It turns "Say the word when shown"; its tip opens above it, inside the pane.
function voiceSwitch(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  isOn: boolean,
  tipOpens: 'above' | 'below' = 'above', // above in the pane's footer, below on the band's top line
) {
  const scope = 'lingo-tip-voice'
  return (
    <Box key="voice-switch" gap={1}>
      <Text>🔊 voice</Text>
      <Button key="say-switch" label={isOn ? '● on' : '○ off'} plain hover={{ scope, underline: true }} onPress={() => pressChoice($, 'sayOnShow')} />
      <Box
        key="tip-voice-label"
        position="absolute"
        {...(tipOpens === 'above' ? { bottom: 1 } : { top: 1 })}
        right={0}
        width={36}
        display="none"
        hover={{ scope, display: 'flex' }}
        borderStyle="round"
        paddingX={1}
        backgroundColor={TIP.background}
      >
        <Text color={TIP.text}>{isOn ? 'On: each new word is said aloud as it comes up.' : 'Off: words are said only when you press 🔊.'}</Text>
      </Box>
    </Box>
  )
}

// ---- First run and the placement test (PLAN.md §3) ----------------------------------

// The languages begun (profile.started): by "Start from the beginning" or a placement's
// "Start here". Before there was more than one language (until 2026-10-29), a saved
// `language` meant that language was begun.
function startedIn(profile: unknown): string[] {
  const p = (profile ?? {}) as { started?: unknown; language?: unknown }
  if (Array.isArray(p.started)) return p.started.filter((c): c is string => typeof c === 'string')
  return typeof p.language === 'string' ? [p.language] : []
}

// Set up in the language being learned: begun, or with progress saved (someone from before
// the first-run screen, or an import).
async function isSetUp($: EngineInterface): Promise<boolean> {
  if (startedIn(await $.store.get('profile')).includes(deck.language)) return true
  return Object.keys(readCards(await $.store.get(cardsKey(deck.language)))).length > 0
}

// The language being learned marked begun, everything else kept. In developer mode's
// preview, nothing: the preview ends.
async function saveLanguage($: EngineInterface) {
  if (await endPreview($)) return
  const p = ((await $.store.get('profile')) ?? {}) as Record<string, unknown>
  const started = [...new Set([...startedIn(p), deck.language])]
  await $.store.set('profile', { ...p, schemaVersion: (p.schemaVersion as number | undefined) ?? 1, language: deck.language, started })
  await update($, welcome, (): LingoWelcome => 'done')
}

// Learning another language: saved as the language being learned, a card from its deck, and
// this session's drill, flashcards, placement test and missed words put away (they were the
// other deck's). Not yet begun: its "Do you know some already?" step on the card screen.
async function switchLanguage($: EngineInterface, code: string) {
  const p = ((await $.store.get('profile')) ?? {}) as Record<string, unknown>
  if (deckFor(code).language !== code || p.language === code) return
  // Saved with the languages begun so far, so an older profile's `language` is not lost from them.
  await $.store.set('profile', { ...p, schemaVersion: (p.schemaVersion as number | undefined) ?? 1, language: code, started: startedIn(p) })
  await syncDeck($)
  await update($, placement, () => null)
  await update($, flash, () => null)
  await update($, drill, () => null)
  await update($, missedWords, () => [])
  await update($, speech, () => 'ok' as const) // its voice gets tried
  await askAnother($)
  await update($, settingsTick, n => n + 1)
  if (!(await isSetUp($))) {
    await update($, welcome, (): LingoWelcome => 'how')
    await update($, paneScreen, (): LingoPaneScreen => 'card')
  }
}

function welcomePage(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  step: 'language' | 'how',
  where: 'pane' | 'band',
  bodyRows = 0, // the pane's: the screen is centred in it
) {
  // A pick saves the language (not begun until a start below); in developer mode's preview it
  // only moves on, so the preview changes nothing.
  const pickLanguage = offered().map(l => (
    <Button key={`lang-${l.code}`} label={`${l.name} (${l.native})`} onPress={async () => {
      if (!(await read($, welcomePreview))) await switchLanguage($, l.code)
      await update($, welcome, (): LingoWelcome => 'how')
    }} />
  ))
  const name = languageOf(deck.language).name
  const begin = <Button key="start-beginning" label="Start from the beginning" onPress={() => saveLanguage($)} />
  const test = <Button key="start-placement" label="Take the placement test" onPress={() => beginPlacement($)} />
  const back = <Button key="welcome-back" label="← back" plain onPress={() => update($, welcome, (): LingoWelcome => 'language')} />
  if (where === 'band') {
    // One row: the band has no room for the explanations; the test opens in the pane.
    return (
      <Box key="welcome" width="100%" gap={1} alignItems="center">
        <Text bold>Welcome to lingo.</Text>
        {step === 'language' ? <Text>Learn:</Text> : <Text>{`${name}. Know some already?`}</Text>}
        {step === 'language' ? pickLanguage : [begin, test, back]}
      </Box>
    )
  }
  return (
    // At least as tall as the pane, so it is centred top to bottom too; taller, it scrolls.
    <Box key="welcome" flexDirection="column" width="100%" minHeight={bodyRows} paddingX={1} alignItems="center" justifyContent="center">
      <Text bold>Welcome to lingo</Text>
      <Box key="welcome-about" marginTop={1}><Text dimColor>Learn the 1,000 most common words while Claude works.</Text></Box>
      {step === 'language' ? (
        <Box key="welcome-language" flexDirection="column" alignItems="center" marginTop={1}>
          <Text>Which language do you want to learn?</Text>
          <Box key="languages" marginTop={1} gap={2} flexWrap="wrap" justifyContent="center">{pickLanguage}</Box>
        </Box>
      ) : (
        <Box key="welcome-how" flexDirection="column" alignItems="center" marginTop={1}>
          <Text>{`${name}. Do you know some already?`}</Text>
          <Box key="begin-row" flexDirection="column" alignItems="center" marginTop={1}>
            {begin}
            <Text dimColor>The most common words first.</Text>
          </Box>
          <Box key="test-row" flexDirection="column" alignItems="center" marginTop={1}>
            {test}
            <Text dimColor>{`${QUESTIONS} quick questions find where to start.`}</Text>
          </Box>
          <Box key="back-row" marginTop={1}>{back}</Box>
        </Box>
      )}
    </Box>
  )
}

// A question from the chunk being probed, never one already asked; null once done.
function placementQuestion(p: Placement): LingoQuestion | null {
  if (p.result !== null) return null
  const random = seeded(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
  const words = shuffled(deck.words.filter(w => w.chunk === p.probe && !p.used.includes(w.id)), random)
  return questionFrom(deck, words.map(word => ({ word, isExtra: false })), random)
}

// Starts the test, in the pane (the band has no room for it). Nothing is saved until
// "Start here".
async function beginPlacement($: EngineInterface) {
  const p = startPlacement(chunkCount(deck))
  await update($, placement, (): LingoPlacement => ({ ...p, q: placementQuestion(p) }))
  await update($, paneScreen, (): LingoPaneScreen => 'placement')
  await $.ui.open({ id: PANE, title: 'lingo', focus: true })
}

// An answer: a pick (0–3), or "I don't know". No XP, streak or day: the test is not practice.
async function placementAnswer($: EngineInterface, pick: number | 'skip') {
  const p = await read($, placement)
  if (p === null || p.q === null || p.result !== null) return
  const next = withPlacementAnswer(p, p.q.wordId, pick !== 'skip' && pick === p.q.answer)
  await update($, placement, (): LingoPlacement => ({ ...next, q: placementQuestion(next) }))
}

// "Start here": the earlier chunks' words placed (src/placement.ts), the chunk moved on
// (never back), the language saved, and a card from the new chunk in the chosen view.
async function startHere($: EngineInterface) {
  const p = await read($, placement)
  if (p === null || p.result === null) return
  if (await endPreview($)) {
    await update($, placement, () => null)
    await update($, paneScreen, (): LingoPaneScreen => 'card')
    return
  }
  const key = cardsKey(deck.language)
  await $.store.set(key, withPlacement(deck, await $.store.get(key), p.result, p.missed, await $.clock.now()))
  const profile = await $.store.get('profile')
  const chunk = Math.max(savedChunk(profile, deck.language), p.result)
  await $.store.set('profile', withChunk(profile, deck.language, chunk))
  await saveLanguage($)
  await update($, placement, () => null)
  await askAnother($)
  await update($, paneScreen, (): LingoPaneScreen => 'card')
  $.ui.toast(`You start at chunk ${chunk}.`, { timeoutMs: 6000 })
  if ((await read($, view)) === 'band') await show($, 'band')
}

// Cancel: nothing saved; back to the card (or the first-run screen, if not set up).
async function cancelPlacement($: EngineInterface) {
  await update($, placement, () => null)
  await update($, paneScreen, (): LingoPaneScreen => 'card')
  if ((await read($, view)) === 'band') await $.ui.close({ id: PANE })
}

async function placementPage(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  Client: ElementConstructor<ClientProps> | null,
  p: LingoPlacement | null,
  bodyRows: number,
) {
  const top = (right: string) => (
    <Box key="placement-top" justifyContent="space-between">
      <Button key="placement-cancel" label="← cancel" plain onPress={() => cancelPlacement($)} />
      <Text bold>Placement test</Text>
      <Text dimColor>{right}</Text>
    </Box>
  )
  if (p === null) {
    return (
      <Box key="placement" flexDirection="column" width="100%" paddingX={1}>
        {top('')}
        <Box key="placement-start" marginTop={1}><Button key="placement-begin" label="Start the test" onPress={() => beginPlacement($)} /></Box>
      </Box>
    )
  }
  if (p.result !== null) return placementResult($, Box, Button, Text, { ...p, result: p.result }, top, await $.store.get(cardsKey(deck.language)), bodyRows)
  const q = p.q
  if (q === null) return <Box key="placement">{top('')}</Box>
  const cards: LingoCards = { choices: q.choices, correct: null, picked: null, verdict: '' }
  return (
    <Box key="placement" flexDirection="column" width="100%" height={bodyRows} paddingX={1}>
      {top(`${questionNumber(p)}/${QUESTIONS}`)}
      <Box key="placement-middle" flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} justifyContent="center">
        <Box key="placement-word" justifyContent="center" marginBottom={1}>
          <Text bold>{q.prompt}</Text>
          {posTag(Box, Text, q.pos)}
        </Box>
        {Client !== null ? (
          <Client key="place-cards" module="./cards.tsx" props={cards} width="100%" height={GRID_ROWS} />
        ) : (
          <Box flexDirection="column" alignItems="center" rowGap={1}>
            {[0, 2].map(row => (
              <Box key={`prow${row}`} columnGap={2}>
                {[row, row + 1].map(i => (
                  <Button key={`p${i + 1}`} label={q.choices[i] ?? ''} hotkey={String(i + 1)} onPress={() => placementAnswer($, i)} />
                ))}
              </Box>
            ))}
          </Box>
        )}
        <Box key="placement-skip-row" justifyContent="center" marginTop={1}>
          <Button key="place-skip" label="I don't know" plain onPress={() => placementAnswer($, 'skip')} />
        </Box>
      </Box>
    </Box>
  )
}

// The result, before anything is saved: where you start, what goes into review.
function placementResult(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  p: LingoPlacement & { result: number },
  top: (right: string) => JSX.Element,
  stored: unknown, // the words as saved now: those already answered are never placed
  bodyRows: number,
) {
  const range = chunkProgress(deck, stored, p.result)
  const placed = placedCount(deck, stored, p.result, p.missed)
  const perDay = Math.ceil(placed / SPREAD_DAYS)
  return (
    <Box key="placement" flexDirection="column" width="100%" height={bodyRows} paddingX={1}>
      {top('done')}
      {/* Centred in the pane, the top bar kept at the top: as the card's middle is. */}
      <Box key="placement-result" flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} justifyContent="center" alignItems="center">
        <Box key="placement-where"><Text bold>{`You start at chunk ${p.result}: words ${range.first}–${range.last}.`}</Text></Box>
        <Box key="placement-review" marginTop={1}>
          <Text dimColor>
            {p.result === 1
              ? 'From the beginning: the most common words first.'
              : placed === 0
              ? 'The words before it that you have met keep their own schedule.'
              : `The ${placed} words before it go into review, about ${perDay} a day for ${SPREAD_DAYS / 7} weeks. Any you miss come back to be learned.`}
          </Text>
        </Box>
        <Box key="placement-actions" marginTop={1} gap={2}>
          <Button key="placement-start-here" label="Start here" variant="primary" onPress={() => startHere($)} />
          <Button key="placement-retake" label="Take it again" plain onPress={() => beginPlacement($)} />
        </Box>
      </Box>
    </Box>
  )
}

// ---- Flashcards: study only -----------------------------------------------------------

// The cards of one pass, shuffled: the whole deck (random) or one chunk's words. Each pass
// shows every word once before any comes again.
function flashOrder(mode: LingoFlash['mode'], chunk: number): string[] {
  const random = seeded(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
  const words = mode === 'random' ? deck.words : deck.words.filter(w => w.chunk === chunk)
  return shuffled(words, random).map(w => w.id)
}

// Opens the page: as it was left this session, else random from the whole deck.
async function openFlashcards($: EngineInterface) {
  if ((await read($, flash)) === null) {
    const chunk = await currentChunk($)
    await update($, flash, (): LingoFlash => ({ mode: 'random', chunk, order: flashOrder('random', chunk), at: 0, isFlipped: false }))
  }
  await update($, paneScreen, (): LingoPaneScreen => 'flashcards')
}

// Random, or by chunk (`chunk` for the chunk shown): a fresh pass, on its first card.
async function flashFrom($: EngineInterface, mode: LingoFlash['mode'], chunk?: number) {
  const was = await read($, flash)
  const at = Math.min(chunkCount(deck), Math.max(1, chunk ?? was?.chunk ?? (await currentChunk($))))
  await update($, flash, (): LingoFlash => ({ mode, chunk: at, order: flashOrder(mode, at), at: 0, isFlipped: false }))
}

// The dropdown's options: Random, then each chunk with the words it holds, then a way to
// Word Chunks, where a chunk's words are listed (Riley, 2026-10-26: a dropdown option cannot
// be greyed out, so the last one takes you there rather than only saying where it is).
const SEE_CHUNKS = 'see-chunks'
function flashSources(): { value: string; label: string }[] {
  const chunks = Array.from({ length: chunkCount(deck) }, (_, i) => {
    const p = chunkProgress(deck, undefined, i + 1)
    return { value: `chunk-${i + 1}`, label: `Chunk ${i + 1}: words ${p.first}–${p.last}` }
  })
  return [{ value: 'random', label: `Random (all ${deck.words.length.toLocaleString('en-US')} words)` }, ...chunks, { value: SEE_CHUNKS, label: "See all of a chunk's words…" }]
}

// The next card; after the pass's last, a new pass in a new order.
async function nextFlashcard($: EngineInterface) {
  const f = await read($, flash)
  if (f === null) return
  const isEnd = f.at + 1 >= f.order.length
  await update($, flash, (): LingoFlash => ({ ...f, order: isEnd ? flashOrder(f.mode, f.chunk) : f.order, at: isEnd ? 0 : f.at + 1, isFlipped: false }))
}

async function flipCard($: EngineInterface) {
  await update($, flash, f => (f === null ? null : { ...f, isFlipped: !f.isFlipped }))
}

function flashcardsPage(
  $: EngineInterface,
  Box: ElementConstructor<BoxProps>,
  Button: ElementConstructor<ButtonProps>,
  Text: ElementConstructor<TextProps>,
  Select: ElementConstructor<SelectProps> | null,
  Client: ElementConstructor<ClientProps> | null,
  f: LingoFlash | null,
  bodyRows: number,
) {
  const word = f === null ? undefined : deck.words.find(w => w.id === f.order[f.at])
  const top = (
    <Box key="flash-top" justifyContent="space-between">
      <Button key="to-card" label="← card" plain onPress={() => update($, paneScreen, (): LingoPaneScreen => 'card')} />
      <Text bold>Flashcards</Text>
      <Text dimColor>{f === null ? '' : `${f.at + 1}/${f.order.length}`}</Text>
    </Box>
  )
  if (f === null || word === undefined) return <Box key="flashcards" flexDirection="column" width="100%" paddingX={1}>{top}</Box>
  const card: LingoFlashcard = { front: promptText(word, deck.language), back: choiceText(word), isFlipped: f.isFlipped, rows: FLASH_ROWS }
  const last = chunkCount(deck)
  return (
    <Box key="flashcards" flexDirection="column" width="100%" height={bodyRows} paddingX={1}>
      {top}
      {/* Where the cards come from: a dropdown of Random and each chunk. Without one (the
          mobile app), Random and By chunk buttons, the chosen one primary, and ‹ › by chunk. */}
      {Select !== null ? (
        <Box key="flash-source-row" justifyContent="center" marginTop={1}>
          <Select
            key="flash-source"
            label="Cards from"
            options={flashSources()}
            value={f.mode === 'random' ? 'random' : `chunk-${f.chunk}`}
            onSelect={value => void (value === SEE_CHUNKS ? update($, paneScreen, (): LingoPaneScreen => 'chunks') : value === 'random' ? flashFrom($, 'random') : flashFrom($, 'chunk', Number(value.slice('chunk-'.length))))}
          />
        </Box>
      ) : (
        <Box key="flash-modes" justifyContent="center" gap={2} marginTop={1}>
          <Button key="flash-random" label="Random" variant={f.mode === 'random' ? 'primary' : undefined} onPress={() => flashFrom($, 'random')} />
          <Button key="flash-chunk" label="By chunk" variant={f.mode === 'chunk' ? 'primary' : undefined} onPress={() => flashFrom($, 'chunk')} />
        </Box>
      )}
      {Select === null && f.mode === 'chunk' && (
        <Box key="flash-chunk-row" justifyContent="center" gap={2}>
          <Button key="flash-chunk-prev" label="‹" plain onPress={() => flashFrom($, 'chunk', f.chunk - 1)} />
          <Box key="flash-chunk-label"><Text>{`Chunk ${f.chunk} of ${last}`}</Text></Box>
          <Button key="flash-chunk-next" label="›" plain onPress={() => flashFrom($, 'chunk', f.chunk + 1)} />
        </Box>
      )}
      {Select === null && (
        // The dropdown's last option, as a button where there is no dropdown.
        <Box key="flash-see-chunks-row" justifyContent="center">
          <Button key="flash-see-chunks" label="See all of a chunk's words" plain onPress={() => update($, paneScreen, (): LingoPaneScreen => 'chunks')} />
        </Box>
      )}
      <Box key="flash-middle" flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} justifyContent="center" marginTop={1}>
        {Client !== null ? (
          // In a box that does not shrink: a Client takes no flexShrink, and the centred middle
          // squeezed it to one row in the desktop app (Riley's screenshot, 2026-10-26).
          <Box key="flash-card-box" height={FLASH_ROWS} flexShrink={0}>
            <Client key="flash-card" module="./flashcard.tsx" props={card} width="100%" height={FLASH_ROWS} />
          </Box>
        ) : (
          // VS Code draws no Client: the card is a button.
          <Box key="flash-plain" justifyContent="center">
            <Button key="flash-flip" label={f.isFlipped ? `${card.front} = ${card.back}` : card.front} onPress={() => flipCard($)} />
          </Box>
        )}
        {/* Two rows of space under the card (Riley, 2026-10-27); no line of help under it. */}
        <Box key="flash-next-row" justifyContent="center" marginTop={2}>
          <Button key="flash-next" label="next card" variant="primary" onPress={() => nextFlashcard($)} />
        </Box>
      </Box>
    </Box>
  )
}
// As tall as the quiz's 2 × 2 grid of answer cards (src/layout.ts CARD_ROWS): room around the word.
const FLASH_ROWS = CARD_ROWS

// ---- The Language page (⚙️ Menu → Language) -------------------------------------------

// Every language with a deck, the one being learned marked. A pick switches to it and goes
// back to the card, or, for one not begun, to its "Do you know some already?" step.
function languagePage($: EngineInterface, Box: ElementConstructor<BoxProps>, Button: ElementConstructor<ButtonProps>, Text: ElementConstructor<TextProps>) {
  return (
    <Box key="language" flexDirection="column" width="100%" paddingX={1}>
      <Box key="language-top" justifyContent="space-between">
        <Button key="to-card" label="← card" plain onPress={() => update($, paneScreen, (): LingoPaneScreen => 'card')} />
        <Text bold>Language</Text>
        <Text> </Text>
      </Box>
      <Box key="language-about" marginTop={1}>
        <Text dimColor>Your XP, level, streak and badges are shared. Each language keeps its own words and chunks.</Text>
      </Box>
      <Box key="language-list" flexDirection="column" marginTop={1} rowGap={1}>
        {offered().map(l => (
          <Box key={`language-${l.code}`} gap={2} alignItems="center">
            <Button
              key={`pick-lang-${l.code}`}
              label={languageLabel(l.code)}
              variant={l.code === deck.language ? 'primary' : undefined}
              onPress={async () => {
                await switchLanguage($, l.code)
                await update($, paneScreen, (): LingoPaneScreen => 'card')
              }}
            />
            {l.code === deck.language && <Box key={`language-${l.code}-current`}><Text color="claude">◀ learning</Text></Box>}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
