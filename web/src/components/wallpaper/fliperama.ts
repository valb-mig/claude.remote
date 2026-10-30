import type { Paint } from './grid'
import { between, frameAt, motion, noise, stamp, type Look, type Motion, type Step, type Theme } from './scene'

/**
 * Fliperama: a formação de invasores descendo em degraus, a nave atirando de baixo e o tiro subindo
 * até acertar. Os invasores têm dois quadros e trocam no mesmo instante, em bloco — é o compasso
 * marcado que faz o conjunto parecer de fliperama, e não um bando de bichos soltos.
 */

const INVADER: Motion = motion(
  [
    ['.#...#.', '.#####.', '##.#.##', '#######', '#.###.#', '#.#'.padEnd(7, ' ')],
    ['.#...#.', '#.###.#', '#######', '##.#.##', '.#####.', '..#.#..'],
  ],
  2,
)

const SHIP = ['...#...', '..###..', '#######']
const BLOCK = '#%8X'
const SHOT = '|!'
const BOOM = '*+x·'
const STAR = '·.'
const CHARS = BLOCK + SHOT + BOOM + STAR
const DARK = ['#7dff6a', '#4fd93e', '#2a8a20', '#ffffff', '#ff5a7a', '#1d3a5c']
const LIGHT = ['#1d7a10', '#15590b', '#0c3806', '#102a40', '#b02040', '#8fa8c0']

type Shot = { x: number; y: number }
type Boom = { x: number; y: number; age: number }

export const fliperama: Theme = {
  id: 'fliperama',
  name: 'Fliperama',
  hint: 'Formação de invasores descendo em degraus e a nave atirando de baixo.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    tile: 0.5,
    backdrop: dark
      ? 'linear-gradient(180deg, #04020c 0%, #0c0620 100%)'
      : 'linear-gradient(180deg, #e8e6f4 0%, #d4cfe8 100%)',
  }),

  create(cols, rows): Step {
    const seed = (Math.random() * 1e6) | 0
    const stepX = 9
    const stepY = 5
    const perRow = Math.max(2, Math.min(7, Math.floor((cols - 6) / stepX)))
    const lines = Math.max(2, Math.min(4, Math.floor((rows * 0.45) / stepY)))
    // `alive` é a formação; quem morre volta quando a onda inteira acaba.
    let alive = new Set<number>()
    const refill = () => {
      alive = new Set()
      for (let i = 0; i < perRow * lines; i++) alive.add(i)
    }
    refill()

    let drift = 0
    let dir = 1
    let drop = 0
    const shots: Shot[] = []
    const booms: Boom[] = []
    let shipX = cols / 2
    let shipDir = 1
    let cooldown = between(0.4, 1.4)

    return (p: Paint, dt: number, t: number) => {
      for (let x = 0; x < cols; x++) {
        const y = (noise(seed, x) * rows) | 0
        if (noise(seed, x, 1) > 0.85) p.put(x, y, STAR[(noise(seed, x, 2) * STAR.length) | 0]!, 5)
      }

      // A formação vai para um lado, bate na borda e desce um degrau.
      drift += dir * 3.2 * dt
      const left = 3 + drift
      if (left < 1 || left + perRow * stepX > cols - 1) {
        dir *= -1
        drop += 1.2
      }
      const f = frameAt(INVADER, t, 0)
      for (let row = 0; row < lines; row++) {
        for (let col = 0; col < perRow; col++) {
          const id = row * perRow + col
          if (!alive.has(id)) continue
          const x = left + col * stepX
          const y = 2 + row * stepY + drop
          if (y > rows - 6) {
            refill()
            drop = 0
            continue
          }
          stamp(p, f, x, y, id, { '#': row === 0 ? 0 : row === 1 ? 1 : 2, '.': 2 }, BLOCK)
        }
      }

      // A nave vai e volta, e atira quando o tempo dela chega.
      shipX += shipDir * 7 * dt
      if (shipX < 2 || shipX > cols - 9) shipDir *= -1
      stamp(p, { w: 7, h: 3, rows: SHIP }, shipX, rows - 4, 1, { '#': 3, '.': 3 }, BLOCK)
      cooldown -= dt
      if (cooldown <= 0) {
        cooldown = between(0.5, 1.6)
        shots.push({ x: shipX + 3, y: rows - 5 })
      }

      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i]!
        s.y -= 26 * dt
        p.put(s.x, s.y, SHOT[((t * 12) | 0) % 2]!, 3)
        if (s.y < 0) {
          shots.splice(i, 1)
          continue
        }
        // Acertou alguém da formação? Ele sai e vira um estouro.
        for (const id of alive) {
          const row = Math.floor(id / perRow)
          const col = id % perRow
          const ix = left + col * stepX
          const iy = 2 + row * stepY + drop
          if (s.x >= ix && s.x < ix + 7 && s.y >= iy && s.y < iy + 6) {
            alive.delete(id)
            booms.push({ x: ix + 3, y: iy + 3, age: 0 })
            shots.splice(i, 1)
            if (alive.size === 0) {
              refill()
              drop = 0
            }
            break
          }
        }
      }

      for (let i = booms.length - 1; i >= 0; i--) {
        const b = booms[i]!
        b.age += dt
        if (b.age > 0.4) {
          booms.splice(i, 1)
          continue
        }
        const r = 1 + b.age * 9
        for (let a = 0; a < 8; a++) {
          const angle = (a / 8) * Math.PI * 2
          p.put(b.x + Math.cos(angle) * r * 1.6, b.y + Math.sin(angle) * r, BOOM[(noise(a, (b.age * 25) | 0) * BOOM.length) | 0]!, 4)
        }
      }
    }
  },
}
