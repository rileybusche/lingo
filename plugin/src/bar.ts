// A chunk's progress bar as SVG, for the surfaces that draw Svg (the desktop
// app). The usual stacked progress bar: a rounded track the full width, then
// "seen" from the left to the end of the seen words, then "learned" on top from
// the left to the end of the learned words, each rounded at both ends. The
// track runs underneath both, so a rounded end always sits on something.

export type BarColours = { from: string; to: string; seen: string; track: string }
export type BarSize = { width: number; height: number; radius: number; pad?: number } // pad: empty pixels above and below

// The widths in pixels: learned, and learned + seen (where the seen part ends).
// A part that is not zero is at least as wide as the bar is tall, so one word
// still shows as a small rounded block; neither runs past the track.
export function barWidths(learned: number, seen: number, total: number, size: BarSize) {
  if (total <= 0) return { learned: 0, seenEnd: 0 }
  const span = (n: number) => (n <= 0 ? 0 : Math.min(size.width, Math.max(size.height, Math.round((n / total) * size.width))))
  const l = span(learned)
  const seenEnd = seen > 0 ? Math.min(size.width, Math.max(l + size.height, span(learned + seen))) : l
  return { learned: l, seenEnd }
}

export function barSvg(learned: number, seen: number, total: number, size: BarSize, colours: BarColours): string {
  const { width: w, height: h, radius: r } = size
  const pad = size.pad ?? 0
  const { learned: l, seenEnd } = barWidths(learned, seen, total, size)
  const rect = (width: number, fill: string) => `<rect x="0" y="${pad}" width="${width}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"/>`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + 2 * pad}" viewBox="0 0 ${w} ${h + 2 * pad}">`,
    // userSpaceOnUse: the gradient spans the whole track, so a cell's colour is set by where it sits.
    `<defs><linearGradient id="learned" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="0">`,
    `<stop offset="0" stop-color="${colours.from}"/><stop offset="1" stop-color="${colours.to}"/></linearGradient></defs>`,
    rect(w, colours.track),
    seenEnd > l ? rect(seenEnd, colours.seen) : '',
    l > 0 ? rect(l, 'url(#learned)') : '',
    '</svg>',
  ].join('')
}

// A key's chip for one part of the bar, drawn the way the bar is: a rounded `width` × `height`
// block in the part's colour (learned as the bar's gradient).
export function chipSvg(part: 'learned' | 'seen' | 'rest', size: { width: number; height: number; radius: number }, colours: BarColours): string {
  const { width: w, height: h, radius: r } = size
  const fill = part === 'learned' ? 'url(#chip)' : part === 'seen' ? colours.seen : colours.track
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    part === 'learned'
      ? `<defs><linearGradient id="chip" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${colours.from}"/><stop offset="1" stop-color="${colours.to}"/></linearGradient></defs>`
      : '',
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"/>`,
    '</svg>',
  ].join('')
}
