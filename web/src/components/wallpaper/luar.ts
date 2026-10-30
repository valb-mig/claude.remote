import type { Paint } from './grid'
import { between, clouds, noise, rampChar, type Look, type Step, type Theme } from './scene'

/**
 * Luar: a lua alta, nuvens finas passando na frente dela e o caminho de luz tremendo na água lá
 * embaixo. A lua é desenhada por distância ao centro, não por máscara, para o disco ficar redondo
 * em qualquer tamanho de grade.
 */

const MOON = '%#8&'
const CLOUD = '.:;=%'
const WATER = '-~=≈'
const STAR = '·.*'
const CHARS = MOON + CLOUD + WATER + STAR
const DARK = ['#ffe9a8', '#fff6d8', '#c9d6ff', '#8fa0d8', '#4a5c94', '#2a3a66']
const LIGHT = ['#8a6a12', '#a8872c', '#3a4a80', '#5d6fa8', '#8d9cc4', '#aab5d0']

type Drop = { x: number; y: number; speed: number; scale: number; seed: number }

export const luar: Theme = {
  id: 'luar',
  name: 'Luar',
  hint: 'A lua alta, nuvens finas cruzando e o caminho de luz tremendo na água.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    tile: 0.42,
    backdrop: dark
      ? 'radial-gradient(60% 40% at 72% 18%, rgba(255,233,168,0.18), rgba(255,233,168,0) 70%),linear-gradient(180deg, #0a1236 0%, #14275f 60%, #22407e 100%)'
      : 'radial-gradient(60% 40% at 72% 18%, rgba(255,245,210,0.75), rgba(255,245,210,0) 70%),linear-gradient(180deg, #dfe5f7 0%, #c6d0ee 60%, #adbce0 100%)',
  }),

  create(cols, rows): Step {
    const moonX = cols * 0.72
    const moonY = rows * 0.2
    const moonR = Math.max(3, Math.min(cols, rows) * 0.11)
    // A água ocupa o terço de baixo; o caminho de luz desce da lua até a borda.
    const sea = Math.round(rows * 0.68)

    const bands: Drop[] = Array.from({ length: 4 }, (_, i) => ({
      x: between(0, cols),
      y: rows * (0.1 + i * 0.13),
      speed: between(0.6, 1.8),
      scale: between(0.08, 0.16),
      seed: (Math.random() * 1e6) | 0,
    }))
    const stars = Array.from({ length: Math.round(cols * 0.4) }, () => ({
      x: (Math.random() * cols) | 0,
      y: (Math.random() * sea * 0.9) | 0,
      rate: between(0.3, 1.2),
      phase: between(0, Math.PI * 2),
    }))

    return (p: Paint, dt: number, t: number) => {
      for (const s of stars) {
        if (Math.hypot(s.x - moonX, s.y - moonY) < moonR * 2.2) continue
        const twinkle = 0.5 + 0.5 * Math.sin(t * s.rate + s.phase)
        p.put(s.x, s.y, STAR[(twinkle * STAR.length) | 0]!, twinkle > 0.8 ? 2 : 4)
      }

      // A lua: o miolo cheio, a borda rareando, e uma mancha mais clara de craterazinha.
      for (let y = Math.floor(moonY - moonR); y <= Math.ceil(moonY + moonR); y++) {
        for (let x = Math.floor(moonX - moonR * 1.7); x <= Math.ceil(moonX + moonR * 1.7); x++) {
          const d = Math.hypot((x - moonX) / 1.7, y - moonY) / moonR
          if (d > 1) continue
          const ch = MOON[Math.min(MOON.length - 1, ((1 - d) * MOON.length) | 0)]!
          p.put(x, y, ch, noise(x, y, 5) > 0.82 ? 1 : 0)
        }
      }

      for (const b of bands) {
        b.x -= b.speed * dt
        if (b.x < -cols) b.x += cols * 2
        for (let x = 0; x < cols; x++) {
          for (let dy = -1; dy <= 1; dy++) {
            const y = Math.round(b.y + dy)
            if (y < 0 || y >= sea) continue
            const v = clouds((x - b.x) * b.scale, y * 0.3, b.seed) - 0.5 - Math.abs(dy) * 0.12
            const ch = rampChar(CLOUD, v * 3)
            if (ch) p.put(x, y, ch, v > 0.28 ? 2 : 3)
          }
        }
      }

      // Água: linhas horizontais tremendo, e a coluna embaixo da lua acende mais.
      for (let y = sea; y < rows; y++) {
        const depth = (y - sea) / Math.max(1, rows - sea)
        for (let x = 0; x < cols; x++) {
          const wave = Math.sin(x * 0.22 - t * 1.6 + y * 0.9) + Math.sin(x * 0.11 + t * 1.1)
          const path = Math.max(0, 1 - Math.abs(x - moonX) / (moonR * (2 + depth * 6)))
          const v = (wave * 0.25 + 0.25) * (0.35 + path * 1.5)
          const ch = rampChar(WATER, v)
          if (ch) p.put(x, y, ch, path > 0.45 && v > 0.5 ? 1 : path > 0.2 ? 2 : 4)
        }
      }
    }
  },
}
