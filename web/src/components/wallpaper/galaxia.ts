import type { Paint } from './grid'
import { between, clouds, noise, rampChar, type Look, type Step, type Theme } from './scene'

/**
 * Galáxia: três camadas de estrelas correndo em velocidades diferentes (as de trás quase paradas,
 * as da frente visíveis), uma nebulosa de ruído suave ao fundo e, de vez em quando, um risco
 * cruzando. O paralaxe é o que dá profundidade sem desenhar nada em perspectiva.
 */

const STAR = '·.*+x'
const NEBULA = '.:;%'
const TRAIL = '-=~'
const CHARS = STAR + NEBULA + TRAIL
const DARK = ['#ffffff', '#cfe4ff', '#9fd4ff', '#5d7fb8', '#3f5a96', '#ff5a5a']
const LIGHT = ['#10183a', '#22305e', '#3a4f85', '#6d82b0', '#9aaac8', '#b03030']

type Layer = { stars: { x: number; y: number; rate: number; phase: number }[]; speed: number; tint: number }
type Shot = { x: number; y: number; vx: number; vy: number; life: number }

export const galaxia: Theme = {
  id: 'galaxia',
  name: 'Galáxia',
  hint: 'Três camadas de estrelas em paralaxe, nebulosa ao fundo e riscos cruzando.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    backdrop: dark
      ? 'radial-gradient(90% 60% at 30% 35%, rgba(90,130,220,0.22), rgba(90,130,220,0) 70%),linear-gradient(180deg, #02030a 0%, #060a1c 60%, #0d0a24 100%)'
      : 'radial-gradient(90% 60% at 30% 35%, rgba(150,170,230,0.35), rgba(150,170,230,0) 70%),linear-gradient(180deg, #e4e7f4 0%, #d2d6ea 60%, #c2c3de 100%)',
  }),

  create(cols, rows): Step {
    const layers: Layer[] = [0, 1, 2].map((i) => ({
      speed: [0.25, 0.7, 1.8][i]!,
      tint: [4, 2, 0][i]!,
      stars: Array.from({ length: Math.round((cols * rows) / [90, 150, 320][i]!) }, () => ({
        x: between(0, cols),
        y: between(0, rows),
        rate: between(0.4, 1.6),
        phase: between(0, Math.PI * 2),
      })),
    }))
    const seed = (Math.random() * 1e6) | 0
    const shots: Shot[] = []
    let nextShot = between(3, 9)

    return (p: Paint, dt: number, t: number) => {
      // A nebulosa anda bem devagar: ela é o que dá a sensação de estar dentro de algo grande.
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v = clouds(x * 0.055 + t * 0.012, y * 0.085, seed) - 0.47
          const ch = rampChar(NEBULA, v * 2.6)
          if (ch) p.put(x, y, ch, 4)
        }
      }

      for (const layer of layers) {
        for (const s of layer.stars) {
          s.x -= layer.speed * dt
          if (s.x < -1) {
            s.x += cols + 1
            s.y = between(0, rows)
          }
          const twinkle = 0.5 + 0.5 * Math.sin(t * s.rate + s.phase)
          // Uma estrela em cada quarenta é uma gigante vermelha, só para o céu não ser monocromático.
          const red = noise(Math.round(s.x), Math.round(s.y), 3) > 0.975
          p.put(s.x, s.y, STAR[(twinkle * STAR.length) | 0]!, red ? 5 : layer.tint + (twinkle > 0.8 ? 0 : 1))
        }
      }

      nextShot -= dt
      if (nextShot <= 0) {
        nextShot = between(4, 12)
        const angle = between(2.4, 2.9)
        shots.push({ x: between(cols * 0.4, cols), y: between(0, rows * 0.4), vx: Math.cos(angle) * 55, vy: -Math.sin(angle) * 55, life: 0 })
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i]!
        s.life += dt
        s.x += s.vx * dt
        s.y += s.vy * dt
        if (s.life > 1.4 || s.x < -6 || s.y > rows + 6) {
          shots.splice(i, 1)
          continue
        }
        for (let k = 0; k < 7; k++) {
          p.put(s.x - (s.vx / 55) * k * 1.2, s.y - (s.vy / 55) * k * 1.2, k === 0 ? '*' : TRAIL[Math.min(TRAIL.length - 1, (k / 3) | 0)]!, k < 2 ? 0 : k < 4 ? 1 : 3)
        }
      }
    }
  },
}
