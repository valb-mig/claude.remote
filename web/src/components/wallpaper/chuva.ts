import type { Paint } from './grid'
import { between, noise, type Look, type Step, type Theme } from './scene'

/**
 * Chuva Lo-fi: a chuva riscando a janela na diagonal e as gotas grandes que escorrem no vidro,
 * deixando um rastro atrás. Sem trovão de propósito — o tema é para ficar de fundo, não para
 * assustar quem está lendo.
 */

const RAIN = '/|!'
const DROP = 'o°Oº'
const TRACK = '.:¦'
const MIST = '·.'
const CHARS = RAIN + DROP + TRACK + MIST
const DARK = ['#eaf0ff', '#cfd8ff', '#8f9cd0', '#5a6494', '#3a4068']
const LIGHT = ['#1a2250', '#2e3a74', '#4e5c9a', '#7d89b8', '#a4aecd']

type Rain = { x: number; y: number; speed: number; len: number }
type Drop = { x: number; y: number; speed: number; wait: number; trail: number }

export const chuva: Theme = {
  id: 'chuva',
  name: 'Chuva Lo-fi',
  hint: 'Chuva riscando a janela e gotas escorrendo devagar pelo vidro.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    backdrop: dark
      ? 'linear-gradient(180deg, #141a33 0%, #2a2346 60%, #3a2a44 100%)'
      : 'linear-gradient(180deg, #dfe3f2 0%, #cdc8e2 60%, #c4b9d2 100%)',
  }),

  create(cols, rows): Step {
    // A chuva cai inclinada; o passo em x por linha é o mesmo para todas, senão não parece vento.
    const slant = 0.42
    const rain: Rain[] = Array.from({ length: Math.round((cols * rows) / 70) }, () => ({
      x: between(-rows * slant, cols),
      y: between(0, rows),
      speed: between(26, 48),
      len: Math.round(between(2, 5)),
    }))
    const drops: Drop[] = Array.from({ length: Math.round(cols / 7) }, () => ({
      x: (Math.random() * cols) | 0,
      y: between(0, rows),
      speed: 0,
      wait: between(0, 4),
      trail: 0,
    }))
    const seed = (Math.random() * 1e6) | 0

    return (p: Paint, dt: number, _t: number) => {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (noise(x, y, seed) > 0.985) p.put(x, y, MIST[(noise(seed, x, y) * MIST.length) | 0]!, 4)
        }
      }

      for (const r of rain) {
        r.y += r.speed * dt
        r.x += r.speed * slant * dt
        if (r.y - r.len > rows || r.x - r.len * slant > cols) {
          r.y = -r.len
          r.x = between(-rows * slant, cols)
        }
        for (let i = 0; i < r.len; i++) {
          p.put(r.x - i * slant, r.y - i, RAIN[Math.min(RAIN.length - 1, i)]!, i === 0 ? 1 : i < 2 ? 2 : 3)
        }
      }

      // Gota de vidro: fica parada acumulando, desliza um trecho e para de novo.
      for (const d of drops) {
        if (d.wait > 0) {
          d.wait -= dt
          if (d.wait <= 0) d.speed = between(3, 9)
        } else {
          d.y += d.speed * dt
          d.trail = Math.min(rows, d.trail + d.speed * dt)
          d.speed *= 1 - dt * 0.8
          if (d.speed < 0.6) {
            d.speed = 0
            d.wait = between(0.5, 3)
          }
        }
        if (d.y > rows) {
          d.y = between(-4, 0)
          d.trail = 0
          d.wait = between(0, 3)
        }
        for (let i = 1; i < d.trail; i++) {
          const y = d.y - i
          if (y < 0) break
          // O rastro vai secando: perto da gota ainda marca, longe já quase sumiu.
          if (noise(d.x, y, seed) > 0.25 + i / d.trail) continue
          p.put(d.x, y, TRACK[Math.min(TRACK.length - 1, (i / Math.max(1, d.trail) * TRACK.length) | 0)]!, 3)
        }
        p.put(d.x, d.y, DROP[(noise(d.x, (d.y / 2) | 0) * DROP.length) | 0]!, 0)
      }
    }
  },
}
