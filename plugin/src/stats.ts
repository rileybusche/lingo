// The Stats page's figures (PLAN.md §6.4), from the day log and the word records.

import { daysBetween, type DayLog } from './gamify'
import type { CardsByWord } from './progress'

// The last `n` local dates ending with `today`, oldest first, and each one's answered cards.
export function lastDays(log: DayLog, today: string, n = 30): { date: string; answered: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10)
    return { date, answered: log[date]?.answered ?? 0 }
  })
}

// Right answers over graded ones (a shown meaning is not graded) for the 7 days ending
// `today`, and the 7 before them, in one language or (none named) all; null where nothing
// was graded.
export function accuracy(log: DayLog, today: string, language?: string): { thisWeek: number | null; lastWeek: number | null } {
  const sum = (from: number, to: number) => {
    let correct = 0
    let graded = 0
    for (const [date, day] of Object.entries(log)) {
      const ago = daysBetween(date, today)
      if (ago >= from && ago <= to) {
        const g = language === undefined ? day : day.langs[language]
        correct += g?.correct ?? 0
        graded += g?.graded ?? 0
      }
    }
    return graded === 0 ? null : Math.round((100 * correct) / graded)
  }
  return { thisWeek: sum(0, 6), lastWeek: sum(7, 13) }
}

// The words missed most: wrong at least once, most wrong first, then least often right.
export function mostMissed(cards: CardsByWord, n = 10): { id: string; wrong: number; correct: number }[] {
  return Object.entries(cards)
    .filter(([, c]) => c.wrong > 0)
    .map(([id, c]) => ({ id, wrong: c.wrong, correct: c.correct }))
    .sort((a, b) => b.wrong - a.wrong || a.correct - b.correct || a.id.localeCompare(b.id))
    .slice(0, n)
}

// The 30-day chart as SVG for the desktop app: a bar per day, a dashed line at the daily
// goal, scaled to the larger of the goal and the busiest day.
export function daysSvg(days: { answered: number }[], goal: number, size: { width: number; height: number }, colours: { bar: string; met: string; goal: string }): string {
  const top = Math.max(goal, ...days.map(d => d.answered), 1)
  const slot = size.width / days.length
  const bar = Math.max(1, slot - 2)
  const y = (n: number) => size.height - (n / top) * size.height
  const bars = days.map((d, i) => {
    const h = Math.max(d.answered > 0 ? 2 : 0, (d.answered / top) * size.height)
    return `<rect x="${(i * slot).toFixed(1)}" y="${(size.height - h).toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${d.answered >= goal ? colours.met : colours.bar}"/>`
  })
  const line = `<line x1="0" y1="${y(goal).toFixed(1)}" x2="${size.width}" y2="${y(goal).toFixed(1)}" stroke="${colours.goal}" stroke-dasharray="3 3" stroke-width="1"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">${bars.join('')}${line}</svg>`
}

// The same for the terminal: one block character per day, ▁ to █, a blank for none.
const BLOCKS = '▁▂▃▄▅▆▇█'
export function daysSparkline(days: { answered: number }[], goal: number): string {
  const top = Math.max(goal, ...days.map(d => d.answered), 1)
  return days.map(d => (d.answered === 0 ? ' ' : BLOCKS[Math.min(7, Math.max(0, Math.ceil((d.answered / top) * 8) - 1))])).join('')
}

// ---- The heatmap (§6.4, Phase 3b) ---------------------------------------------------

// A day's shade: 0 none, 1 under the goal, 2 the goal met, 3 twice the goal or more.
export const heatLevel = (answered: number, goal: number) => (answered <= 0 ? 0 : answered >= 2 * goal ? 3 : answered >= goal ? 2 : 1)

// The last `weeks` weeks as columns, oldest first, each Sunday to Saturday; the last column
// is the week of `today`, its days after today null (not yet).
export function heatmap(log: DayLog, today: string, goal: number, weeks = 13): ({ date: string; level: number } | null)[][] {
  const t = Date.parse(`${today}T00:00:00Z`)
  const weekday = new Date(t).getUTCDay() // 0 Sunday
  const firstSunday = t - (weekday + 7 * (weeks - 1)) * 86_400_000
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const at = firstSunday + (w * 7 + d) * 86_400_000
      if (at > t) return null
      const date = new Date(at).toISOString().slice(0, 10)
      return { date, level: heatLevel(log[date]?.answered ?? 0, goal) }
    }),
  )
}

// The heatmap as SVG for the desktop app: a rounded square a day.
export function heatmapSvg(grid: ReturnType<typeof heatmap>, cell: number, gap: number, colours: readonly string[]): string {
  const step = cell + gap
  const squares = grid.flatMap((week, w) =>
    week.flatMap((day, d) => (day === null ? [] : [`<rect x="${w * step}" y="${d * step}" width="${cell}" height="${cell}" rx="2" fill="${colours[day.level]}"/>`])),
  )
  const width = grid.length * step - gap
  const height = 7 * step - gap
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${squares.join('')}</svg>`
}

// The same for the terminal: seven lines, Sunday to Saturday, a character a day.
const SHADES = ['·', '░', '▓', '█']
export function heatmapLines(grid: ReturnType<typeof heatmap>): string[] {
  return Array.from({ length: 7 }, (_, d) => grid.map(week => (week[d] === null ? ' ' : SHADES[week[d]!.level])).join(''))
}
