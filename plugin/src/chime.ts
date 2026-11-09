// The level-up sound (PLAN.md §6.1), made in code when it plays rather than shipped as a .wav,
// so the plugin carries no binary file a reviewer cannot read (the directory's verifier, Riley,
// 2026-11-09). It is the sound scripts/make-chime.mjs wrote to sounds/levelup.wav until then,
// byte for byte: a gentle ding, one bell-like note (A5) with two quieter overtones that fade
// first, a soft 8 ms attack so it does not click, and a long fading ring. 22.05 kHz, 16-bit mono.

const RATE = 22050
const HZ = 880 // A5
const SECONDS = 1.2
// A bell's partials: [ratio to the note, loudness, how fast it fades]. The higher ones fade
// sooner, leaving the pure note to ring.
const PARTIALS = [
  [1, 1, 3.5],
  [2.76, 0.18, 9],
  [5.4, 0.06, 16],
] as const
const VOLUME = 0.3

// The whole .wav file: a 44-byte header, then the samples.
export function chimeWav(): Uint8Array {
  const n = Math.round(SECONDS * RATE)
  const bytes = new Uint8Array(44 + n * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + n * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 2, true) // bytes a second
  view.setUint16(32, 2, true) // bytes a frame
  view.setUint16(34, 16, true) // bits a sample
  ascii(36, 'data')
  view.setUint32(40, n * 2, true)
  for (let s = 0; s < n; s++) {
    const t = s / RATE
    const attack = Math.min(1, t / 0.008)
    const tone = PARTIALS.reduce((sum, [ratio, gain, fade]) => sum + Math.sin(2 * Math.PI * HZ * ratio * t) * gain * Math.exp(-t * fade), 0)
    const end = Math.min(1, (SECONDS - t) / 0.05) // no click at the cut
    const v = tone * attack * end * VOLUME
    view.setInt16(44 + s * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true)
  }
  return bytes
}

// The file as base64, the form $.audio.play takes bytes in.
export function chimeBase64(): string {
  const bytes = chimeWav()
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
