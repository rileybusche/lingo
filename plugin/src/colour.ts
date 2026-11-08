// Colours for the chunks list's bars: a gradient from one hex colour to another.

const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const hexOf = (rgb: number[]) => `#${rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`

// The colour `i` of `steps` along the way from `from` to `to` (#rrggbb): the
// first is `from`, the last `to`.
export function gradientAt(from: string, to: string, steps: number, i: number): string {
  const t = steps <= 1 ? 0 : Math.min(1, Math.max(0, i / (steps - 1)))
  const [a, b] = [channels(from), channels(to)]
  return hexOf(a.map((c, k) => c + ((b[k] ?? c) - c) * t))
}
