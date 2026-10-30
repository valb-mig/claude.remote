import type { Paint } from './grid'
import { between, frameAt, motion, noise, rampChar, smoothNoise, stamp, type Look, type Motion, type Step, type Theme } from './scene'

/**
 * Barquinhos de Papel: os barcos atravessando a água com a vela balançando, o reflexo tremendo
 * embaixo de cada um e as linhas da água correndo. Dois quadros por barco bastam: o papel não
 * deforma, ele só joga de um lado para o outro.
 */

const BOAT: Motion = motion(
  [
    ['   #   ', '  ##.  ', ' ###.. ', '.#####.', ' ooooo '],
    ['   #   ', '  .##  ', ' ..### ', '.#####.', ' ooooo '],
  ],
  2,
)

const PAPER = 'tS%#X8'
const WATER = '.-~='
const WAKE = '·.-'
const CHARS = PAPER + WATER + WAKE + 'o'
const DARK = ['#f2f7fa', '#c3d6dc', '#7a9aa4', '#53808c', '#6b9aa6', '#8fc4cc']
const LIGHT = ['#17424a', '#2a5f68', '#4e848e', '#6b9aa2', '#3a6b75', '#1d4d57']

type Boat = { x: number; y: number; speed: number; bob: number; seed: number }

export const barquinhos: Theme = {
  id: 'barquinhos',
  name: 'Barquinhos de Papel',
  hint: 'Barcos de papel atravessando a água, com o reflexo tremendo embaixo.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    tile: 0.42,
    backdrop: dark
      ? 'linear-gradient(180deg, #2b4a52 0%, #1d3840 50%, #11252b 100%)'
      : 'linear-gradient(180deg, #ddf0f2 0%, #b8dde2 50%, #93c6cf 100%)',
  }),

  create(cols, rows): Step {
    const seed = (Math.random() * 1e6) | 0
    const make = (anywhere: boolean): Boat => {
      const speed = between(1.6, 3.8) * (Math.random() < 0.5 ? -1 : 1)
      return {
        x: anywhere ? between(0, cols) : speed > 0 ? -8 : cols + 2,
        y: between(rows * 0.2, rows * 0.78),
        speed,
        bob: between(0, Math.PI * 2),
        seed: (Math.random() * 1e6) | 0,
      }
    }
    const boats: Boat[] = Array.from({ length: Math.max(2, Math.min(6, Math.round((cols * rows) / 700))) }, () => make(true))

    return (p: Paint, dt: number, t: number) => {
      // Linhas da água: cada fileira tem o seu próprio ruído (o `y` grande descorrelaciona as vizinhas,
      // senão as cristas se alinham e viram faixas diagonais atravessando a tela) e corre no seu ritmo.
      for (let y = 0; y < rows; y++) {
        const drift = t * (3 + (y % 4)) * (y % 2 ? 1 : -1)
        for (let x = 0; x < cols; x++) {
          const v = smoothNoise((x + drift) * 0.22, y * 7.3, seed) - 0.68
          const ch = rampChar(WATER, v * 4.5)
          if (ch) p.put(x, y, ch, v > 0.2 ? 2 : 3)
        }
      }

      for (const b of boats) {
        b.x += b.speed * dt
        if (b.speed > 0 ? b.x > cols + 8 : b.x < -10) Object.assign(b, make(false))
        const bob = Math.sin(t * 1.3 + b.bob) * 0.6
        const f = frameAt(BOAT, t * 1.1, b.seed)
        const y = b.y + bob
        stamp(p, f, b.x, y, b.seed, { '#': 0, '.': 1, o: 2 }, PAPER, b.speed < 0)
        // Reflexo: o casco repetido embaixo, trêmulo e bem mais apagado.
        for (let i = 1; i <= 3; i++) {
          const ry = y + f.h - 1 + i
          const shift = Math.sin(t * 2.4 + i * 1.3 + b.bob) * i * 0.7
          for (let x = 0; x < f.w; x++) {
            if (noise(b.seed, x, i + ((t * 4) | 0)) > 0.72 - i * 0.12) continue
            p.put(b.x + x + shift, ry, WAKE[Math.min(WAKE.length - 1, i - 1)]!, 4)
          }
        }
      }
    }
  },
}
