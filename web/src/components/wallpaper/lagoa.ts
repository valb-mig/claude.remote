import type { Paint } from './grid'
import { between, frameAt, motion, stamp, type Look, type Motion, type Step, type Theme } from './scene'

/**
 * Lagoa das Tartarugas: as honu planando pela água clara, uma raia mais ao fundo e as cáusticas
 * tremendo por cima de tudo. As cáusticas são três senos se cruzando e só acendem onde a soma passa
 * de um limite — é o truque que dá a rede de luz do fundo do mar sem desenhar uma rede.
 */

// Três quadros de remada: nadadeiras em cima, no meio e embaixo.
const TURTLE: Motion = motion(
  [
    ['.##   ##.', ' .#####. ', '  #####  ', ' .#####. ', '.#   #  o'],
    ['  ##.##  ', ' .#####. ', '.#######.', ' .#####. ', '  #.#.# o'],
    ['.#     #.', '.##.#.##.', ' ####### ', '.##.#.##.', '.#     #o'],
  ],
  3,
)

const MANTA: Motion = motion(
  [
    ['  .###.  ', '.#######.', '#########', ' .#####. ', '   .#.   ', '    .    '],
    [' .#####. ', '#########', ' ####### ', '  .###.  ', '   ...   ', '    .    '],
  ],
  2,
)

const SHELL = 'tS%#X8'
const CAUSTIC = '·-~'
const BUBBLE = 'o°'
const CHARS = SHELL + CAUSTIC + BUBBLE
const DARK = ['#6ecfa8', '#a8ecd0', '#3d8f72', '#e8fffa', '#9fc8dc', '#5d8ca6', '#7fc4c0']
const LIGHT = ['#0b5240', '#0e6b52', '#063828', '#06323f', '#2a5f78', '#153f52', '#1a6f80']

type Swimmer = { cx: number; cy: number; rx: number; ry: number; speed: number; phase: number; seed: number }

export const lagoa: Theme = {
  id: 'lagoa',
  name: 'Lagoa das Tartarugas',
  hint: 'Honu planando na água clara, uma raia ao fundo e a rede de luz tremendo.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    tile: 0.5,
    backdrop: dark
      ? 'linear-gradient(160deg, #186f74 0%, #0e5570 45%, #073d56 78%, #04293b 100%)'
      : 'linear-gradient(160deg, #d9f7f0 0%, #a8e8e4 42%, #7fd0e0 78%, #5fb8d4 100%)',
  }),

  create(cols, rows): Step {
    const make = (): Swimmer => ({
      cx: between(0.3, 0.7),
      cy: between(0.3, 0.7),
      rx: between(0.28, 0.45),
      ry: between(0.18, 0.34),
      speed: between(0.05, 0.11) * (Math.random() < 0.5 ? -1 : 1),
      phase: between(0, Math.PI * 2),
      seed: (Math.random() * 1e6) | 0,
    })
    const turtles = Array.from({ length: Math.max(2, Math.min(5, Math.round((cols * rows) / 900))) }, make)
    const manta = make()

    /** Posição na elipse e para que lado o bicho está indo. */
    const at = (s: Swimmer, t: number) => {
      const a = s.speed * t * 2 * Math.PI + s.phase
      return { x: cols * (s.cx + s.rx * Math.cos(a)), y: rows * (s.cy + s.ry * Math.sin(a)), left: Math.sin(a) * s.speed > 0 }
    }

    return (p: Paint, _dt: number, t: number) => {
      // Cáusticas: três ondas cruzadas, acendendo só nas cristas.
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v =
            Math.sin(x * 0.19 + y * 0.07 + t * 0.52 + 1.6 * Math.sin(y * 0.12 - t * 0.8)) +
            Math.sin(-x * 0.1 + y * 0.21 - t * 0.78 + 1.6 * Math.sin(x * 0.14 + t * 0.52)) +
            Math.sin(x * 0.15 - y * 0.15 + t * 1.05)
          if (v > 1.7) {
            const k = Math.min(1, (v - 1.7) / 1.1)
            p.put(x, y, CAUSTIC[Math.min(CAUSTIC.length - 1, (k * CAUSTIC.length) | 0)]!, k > 0.55 ? 3 : 6)
          }
        }
      }

      const m = at(manta, t)
      const mf = frameAt(MANTA, t, manta.seed)
      stamp(p, mf, m.x - mf.w / 2, m.y - mf.h / 2, manta.seed, { '#': 4, '.': 5 }, SHELL, m.left)

      for (const s of turtles) {
        const pos = at(s, t)
        const f = frameAt(TURTLE, t * 1.6, s.seed)
        stamp(p, f, pos.x - f.w / 2, pos.y - f.h / 2, s.seed, { '#': 0, '.': 2, o: 3 }, SHELL, pos.left)
        // Rastro de bolhas atrás de quem está subindo.
        if (Math.sin(s.speed * t * 2 * Math.PI + s.phase) < -0.6) {
          for (let i = 1; i < 4; i++) p.put(pos.x + (pos.left ? i * 2 : -i * 2), pos.y - i * 1.4, BUBBLE[i % 2]!, 6)
        }
      }
    }
  },
}
