// A person's own limits (PLAN.md §4.4, the Settings page): saved in the profile under
// `settings`, each held to its range and step; a value missing or out of range reads as
// its default.

import { LANGUAGES, languageOf, type Voice } from './languages'

export type Settings = {
  newPerDay: number // new words met a day
  dailyGoal: number // cards a day that keep the daily streak
  toOpenNext: number // a chunk's words learned that open the next
  targetRecall: number // percent: how sure to be of a word when it comes back
  sounds: boolean // the level-up chime (Phase 3b)
  sayOnShow: boolean // say the word aloud when a new card comes up (Hear the word, §8)
  voices: Record<string, string> // the voice chosen for each language, by code; absent, its first (src/languages.ts)
  wholeDeck: boolean // every word in play, no chunks to open (PLAN.md §3, Full deck)
}
export type SettingKey = Exclude<keyof Settings, 'sounds' | 'sayOnShow' | 'voices' | 'wholeDeck'> // the numbers, each with a range
export type Switch = 'sounds' | 'sayOnShow' | 'wholeDeck'

export const DEFAULTS: Settings = { newPerDay: 10, dailyGoal: 10, toOpenNext: 40, targetRecall: 92, sounds: true, sayOnShow: false, voices: {}, wholeDeck: false }

export const LIMITS: Record<SettingKey, { min: number; max: number; step: number }> = {
  newPerDay: { min: 1, max: 50, step: 1 },
  dailyGoal: { min: 5, max: 100, step: 5 },
  toOpenNext: { min: 25, max: 50, step: 5 },
  targetRecall: { min: 85, max: 97, step: 1 },
}

const KEYS = Object.keys(LIMITS) as SettingKey[]

// One value held to its range, on its step from the minimum.
export function held(key: SettingKey, value: number): number {
  const { min, max, step } = LIMITS[key]
  if (!Number.isFinite(value)) return DEFAULTS[key]
  const stepped = min + Math.round((value - min) / step) * step
  return Math.min(max, Math.max(min, stepped))
}

export function readSettings(profile: unknown): Settings {
  const raw = (profile as { settings?: Record<string, unknown> } | undefined)?.settings ?? {}
  const out = { ...DEFAULTS }
  for (const key of KEYS) {
    const v = raw[key]
    if (typeof v === 'number' && Number.isFinite(v) && v >= LIMITS[key].min && v <= LIMITS[key].max) out[key] = held(key, v)
  }
  if (typeof raw.sounds === 'boolean') out.sounds = raw.sounds
  if (typeof raw.sayOnShow === 'boolean') out.sayOnShow = raw.sayOnShow
  if (typeof raw.wholeDeck === 'boolean') out.wholeDeck = raw.wholeDeck
  // A voice for each language, kept only when it is one of that language's. `voice`, before
  // there was more than one language (until 2026-10-29), was Spanish's.
  const chosen = { ...(raw.voice !== undefined ? { es: raw.voice } : {}), ...(typeof raw.voices === 'object' && raw.voices !== null ? (raw.voices as Record<string, unknown>) : {}) }
  out.voices = Object.fromEntries(Object.entries(chosen).filter(([code, name]) => LANGUAGES[code]?.voices.some(v => v.name === name))) as Record<string, string>
  return out
}

// The voice that says a language's words: the one chosen, else its first.
export const voiceFor = (settings: Settings, code: string): Voice => {
  const voices = languageOf(code).voices
  return voices.find(v => v.name === settings.voices[code]) ?? (voices[0] as Voice)
}

// The profile with one switch turned the other way, the rest kept.
export function withToggled(profile: unknown, key: Switch): Record<string, unknown> {
  const p = (profile ?? {}) as Record<string, unknown>
  const now = readSettings(p)
  return { ...p, schemaVersion: (p.schemaVersion as number | undefined) ?? 1, settings: { ...now, [key]: !now[key] } }
}

// The profile with one of a language's voices chosen (a name not its own changes nothing), the
// rest kept; the old single `voice` folded into `voices`.
export function withVoice(profile: unknown, code: string, name: string): Record<string, unknown> {
  const p = (profile ?? {}) as Record<string, unknown>
  const now = readSettings(p)
  const isTheirs = LANGUAGES[code]?.voices.some(v => v.name === name) === true
  const voices = isTheirs ? { ...now.voices, [code]: name } : now.voices
  return { ...p, schemaVersion: (p.schemaVersion as number | undefined) ?? 1, settings: { ...now, voices } }
}

// The profile with a language's next voice (after the last, the first): the button that
// stands in for the dropdown where a surface has none.
export function withNextVoice(profile: unknown, code: string): Record<string, unknown> {
  const voices = languageOf(code).voices
  const at = voices.findIndex(v => v.name === voiceFor(readSettings(profile), code).name)
  return withVoice(profile, code, (voices[(at + 1) % voices.length] as Voice).name)
}

// The profile with one setting moved a step up or down (held to its range), the rest kept.
export function withNudge(profile: unknown, key: SettingKey, direction: 1 | -1): Record<string, unknown> {
  const p = (profile ?? {}) as Record<string, unknown>
  const now = readSettings(p)
  const next = { ...now, [key]: held(key, now[key] + direction * LIMITS[key].step) }
  return { ...p, schemaVersion: (p.schemaVersion as number | undefined) ?? 1, settings: next }
}

// The profile with every setting back at its default.
export function withDefaults(profile: unknown): Record<string, unknown> {
  const p = (profile ?? {}) as Record<string, unknown>
  return { ...p, schemaVersion: (p.schemaVersion as number | undefined) ?? 1, settings: { ...DEFAULTS } }
}
