// Moving progress between installs and machines (/lingo-export, /lingo-import):
// a JSON file of the store's own keys, and a merge that never loses answers.

import { mergeDays, readDays } from './gamify'
import { readCards, readStats } from './progress'
import type { CardsByWord } from './progress'

export const FORMAT = 'lingo-progress'
// The label exports carried while the mod was called lingo-mod; still read.
const OLD_FORMATS = ['lingo-mod-progress']
export const FORMAT_VERSION = 1

// The keys of ours a file carries: the profile, the streak, every language's cards.
export const isOurKey = (key: string) => key === 'profile' || key === 'stats' || key === 'days' || key.startsWith('cards:')

export function exportText(store: Record<string, unknown>, exportedAt: number): string {
  const kept = Object.fromEntries(Object.entries(store).filter(([k]) => isOurKey(k)))
  const file = { format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date(exportedAt).toISOString(), store: kept }
  return JSON.stringify(file, null, 2) + '\n'
}

export type ImportResult =
  | { ok: true; writes: Record<string, unknown>; added: number; updated: number }
  | { ok: false; reason: string }

const latest = (cards: CardsByWord) => Math.max(0, ...Object.values(cards).map(c => c.lastSeen))

// The writes that merge a file into the store: per word, the record with more
// answers (the later on a tie), so a second import of one file changes
// nothing; the streak of whichever side answered last; the profile's view
// only where the store has none.
export function importWrites(store: Record<string, unknown>, text: string): ImportResult {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'the file is not JSON' }
  }
  const f = file as { format?: unknown; version?: unknown; store?: unknown }
  if (f === null || typeof f !== 'object' || (f.format !== FORMAT && !OLD_FORMATS.includes(String(f.format)))) {
    return { ok: false, reason: 'the file is not a lingo progress export' }
  }
  if (typeof f.version !== 'number' || f.version > FORMAT_VERSION) {
    return { ok: false, reason: `the file is from a newer lingo (format ${String(f.version)}); update the mod first` }
  }
  const theirs = f.store !== null && typeof f.store === 'object' ? (f.store as Record<string, unknown>) : {}
  const writes: Record<string, unknown> = {}
  let added = 0
  let updated = 0
  let ourLatest = 0
  let theirLatest = 0
  for (const key of Object.keys(theirs).filter(k => k.startsWith('cards:'))) {
    const mine = readCards(store[key])
    const incoming = readCards(theirs[key])
    ourLatest = Math.max(ourLatest, latest(mine))
    theirLatest = Math.max(theirLatest, latest(incoming))
    const merged = { ...mine }
    let changed = false
    for (const [id, card] of Object.entries(incoming)) {
      const have = merged[id]
      if (have === undefined) {
        added++
      } else if (card.seen > have.seen || (card.seen === have.seen && card.lastSeen > have.lastSeen)) {
        updated++
      } else {
        continue
      }
      merged[id] = card
      changed = true
    }
    if (changed) writes[key] = merged
  }
  // Stats: the run of right answers from whichever side answered last; the larger XP; the
  // daily streak whose last counted day is later (the longer on a tie). The day log merges
  // by taking each day's larger counts, so a re-import never double-counts.
  if ('stats' in theirs) {
    const mine = readStats(store.stats)
    const their = readStats(theirs.stats)
    const laterDaily = (their.daily.lastDay ?? '') > (mine.daily.lastDay ?? '') ||
      (their.daily.lastDay === mine.daily.lastDay && their.daily.days > mine.daily.days)
    // Badges: every one either side earned, at the earlier date.
    const badges = { ...their.badges, ...mine.badges }
    for (const [id, date] of Object.entries(their.badges)) if (mine.badges[id] !== undefined && date < mine.badges[id]!) badges[id] = date
    const merged = {
      streak: theirLatest > ourLatest ? their.streak : mine.streak,
      xp: Math.max(mine.xp, their.xp),
      daily: laterDaily ? their.daily : mine.daily,
      badges,
    }
    if (JSON.stringify(merged) !== JSON.stringify(mine)) writes.stats = merged
  }
  if ('days' in theirs) {
    const merged = mergeDays(store.days, theirs.days)
    if (JSON.stringify(merged) !== JSON.stringify(readDays(store.days))) writes.days = merged
  }
  const myProfile = (store.profile ?? {}) as Record<string, unknown>
  const theirView = (theirs.profile as Record<string, unknown> | undefined)?.view
  if (myProfile.view === undefined && (theirView === 'pane' || theirView === 'band')) {
    writes.profile = { ...myProfile, schemaVersion: myProfile.schemaVersion ?? 1, view: theirView }
  }

  return { ok: true, writes, added, updated }
}
