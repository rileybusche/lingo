// Badges (PLAN.md §6.3, Phase 3b): milestones earned once each, kept with the date earned
// in the stored stats (`badges`: id → local date). The rules are pure: each reads a
// snapshot of where the person stands.

export type BadgeContext = {
  learned: number // words learned, all chunks
  run: number // right answers in a row, this one included
  dailyStreak: number // the daily streak as it stands
  chunk: number // the automatic chunk reached
  localHour: number // 0–23, when this answer was given
  comeback: boolean // a word that lapsed (missed in review) is learned again
}

export type Badge = { id: string; name: string; hint: string; earned: (c: BadgeContext) => boolean }

export const CORE_BADGES: Badge[] = [
  { id: 'first-word', name: 'First word', hint: 'Learn one word.', earned: c => c.learned >= 1 },
  { id: 'first-50', name: 'First 50', hint: 'Learn 50 words.', earned: c => c.learned >= 50 },
  { id: 'centurion', name: 'Centurion', hint: 'Learn 100 words.', earned: c => c.learned >= 100 },
  { id: 'perfect-ten', name: 'Perfect Ten', hint: 'Get 10 right in a row.', earned: c => c.run >= 10 },
  { id: 'on-fire', name: 'On fire', hint: 'Keep a 7-day streak.', earned: c => c.dailyStreak >= 7 },
  { id: 'committed', name: 'Committed', hint: 'Keep a 30-day streak.', earned: c => c.dailyStreak >= 30 },
  { id: 'night-owl', name: 'Night owl', hint: 'Answer a card between midnight and 4 am.', earned: c => c.localHour >= 0 && c.localHour < 4 },
  { id: 'comeback', name: 'Comeback', hint: 'Learn again a word you had forgotten.', earned: c => c.comeback },
]

// One per chunk opened, from chunk 2 to the last, in each language (`fr-chunk-2`); `chunk` in
// the context is that language's.
export const chunkBadge = (language: string, n: number): Badge => ({
  id: `${language}-chunk-${n}`,
  name: `Chunk ${n}`,
  hint: `Open chunk ${n}.`,
  earned: c => c.chunk >= n,
})
export const chunkBadges = (language: string, chunks: number) => Array.from({ length: Math.max(0, chunks - 1) }, (_, i) => chunkBadge(language, i + 2))

export type Earned = Record<string, string> // id → local date earned

export function readEarned(stored: unknown): Earned {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return {}
  const out: Earned = {}
  for (const [id, date] of Object.entries(stored as Record<string, unknown>)) {
    // `chunk-N`, from before there was more than one language (until 2026-10-29), was Spanish's.
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) out[/^chunk-\d+$/.test(id) ? `es-${id}` : id] = date
  }
  return out
}

// The badges newly earned now, in the order listed: each only once, ever.
export function newlyEarned(badges: Badge[], context: BadgeContext, already: Earned): Badge[] {
  return badges.filter(b => already[b.id] === undefined && b.earned(context))
}
