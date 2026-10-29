import type { Paint } from './grid'
import { between, fitCount, noise, sprite, stamp, type Look, type Sprite, type Step, type Theme, type Tint } from './scene'

/**
 * Aquário: um cardume atravessando a tela, algas balançando no rodapé e bolhas subindo. Os peixes
 * grandes comem os pequenos que cruzam a frente deles, e o pequeno volta pela outra ponta.
 *
 * Os raios de luz são degradês de CSS atrás do canvas: saem de graça e não custam um quadro sequer.
 */

// Peixes virados para a direita (a cauda à esquerda); quem nada para a esquerda é espelhado.
const FISH: Sprite[] = [
  sprite([
    '.   ##.', //
    '.#####o',
    '.   ##.',
  ]),
  sprite([
    '      ###  ', //
    '..  #######',
    '..########o',
    '..  *******',
    '      **   ',
  ]),
  sprite([
    '       ####     ', //
    '..    ##########',
    '...#############',
    '...############o',
    '..   ***********',
    '        ***     ',
  ]),
]

const SCALES = 'tS%#X8$&'
const KELP = '|)(ilt!'
const BUBBLE = 'o°·'
const SNOW = '·.'
const PUFF = '*·.oO'
const CHARS = SCALES + KELP + BUBBLE + SNOW + PUFF + 'o'

// Três espécies, só para o cardume não ser monocromático; os índices apontam para a paleta abaixo.
const SPECIES: Tint[] = [
  { '#': 2, '*': 3, '.': 4, o: 5 },
  { '#': 6, '*': 7, '.': 8, o: 5 },
  { '#': 9, '*': 10, '.': 11, o: 5 },
]

const DARK = [
  '#1d6b50', '#31a06d',
  '#e07a42', '#f6ab68', '#a9542a',
  '#eef6fa',
  '#9cc3d2', '#c6e0ea', '#5f8b9c',
  '#e3c65f', '#f5e096', '#a98c30',
  '#9fe0f2', '#36708a', '#dff2fa',
]

const LIGHT = [
  '#16684a', '#1f8f5c',
  '#c25520', '#e07c3e', '#8a3b14',
  '#0d3344',
  '#4b7f94', '#6ea4b8', '#2f5c6e',
  '#b08f14', '#cdab2e', '#7a6208',
  '#2c7f9c', '#5d97ac', '#1a5c74',
]

const RAYS = (tone: string) =>
  `linear-gradient(166deg, transparent 26%, ${tone} 29.5%, transparent 34%),` +
  `linear-gradient(194deg, transparent 48%, ${tone} 51.5%, transparent 56%),` +
  `linear-gradient(172deg, transparent 66%, ${tone} 69%, transparent 73%)`

type Fish = { size: number; x: number; y: number; vx: number; bob: number; seed: number; tint: Tint }
type Kelp = { x: number; h: number; phase: number; speed: number; seed: number }
type Drop = { x: number; y: number; vy: number; wobble: number; seed: number }
type Puff = { x: number; y: number; age: number }

export const aquarium: Theme = {
  id: 'aquarium',
  name: 'Aquário',
  hint: 'Cardume atravessando, algas no fundo e os grandes comendo os pequenos.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    backdrop: dark
      ? `radial-gradient(130% 70% at 50% -15%, rgba(140,225,245,0.30), rgba(140,225,245,0) 62%),${RAYS('rgba(190,240,252,0.09)')},linear-gradient(180deg, #0e4760 0%, #083049 52%, #04202f 100%)`
      : `radial-gradient(130% 70% at 50% -15%, rgba(255,255,255,0.75), rgba(255,255,255,0) 62%),${RAYS('rgba(255,255,255,0.45)')},linear-gradient(180deg, #d9f2f8 0%, #a9dcea 52%, #86c8dd 100%)`,
  }),

  create(cols, rows): Step {
    const floor = Math.max(3, Math.min(Math.round(rows * 0.3), 12))

    /** Põe o peixe fora da tela, de um lado ou do outro, com espécie e velocidade novas. */
    const place = (f: Fish, anywhere: boolean) => {
      const s = FISH[f.size]!
      f.vx = (Math.random() < 0.5 ? -1 : 1) * between(1.6, 3.2) * (1 + f.size * 0.35)
      f.x = anywhere ? between(0, cols) : f.vx > 0 ? -s.w : cols
      f.y = between(1, Math.max(2, rows - floor - s.h))
      f.bob = between(0, Math.PI * 2)
      f.seed = (Math.random() * 1e6) | 0
      f.tint = SPECIES[(Math.random() * SPECIES.length) | 0]!
    }

    // Muitos pequenos, poucos grandes: é o cardume que dá movimento, e o grande é o acontecimento.
    const total = fitCount(cols, rows, 260, 6, 18)
    const fish: Fish[] = Array.from({ length: total }, (_, i) => {
      const f: Fish = { size: i === 0 ? 2 : i < 3 ? 1 : Math.random() < 0.22 ? 1 : 0, x: 0, y: 0, vx: 0, bob: 0, seed: 0, tint: SPECIES[0]! }
      place(f, true)
      return f
    })

    const kelp: Kelp[] = Array.from({ length: fitCount(cols, rows, 140, 3, 22) }, () => ({
      x: (Math.random() * cols) | 0,
      h: Math.round(between(floor * 0.45, floor)),
      phase: between(0, Math.PI * 2),
      speed: between(0.5, 1.1),
      seed: (Math.random() * 1e6) | 0,
    }))

    const bubbles: Drop[] = Array.from({ length: fitCount(cols, rows, 700, 3, 12) }, () => ({
      x: between(0, cols),
      y: between(0, rows),
      vy: between(2.2, 5),
      wobble: between(0, Math.PI * 2),
      seed: (Math.random() * 1e6) | 0,
    }))

    const snow: Drop[] = Array.from({ length: fitCount(cols, rows, 420, 4, 18) }, () => ({
      x: between(0, cols),
      y: between(0, rows),
      vy: between(0.3, 0.9),
      wobble: between(0, Math.PI * 2),
      seed: (Math.random() * 1e6) | 0,
    }))

    const puffs: Puff[] = []

    return (p: Paint, dt: number, t: number) => {
      for (const k of kelp) {
        for (let i = 0; i < k.h; i++) {
          const lean = Math.sin(t * k.speed + i * 0.35 + k.phase) * (i / k.h) * 2.4
          p.put(k.x + lean, rows - 1 - i, KELP[(noise(k.seed, i) * KELP.length) | 0]!, i > k.h - 3 ? 1 : 0)
        }
      }

      for (const s of snow) {
        s.y += s.vy * dt
        if (s.y >= rows) {
          s.y -= rows
          s.x = between(0, cols)
        }
        p.put(s.x + Math.sin(t * 0.4 + s.wobble), s.y, SNOW[(noise(s.seed, (s.y / 3) | 0) * SNOW.length) | 0]!, 13)
      }

      for (const b of bubbles) {
        b.y -= b.vy * dt
        if (b.y < -1) {
          b.y = rows + between(0, 4)
          b.x = between(0, cols)
        }
        p.put(b.x + Math.sin(t * 2 + b.wobble) * 1.1, b.y, BUBBLE[(noise(b.seed, (b.y / 4) | 0) * BUBBLE.length) | 0]!, 12)
      }

      // Peixe grande alcançou um pequeno: o pequeno vira um sopro de caracteres e volta pela outra ponta.
      for (const big of fish) {
        if (big.size === 0) continue
        const bs = FISH[big.size]!
        const mx = big.vx > 0 ? big.x + bs.w - 1 : big.x
        const my = big.y + bs.h / 2
        for (const small of fish) {
          if (small.size >= big.size) continue
          const ss = FISH[small.size]!
          if (mx < small.x - 1 || mx > small.x + ss.w || my < small.y - 1 || my > small.y + ss.h) continue
          puffs.push({ x: small.x + ss.w / 2, y: small.y + ss.h / 2, age: 0 })
          place(small, false)
        }
      }

      for (const f of fish) {
        const s = FISH[f.size]!
        f.x += f.vx * dt
        if (f.vx > 0 ? f.x > cols : f.x + s.w < 0) place(f, false)
        stamp(p, s, f.x, f.y + Math.sin(t * 0.8 + f.bob) * 0.9, f.seed, f.tint, SCALES, f.vx < 0)
      }

      for (let i = puffs.length - 1; i >= 0; i--) {
        const puff = puffs[i]!
        puff.age += dt
        if (puff.age > 0.5) {
          puffs.splice(i, 1)
          continue
        }
        const r = 1 + puff.age * 5
        for (let a = 0; a < 8; a++) {
          const angle = (a / 8) * Math.PI * 2
          p.put(puff.x + Math.cos(angle) * r * 1.6, puff.y + Math.sin(angle) * r, PUFF[(noise(a, (puff.age * 20) | 0) * PUFF.length) | 0]!, 14)
        }
      }
    }
  },
}
