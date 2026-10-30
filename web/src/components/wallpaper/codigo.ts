import type { Paint } from './grid'
import { between, noise, type Look, type Step, type Theme } from './scene'

/**
 * Chuva de Código: colunas caindo, cada uma com a cabeça acesa e o rastro apagando atrás. É o tema
 * mais barato de todos — o estado é um registro por coluna, não um por partícula.
 */

const GLYPHS = '01ABCDEFGHJKLMNPQRSTUVXZ<>|/\\$#%&*+=:;-'
const DARK = ['#ffffff', '#d6ffe4', '#5dff8a', '#2fae57', '#1a6b36', '#0d3b1e']
// No claro quem acende é quem escurece: o contraste contra o fundo pálido é que faz a coluna aparecer.
const LIGHT = ['#06301a', '#0b5c30', '#149150', '#46b87a', '#7fd3a4', '#aee3c6']

type Column = { y: number; speed: number; len: number; seed: number }

export const codigo: Theme = {
  id: 'codigo',
  name: 'Chuva de Código',
  hint: 'Colunas caindo com a cabeça acesa e o rastro apagando atrás.',

  look: (dark): Look => ({
    chars: GLYPHS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    backdrop: dark
      ? 'linear-gradient(180deg, #000402 0%, #001208 100%)'
      : 'linear-gradient(180deg, #eafaf0 0%, #cdeeda 100%)',
  }),

  create(cols, rows): Step {
    const reset = (c: Column, anywhere: boolean) => {
      c.y = anywhere ? between(-rows, rows) : between(-rows * 0.6, -2)
      c.speed = between(5, 16)
      c.len = Math.round(between(rows * 0.2, rows * 0.8))
      c.seed = (Math.random() * 1e6) | 0
    }
    // Nem toda coluna tem chuva ao mesmo tempo: as vazias são o respiro que deixa ler o desenho.
    const rain: Column[] = Array.from({ length: cols }, () => {
      const c: Column = { y: 0, speed: 0, len: 0, seed: 0 }
      reset(c, true)
      return c
    })
    const quiet = new Set<number>()
    for (let x = 0; x < cols; x++) if (noise(x, 7) < 0.3) quiet.add(x)

    return (p: Paint, dt: number, t: number) => {
      for (let x = 0; x < cols; x++) {
        if (quiet.has(x)) continue
        const c = rain[x]!
        c.y += c.speed * dt
        if (c.y - c.len > rows) reset(c, false)
        for (let i = 0; i < c.len; i++) {
          const y = Math.floor(c.y) - i
          if (y < 0 || y >= rows) continue
          // O caractere de cada célula troca de vez em quando, como no terminal da referência.
          const ch = GLYPHS[(noise(c.seed, y, Math.floor(t * 3 + noise(c.seed, y) * 9)) * GLYPHS.length) | 0]!
          const fade = i / c.len
          p.put(x, y, ch, i === 0 ? 0 : i < 3 ? 1 : fade < 0.35 ? 2 : fade < 0.6 ? 3 : fade < 0.85 ? 4 : 5)
        }
      }
    }
  },
}
