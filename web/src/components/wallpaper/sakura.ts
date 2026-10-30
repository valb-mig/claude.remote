import type { Paint } from './grid'
import { between, frameAt, motion, noise, stamp, type Look, type Motion, type Step, type Theme } from './scene'

/**
 * Jardim Sakura: o galho atravessando o alto com as flores presas nele, e as pétalas descendo em
 * ziguezague. Cada pétala tem três quadros (de perfil, meia e de frente), o que faz ela girar
 * enquanto cai sem o motor precisar rotacionar nada.
 */

// Quatro quadros de uma pétala tombando: o motor não gira nada, quem gira é a máscara.
const PETAL: Motion = motion(
  [
    ['*#', ' #'],
    [' #', '*#'],
    [' *', '##'],
    ['#*', '# '],
  ],
  4,
)
const BLOSSOM = [' # ', '#o#', ' # ']
const BRANCH = '=~-_'
const FALL = '.*°,'
const BLOOM = '#%8'
const CHARS = BRANCH + FALL + BLOOM + 'o'
const DARK = ['#ffb3d2', '#ff7fb0', '#d94f87', '#ffe6f0', '#9c6a80', '#72505e']
const LIGHT = ['#d94f87', '#b8336a', '#8c1f4c', '#e8749f', '#7a5a46', '#5c4234']

type Petal = { x: number; y: number; vy: number; sway: number; spin: number; seed: number }

export const sakura: Theme = {
  id: 'sakura',
  name: 'Jardim Sakura',
  hint: 'Galho florido no alto e pétalas girando enquanto descem.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    tile: 0.4,
    backdrop: dark
      ? 'linear-gradient(180deg, #2e1a28 0%, #241420 55%, #1b0f18 100%)'
      : 'linear-gradient(180deg, #ffd3e3 0%, #ffeaf1 55%, #fff6f2 100%)',
  }),

  create(cols, rows): Step {
    const seed = (Math.random() * 1e6) | 0
    // O galho desce da borda esquerda em degraus, e as flores se penduram nele.
    const branch: { x: number; y: number }[] = []
    let by = Math.max(1, Math.round(rows * 0.08))
    for (let x = 0; x < cols * 0.8; x++) {
      branch.push({ x, y: by })
      if (noise(seed, x) > 0.78) by += 1
      if (by > rows * 0.3) break
    }
    const blossoms = branch.filter((_, i) => i > 2 && noise(seed, i, 2) > 0.74).map((b) => ({ ...b, phase: between(0, Math.PI * 2) }))

    const make = (anywhere: boolean): Petal => ({
      x: between(0, cols),
      y: anywhere ? between(0, rows) : between(-4, -1),
      vy: between(1.4, 3.6),
      sway: between(0, Math.PI * 2),
      spin: between(0.6, 1.8),
      seed: (Math.random() * 1e6) | 0,
    })
    const petals: Petal[] = Array.from({ length: Math.round((cols * rows) / 85) }, () => make(true))

    return (p: Paint, dt: number, t: number) => {
      for (const b of branch) {
        p.put(b.x, b.y, BRANCH[(noise(seed, b.x, 1) * BRANCH.length) | 0]!, 4)
        p.put(b.x, b.y + 1, BRANCH[(noise(seed, b.x, 3) * BRANCH.length) | 0]!, 5)
      }
      for (const b of blossoms) {
        // A flor balança de leve no galho antes de soltar pétala.
        const nod = Math.sin(t * 0.8 + b.phase) * 0.4
        stamp(p, { w: 3, h: 3, rows: BLOSSOM }, b.x - 1 + nod, b.y - 2, b.x, { '#': 0, o: 3 }, BLOOM)
      }
      for (const petal of petals) {
        petal.y += petal.vy * dt
        if (petal.y > rows + 2) Object.assign(petal, make(false))
        const x = petal.x + Math.sin(t * petal.spin + petal.sway) * 3.5
        const f = frameAt(PETAL, t * petal.spin, petal.seed)
        stamp(p, f, x, petal.y, petal.seed, { '#': 0, '*': 1 }, FALL)
      }
    }
  },
}
