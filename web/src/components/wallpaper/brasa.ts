import type { Paint } from './grid'
import { between, clouds, noise, rampChar, type Look, type Step, type Theme } from './scene'

/**
 * Brasa: o tema da casa, no laranja do Claude. Um leito de brasas respirando no rodapé, o calor
 * subindo em véus e as fagulhas se soltando. Mais contido que a Lareira — aqui não há chama, só o
 * que sobra dela.
 */

const EMBER = '.:;%#8'
const HEAT = '·.:'
const SPARK = '·.*+'
const CHARS = EMBER + HEAT + SPARK
const DARK = ['#fff1e0', '#f5c4a8', '#e08a64', '#b85a34', '#7a3618', '#6b3418']
const LIGHT = ['#7a2e08', '#9c4414', '#c25f28', '#d98a52', '#a85a30', '#6b3a1c']

export const brasa: Theme = {
  id: 'brasa',
  name: 'Brasa',
  hint: 'Brasas respirando no rodapé e o calor subindo, no laranja do Claude.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    tile: 0.45,
    backdrop: dark
      ? 'radial-gradient(95% 50% at 50% 112%, rgba(224,138,100,0.26), rgba(224,138,100,0) 72%),linear-gradient(180deg, #0b0908 0%, #1b130f 60%, #3b2217 100%)'
      : 'radial-gradient(95% 50% at 50% 112%, rgba(224,138,100,0.45), rgba(224,138,100,0) 72%),linear-gradient(180deg, #fbf3ec 0%, #f2e2d4 60%, #e8d0bc 100%)',
  }),

  create(cols, rows): Step {
    const seed = (Math.random() * 1e6) | 0
    const bed = Math.max(2, Math.round(rows * 0.16))
    const sparks = Array.from({ length: Math.round(cols * 0.3) }, () => ({
      x: between(0, cols),
      y: between(0, rows),
      vy: between(2.5, 7),
      sway: between(0, Math.PI * 2),
      seed: (Math.random() * 1e6) | 0,
    }))

    return (p: Paint, dt: number, t: number) => {
      // Véus de calor: sobem devagar e desaparecem antes da metade da tela.
      for (let y = rows - bed - 1; y >= rows * 0.35; y--) {
        const h = (rows - bed - y) / Math.max(1, rows - bed - rows * 0.35)
        for (let x = 0; x < cols; x++) {
          const v = (clouds(x * 0.16, y * 0.13 + t * 1.3, seed) - 0.46) * 2.6 * (1 - h)
          const ch = rampChar(HEAT, v)
          if (ch) p.put(x, y, ch, v > 0.5 ? 3 : 4)
        }
      }

      // O leito de brasas: cada carvão respira no seu tempo, uns quase apagados.
      for (let i = 0; i < bed; i++) {
        const y = rows - 1 - i
        for (let x = 0; x < cols; x++) {
          const life = noise(x, i, seed)
          if (life < 0.18) continue
          const glow = life * (0.55 + 0.45 * Math.sin(t * (0.6 + life) + x * 0.7 + i))
          const depth = 1 - i / bed
          const v = glow * (0.5 + depth * 0.9)
          const ch = rampChar(EMBER, v * 1.3)
          if (ch) p.put(x, y, ch, v > 0.78 ? 0 : v > 0.6 ? 1 : v > 0.42 ? 2 : v > 0.26 ? 3 : 4)
        }
      }

      for (const s of sparks) {
        s.y -= s.vy * dt
        if (s.y < -1) {
          s.y = rows - bed + between(-1, 1)
          s.x = between(0, cols)
          s.vy = between(2.5, 7)
        }
        const rise = 1 - s.y / rows
        p.put(s.x + Math.sin(t * 1.8 + s.sway) * (1 + rise * 3.5), s.y, SPARK[(noise(s.seed, (s.y / 3) | 0) * SPARK.length) | 0]!, rise > 0.65 ? 1 : rise > 0.35 ? 2 : 3)
      }
    }
  },
}
