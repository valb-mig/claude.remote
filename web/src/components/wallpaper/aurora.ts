import type { Paint } from './grid'
import { between, rampChar, smoothNoise, type Look, type Step, type Theme } from './scene'

/**
 * Aurora: faixas de luz ondulando no céu, com estrelas por cima. Cada faixa é uma curva de senos ao
 * longo da tela, e a densidade cai à medida que se afasta do centro dela — é o que faz a luz parecer
 * cortina em vez de risco.
 */

const RAMP = '.:;!|%#'
const STAR = '·.*+'
const CHARS = RAMP + STAR
const DARK = ['#8affc8', '#5fe3b0', '#c9a8ff', '#9f7fe0', '#ffffff', '#5b6b9a']
const LIGHT = ['#0e7a52', '#149c69', '#6a3fb5', '#8a63d0', '#2a3560', '#9aa6c4']

type Band = { y: number; amp: number; freq: number; speed: number; phase: number; thick: number; tint: number }

export const aurora: Theme = {
  id: 'aurora',
  name: 'Aurora',
  hint: 'Cortinas de luz ondulando no céu, entre o verde e o violeta.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    tile: 0.42,
    backdrop: dark
      ? 'linear-gradient(180deg, #030614 0%, #0b1838 55%, #16294a 100%)'
      : 'linear-gradient(180deg, #dfe6f5 0%, #c3d2ea 55%, #aec2de 100%)',
  }),

  create(cols, rows): Step {
    const bands: Band[] = Array.from({ length: 3 }, (_, i) => ({
      y: rows * (0.22 + i * 0.16),
      amp: between(rows * 0.06, rows * 0.14),
      freq: between(0.03, 0.07),
      speed: between(0.15, 0.4) * (i % 2 ? -1 : 1),
      phase: between(0, Math.PI * 2),
      thick: between(rows * 0.09, rows * 0.17),
      tint: i,
    }))
    const stars = Array.from({ length: Math.round(cols * 0.5) }, () => ({
      x: (Math.random() * cols) | 0,
      y: (Math.random() * rows * 0.6) | 0,
      rate: between(0.3, 1.1),
      phase: between(0, Math.PI * 2),
    }))

    return (p: Paint, _dt: number, t: number) => {
      for (const s of stars) {
        const twinkle = 0.55 + 0.45 * Math.sin(t * s.rate + s.phase)
        p.put(s.x, s.y, STAR[(twinkle * STAR.length) | 0]!, twinkle > 0.85 ? 4 : 5)
      }
      for (const b of bands) {
        for (let x = 0; x < cols; x++) {
          const center = b.y + Math.sin(x * b.freq + t * b.speed + b.phase) * b.amp + Math.sin(x * b.freq * 2.7 - t * b.speed * 1.6) * b.amp * 0.35
          // A cortina é mais densa em cima e vai rareando para baixo, como a de verdade.
          const reach = b.thick * (1 + smoothNoise(x * 0.08, t * 0.25, b.tint) * 0.9)
          for (let d = -2; d < reach; d++) {
            const y = Math.round(center + d)
            if (y < 0 || y >= rows) continue
            const falloff = d < 0 ? 1 + d / 2 : 1 - d / reach
            const v = falloff * (0.45 + smoothNoise(x * 0.12 + t * 0.3, d * 0.2, b.tint) * 0.8)
            const ch = rampChar(RAMP, v)
            if (ch) p.put(x, y, ch, b.tint === 2 ? (v > 0.55 ? 2 : 3) : v > 0.55 ? 0 : 1)
          }
        }
      }
    }
  },
}
