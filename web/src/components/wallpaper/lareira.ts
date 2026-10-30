import type { Paint } from './grid'
import { between, clouds, noise, rampChar, type Look, type Step, type Theme } from './scene'

/**
 * Lareira: as achas embaixo, a chama subindo num campo de ruído que rola para cima, e as fagulhas
 * que escapam. A chama é um campo, não partículas: é o que dá a língua de fogo contínua em vez de
 * um chuvisco de pontinhos laranja.
 */

const FLAME = '.:;ct%#8@'
const LOG = '=~#%'
const SPARK = '·.*'
const CHARS = FLAME + LOG + SPARK
const DARK = ['#fffbe8', '#ffe2a8', '#ffb066', '#f07a2a', '#b84a12', '#8a3a12', '#55371f']
const LIGHT = ['#7a3200', '#9c4a06', '#c26410', '#d8832a', '#a85a18', '#7a3c0e', '#5c3a1c']

export const lareira: Theme = {
  id: 'lareira',
  name: 'Lareira',
  hint: 'Achas queimando, a chama subindo e as fagulhas escapando.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    tile: 0.5,
    backdrop: dark
      ? 'radial-gradient(90% 55% at 50% 108%, rgba(255,150,60,0.30), rgba(255,150,60,0) 70%),linear-gradient(180deg, #1d120c 0%, #2a180e 100%)'
      : 'radial-gradient(90% 55% at 50% 108%, rgba(255,190,120,0.65), rgba(255,190,120,0) 70%),linear-gradient(180deg, #f7ead8 0%, #ecd6ba 100%)',
  }),

  create(cols, rows): Step {
    const seed = (Math.random() * 1e6) | 0
    const base = rows - 1
    const logTop = Math.max(2, Math.round(rows * 0.1))
    const hearth = cols * 0.5
    // Largura da fogueira: ela afina para cima, como fogo de verdade.
    const spread = Math.max(4, cols * 0.18)
    const sparks = Array.from({ length: Math.round(cols * 0.25) }, () => ({
      x: hearth + between(-spread, spread),
      y: between(0, rows),
      vy: between(4, 10),
      sway: between(0, Math.PI * 2),
      seed: (Math.random() * 1e6) | 0,
    }))

    return (p: Paint, dt: number, t: number) => {
      // O campo rola para cima: o mesmo ruído lido mais alto a cada instante vira chama subindo.
      const top = Math.max(0, base - logTop - rows * 0.75)
      for (let y = base - logTop; y >= top; y--) {
        const h = (base - logTop - y) / Math.max(1, base - logTop - top)
        const width = spread * (1 - h * 0.72)
        for (let x = Math.floor(hearth - width); x <= Math.ceil(hearth + width); x++) {
          if (x < 0 || x >= cols) continue
          const edge = 1 - Math.abs(x - hearth) / Math.max(1, width)
          const n = clouds(x * 0.3, y * 0.22 + t * 2.6, seed)
          // Alta no pé e rareando no topo: a chama se desfaz antes de acabar a coluna.
          const v = (n * 0.85 + 0.35) * edge * (1 - h * h * 0.95)
          const ch = rampChar(FLAME, v * 1.5)
          if (ch) p.put(x, y, ch, v > 0.62 ? 0 : v > 0.48 ? 1 : v > 0.33 ? 2 : v > 0.2 ? 3 : 4)
        }
      }

      for (let i = 0; i < logTop; i++) {
        const y = base - i
        const width = spread * (1.15 - i * 0.12)
        for (let x = Math.floor(hearth - width); x <= Math.ceil(hearth + width); x++) {
          if (x < 0 || x >= cols) continue
          // A brasa no pé da acha pulsa, o resto é lenha escura.
          const ember = noise(x, i, seed) > 0.72 ? 0.5 + 0.5 * Math.sin(t * 2 + x) : 0
          p.put(x, y, LOG[(noise(seed, x, i) * LOG.length) | 0]!, ember > 0.7 ? 3 : ember > 0.35 ? 4 : i === 0 ? 6 : 5)
        }
      }

      for (const s of sparks) {
        s.y -= s.vy * dt
        if (s.y < -1) {
          s.y = base - logTop + between(0, 2)
          s.x = hearth + between(-spread * 0.7, spread * 0.7)
          s.vy = between(4, 10)
        }
        const rise = 1 - s.y / rows
        p.put(s.x + Math.sin(t * 2.2 + s.sway) * (1 + rise * 3), s.y, SPARK[(noise(s.seed, (s.y / 3) | 0) * SPARK.length) | 0]!, rise > 0.6 ? 2 : rise > 0.3 ? 3 : 4)
      }
    }
  },
}
