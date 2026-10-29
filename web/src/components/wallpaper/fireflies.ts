import type { Paint } from './grid'
import { between, fitCount, noise, type Look, type Step, type Theme } from './scene'

/**
 * Vaga-lumes: um campo escuro com o mato balançando embaixo e pontos vagando devagar, cada um
 * acendendo no seu ritmo. No alto da piscada o bicho espalha um halo nas células vizinhas, que é o
 * jeito de sugerir brilho numa grade de caracteres sem borrar nada (borrão custa caro; isto não).
 */

const GRASS = 'XtS%|i'
const GLOW = '·:*o'
const POLLEN = '·.'
const CHARS = GRASS + GLOW + POLLEN

const DARK = ['#1d4030', '#2f6b45', '#8a9a4a', '#cbd96a', '#f4fbc0', '#8d9d46', '#3c4a2c']
const LIGHT = ['#3f5c24', '#587a32', '#7d7a3c', '#9a6a08', '#5c3a00', '#a39b62', '#9aa883']

type Fly = {
  /** Centro do passeio; anda devagar para o bicho não ficar preso ao mesmo canto. */
  cx: number
  cy: number
  ax: number
  ay: number
  fx: number
  fy: number
  px: number
  py: number
  drift: number
  rate: number
  blink: number
}

export const fireflies: Theme = {
  id: 'fireflies',
  name: 'Vaga-lumes',
  hint: 'Campo escuro, mato balançando e pontos acendendo fora de compasso.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    backdrop: dark
      ? 'radial-gradient(100% 60% at 50% 115%, rgba(120,170,80,0.18), rgba(120,170,80,0) 70%),linear-gradient(180deg, #06150f 0%, #04120c 55%, #020a07 100%)'
      : 'radial-gradient(100% 60% at 50% 115%, rgba(255,240,180,0.60), rgba(255,240,180,0) 70%),linear-gradient(180deg, #edead0 0%, #dbe0b4 55%, #c3d19a 100%)',
  }),

  create(cols, rows): Step {
    const tall = Math.max(2, Math.min(Math.round(rows * 0.22), 8))
    const seed = (Math.random() * 1e6) | 0

    const flies: Fly[] = Array.from({ length: fitCount(cols, rows, 150, 8, 36) }, () => ({
      cx: between(0, cols),
      cy: between(1, Math.max(2, rows - tall - 1)),
      ax: between(2, 7),
      ay: between(1, 3.5),
      // Frequências próximas mas nunca iguais: a soma das duas nunca fecha um laço visível.
      fx: between(0.1, 0.3),
      fy: between(0.14, 0.38),
      px: between(0, Math.PI * 2),
      py: between(0, Math.PI * 2),
      drift: between(-0.5, 0.5),
      rate: between(0.7, 2),
      blink: between(0, Math.PI * 2),
    }))

    const pollen = Array.from({ length: fitCount(cols, rows, 500, 3, 14) }, () => ({
      x: between(0, cols),
      y: between(0, rows),
      vy: between(0.2, 0.6),
      vx: between(-0.4, 0.4),
      seed: (Math.random() * 1e6) | 0,
    }))

    return (p: Paint, dt: number, t: number) => {
      for (let x = 0; x < cols; x++) {
        // Duas escalas de ruído: a larga junta o mato em moitas, a fina dá o recorte de cada folha.
        const n = (noise(seed, (x / 4) | 0) * 2 + noise(seed, x)) / 3
        if (n < 0.34) continue
        const h = 1 + Math.floor(n * n * tall)
        for (let i = 0; i < h; i++) {
          const lean = Math.sin(t * 0.7 + x * 0.25) * (i / h) * 1.4
          p.put(x + lean, rows - 1 - i, GRASS[(noise(seed, x, i) * GRASS.length) | 0]!, i > h - 2 ? 1 : 0)
        }
      }

      for (const s of pollen) {
        s.y += s.vy * dt
        s.x += s.vx * dt
        if (s.y >= rows - tall) {
          s.y = -1
          s.x = between(0, cols)
        }
        p.put(s.x, s.y, POLLEN[(noise(s.seed, (s.y / 3) | 0) * POLLEN.length) | 0]!, 6)
      }

      for (const f of flies) {
        f.cx += f.drift * dt
        if (f.cx < -f.ax) f.cx += cols + f.ax * 2
        if (f.cx > cols + f.ax) f.cx -= cols + f.ax * 2
        const x = f.cx + Math.sin(t * f.fx + f.px) * f.ax
        const y = f.cy + Math.sin(t * f.fy + f.py) * f.ay

        // Acende rápido e apaga devagar: o cubo deixa o bicho apagado na maior parte do tempo.
        const wave = Math.sin(t * f.rate + f.blink)
        const lit = wave > 0 ? wave * wave * wave : 0
        if (lit < 0.04) continue
        p.put(x, y, GLOW[Math.min(GLOW.length - 1, (lit * GLOW.length) | 0)]!, lit > 0.55 ? 4 : lit > 0.2 ? 3 : 2)
        if (lit > 0.6) {
          p.put(x - 1, y, '·', 5)
          p.put(x + 1, y, '·', 5)
          p.put(x, y - 1, '·', 5)
          p.put(x, y + 1, '·', 5)
        }
      }
    }
  },
}
