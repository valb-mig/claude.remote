import type { Paint } from './grid'
import { between, frameAt, motion, noise, stamp, type Look, type Motion, type Step, type Theme } from './scene'

/**
 * Lago das Carpas: o lago visto de cima, com as carpas coleando por caminhos curvos, as vitórias-régias
 * boiando e as ondulações que elas deixam. A carpa tem três quadros de corpo — reto, curvado para um
 * lado e para o outro —, que é o que dá o coleio sem o motor saber girar nada.
 */

// Quatro quadros: a cauda vai ao centro, sobe, volta e desce. O corpo fica firme — quem bate é a
// cauda, que é como a carpa anda de verdade.
const KOI: Motion = motion(
  [
    ['.      ###   ', '..   #######.', '...#########o', '..   #######.', '.      ###   '],
    ['..     ###   ', '...  #######.', '.  #########o', '     #######.', '       ###   '],
    ['.      ###   ', '..   #######.', '...#########o', '..   #######.', '.      ###   '],
    ['       ###   ', '     #######.', '.  #########o', '...  #######.', '..     ###   '],
  ],
  5,
)

const SCALE = '#8%X'
const PAD = '()oO'
const RIPPLE = '·-~'
const CHARS = SCALE + PAD + RIPPLE + 'o'
// Carpas brancas, laranjas e douradas; o lago é verde-escuro, como o deles.
const DARK = ['#f4a04a', '#ffd9a0', '#e07a2a', '#f0f6f2', '#c8d8cf', '#4fbfa2', '#2d8a74', '#8fd8c4']
const LIGHT = ['#b85508', '#8a6a00', '#7a3200', '#1d3a32', '#3d5a50', '#0b6b54', '#064a38', '#15735e']

type Koi = { cx: number; cy: number; rx: number; ry: number; speed: number; phase: number; tint: number; seed: number }

export const carpas: Theme = {
  id: 'carpas',
  name: 'Lago das Carpas',
  hint: 'O lago visto de cima, carpas coleando e vitórias-régias boiando.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    tile: 0.5,
    backdrop: dark
      ? 'radial-gradient(100% 70% at 40% 25%, rgba(120,220,190,0.14), rgba(120,220,190,0) 70%),linear-gradient(180deg, #1c6b61 0%, #124b44 55%, #0a2e29 100%)'
      : 'radial-gradient(100% 70% at 40% 25%, rgba(255,255,255,0.6), rgba(255,255,255,0) 70%),linear-gradient(180deg, #d4f0e8 0%, #a8ddd0 55%, #7fc4b4 100%)',
  }),

  create(cols, rows): Step {
    const koi: Koi[] = Array.from({ length: Math.max(3, Math.min(8, Math.round((cols * rows) / 500))) }, (_, i) => ({
      cx: between(0.2, 0.8),
      cy: between(0.2, 0.8),
      rx: between(0.18, 0.4),
      ry: between(0.14, 0.32),
      speed: between(0.06, 0.14) * (Math.random() < 0.5 ? -1 : 1),
      phase: between(0, Math.PI * 2),
      // Uma em cada três é branca; o resto se divide entre laranja e dourada.
      tint: i % 3,
      seed: (Math.random() * 1e6) | 0,
    }))
    const pads = Array.from({ length: Math.max(2, Math.round((cols * rows) / 700)) }, () => ({
      x: between(0, cols),
      y: between(0, rows),
      r: between(1.6, 3.2),
      sway: between(0, Math.PI * 2),
    }))

    return (p: Paint, _dt: number, t: number) => {
      for (const pad of pads) {
        const drift = Math.sin(t * 0.25 + pad.sway) * 0.7
        for (let dy = -pad.r; dy <= pad.r; dy++) {
          for (let dx = -pad.r * 1.7; dx <= pad.r * 1.7; dx++) {
            const d = Math.hypot(dx / 1.7, dy) / pad.r
            if (d > 1) continue
            // A folha tem uma fenda de um lado, como a de verdade.
            if (dx > 0 && Math.abs(dy) < 0.6 && d > 0.35) continue
            p.put(pad.x + dx + drift, pad.y + dy, PAD[(noise(pad.x | 0, dx | 0, dy | 0) * PAD.length) | 0]!, d > 0.75 ? 6 : 5)
          }
        }
      }

      for (const k of koi) {
        const a = k.speed * t * 2 * Math.PI + k.phase
        const x = cols * (k.cx + k.rx * Math.cos(a))
        const y = rows * (k.cy + k.ry * Math.sin(a))
        const left = Math.sin(a) * k.speed > 0
        const f = frameAt(KOI, t * 2.2, k.seed)
        const tint = k.tint === 0 ? { '#': 3, '.': 4, o: 6 } : k.tint === 1 ? { '#': 0, '.': 2, o: 6 } : { '#': 1, '.': 0, o: 6 }
        stamp(p, f, x - f.w / 2, y - f.h / 2, k.seed, tint, SCALE, left)
        // A esteira atrás da carpa: três marcas que vão sumindo.
        for (let i = 4; i < 8; i++) {
          const b = a - (left ? -1 : 1) * i * 0.055
          p.put(cols * (k.cx + k.rx * Math.cos(b)), rows * (k.cy + k.ry * Math.sin(b)), RIPPLE[Math.min(2, i - 4)]!, 7)
        }
      }
    }
  },
}
