import type { Paint } from './grid'
import { between, clouds as fbm, rampChar, type Look, type Step, type Theme } from './scene'

/**
 * Nuvens: massas grandes atravessando o céu devagar, montadas com ruído suave em duas oitavas — a
 * larga dá a forma, a fina esgarça a borda. Só o deslocamento muda a cada quadro, então a nuvem
 * mantém a forma enquanto anda, em vez de ferver no lugar.
 */

const PUFF = '.:;=%#@'
const BIRD = 'vw~'
const CHARS = PUFF + BIRD
const DARK = ['#e8f2ff', '#b9d2ef', '#89a9cf', '#6d8bb6', '#56719c']
const LIGHT = ['#2a5f8c', '#3d78a8', '#5d96c0', '#7fb0d2', '#9cc4de']

type Layer = { x: number; speed: number; scale: number; y: number; band: number; tint: number; seed: number }
type Bird = { x: number; y: number; speed: number; flap: number }

export const nuvens: Theme = {
  id: 'nuvens',
  name: 'Nuvens',
  hint: 'Massas grandes atravessando o céu devagar, com pássaros de vez em quando.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    tile: 0.5,
    backdrop: dark
      ? 'linear-gradient(180deg, #16243a 0%, #1e3450 55%, #27455f 100%)'
      : 'linear-gradient(180deg, #a8d4f0 0%, #cce6f8 55%, #e8f4fd 100%)',
  }),

  create(cols, rows): Step {
    const layers: Layer[] = [0, 1, 2].map((i) => ({
      x: between(0, 400),
      speed: [1.1, 2.2, 3.6][i]!,
      scale: [0.055, 0.085, 0.13][i]!,
      y: rows * [0.18, 0.42, 0.68][i]!,
      band: rows * [0.26, 0.3, 0.26][i]!,
      tint: [3, 2, 0][i]!,
      seed: (Math.random() * 1e6) | 0,
    }))
    const birds: Bird[] = Array.from({ length: 3 }, () => ({
      x: between(-cols, cols),
      y: between(rows * 0.15, rows * 0.5),
      speed: between(2.5, 5),
      flap: between(0, Math.PI * 2),
    }))

    return (p: Paint, dt: number, t: number) => {
      for (const l of layers) {
        l.x += l.speed * dt
        for (let y = Math.max(0, Math.floor(l.y - l.band)); y < Math.min(rows, l.y + l.band); y++) {
          // Mais densa no miolo da faixa e rareando nas pontas: é o que dá a barriga da nuvem.
          const fade = 1 - Math.abs(y - l.y) / l.band
          for (let x = 0; x < cols; x++) {
            const v = (fbm((x + l.x) * l.scale, y * l.scale * 1.8, l.seed) - 0.48) * 3.4 * fade
            const ch = rampChar(PUFF, v)
            if (ch) p.put(x, y, ch, v > 0.72 ? l.tint : v > 0.4 ? l.tint + 1 : Math.min(4, l.tint + 2))
          }
        }
      }
      for (const b of birds) {
        b.x += b.speed * dt
        if (b.x > cols + 3) {
          b.x = -3
          b.y = between(rows * 0.15, rows * 0.5)
        }
        p.put(b.x, b.y + Math.sin(t * 0.7 + b.flap) * 1.5, BIRD[(Math.abs(Math.sin(t * 6 + b.flap)) * BIRD.length) | 0]!, 4)
      }
    }
  },
}
