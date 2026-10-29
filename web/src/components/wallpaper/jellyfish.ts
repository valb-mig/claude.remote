import type { Paint } from './grid'
import { between, fitCount, noise, sprite, stamp, type Look, type Sprite, type Step, type Theme } from './scene'

/**
 * Água-viva: campânulas subindo e afundando no escuro, com os tentáculos arrastando atrás. O ciclo é
 * o do bicho de verdade — ela aperta a campânula e sobe de solavanco, depois relaxa e afunda devagar.
 */

// A campânula apertada é mais estreita e mais alta; a relaxada, mais larga e mais rasa.
const TIGHT: Sprite = sprite([
  '  #####  ', //
  ' ####### ',
  '#########',
  '#########',
  '#*******#',
  '. .. .. .',
])

const LOOSE: Sprite = sprite([
  '   #####   ', //
  ' ######### ',
  '###########',
  '##*******##',
  '. .. . .. .',
])

const BELL = 'S%#Xt8'
// Do alto para a ponta: o tentáculo começa cheio e vai sumindo.
const STRAND = '||::;;,,..'
const SPECK = '·.'
const CHARS = BELL + STRAND + SPECK

const TINT = { '#': 0, '*': 1, '.': 2 }

const DARK = ['#9b8cf0', '#cabeff', '#6a5bc4', '#8fa8f5', '#4e5f9e', '#e0a6f0', '#3b4a7a']
const LIGHT = ['#5b48c4', '#7a68e0', '#3b2d8c', '#4660b8', '#7085c4', '#9a4bb5', '#8fa2c8']

// Um ciclo de pulso: o aperto ocupa o começo, o resto é a descida.
const SQUEEZE = 0.28
const BOOST = 7.5
const SINK = 1.1

type Jelly = {
  x: number
  y: number
  phase: number
  period: number
  drift: number
  sway: number
  strands: number
  tail: number
  seed: number
}

export const jellyfish: Theme = {
  id: 'jellyfish',
  name: 'Água-viva',
  hint: 'Campânulas pulsando e afundando, com os tentáculos vindo atrás.',

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    backdrop: dark
      ? 'radial-gradient(120% 80% at 50% 0%, rgba(130,150,255,0.22), rgba(130,150,255,0) 65%),linear-gradient(180deg, #16215c 0%, #0b1238 55%, #060a22 100%)'
      : 'radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.80), rgba(255,255,255,0) 65%),linear-gradient(180deg, #dfe6ff 0%, #bcc8f5 55%, #9fb0ea 100%)',
  }),

  create(cols, rows): Step {
    const make = (anywhere: boolean): Jelly => ({
      x: between(0, cols),
      y: anywhere ? between(0, rows) : rows + 4,
      phase: Math.random(),
      period: between(2.6, 4.2),
      // Cada uma puxa um pouco para cima ou para baixo, senão todas ficariam presas na mesma faixa.
      drift: between(-0.5, 0.5),
      sway: between(0, Math.PI * 2),
      strands: 4 + ((Math.random() * 3) | 0),
      tail: Math.round(between(rows * 0.18, rows * 0.4)),
      seed: (Math.random() * 1e6) | 0,
    })

    const jellies: Jelly[] = Array.from({ length: fitCount(cols, rows, 700, 3, 7) }, () => make(true))
    const specks: { x: number; y: number; vy: number; seed: number }[] = Array.from(
      { length: fitCount(cols, rows, 400, 5, 20) },
      () => ({ x: between(0, cols), y: between(0, rows), vy: between(0.25, 0.7), seed: (Math.random() * 1e6) | 0 }),
    )

    return (p: Paint, dt: number, t: number) => {
      for (const s of specks) {
        s.y += s.vy * dt
        if (s.y >= rows) {
          s.y -= rows
          s.x = between(0, cols)
        }
        p.put(s.x, s.y, SPECK[(noise(s.seed, (s.y / 3) | 0) * SPECK.length) | 0]!, 6)
      }

      for (let i = jellies.length - 1; i >= 0; i--) {
        const j = jellies[i]!
        j.phase += dt / j.period
        if (j.phase >= 1) j.phase -= 1
        const tight = j.phase < SQUEEZE
        // O empurrão é mais forte no instante do aperto e vai cedendo até a campânula relaxar.
        j.y += (tight ? -BOOST * (1 - j.phase / SQUEEZE) : SINK) * dt + j.drift * dt
        j.x += Math.sin(t * 0.3 + j.sway) * 0.6 * dt

        const bell = tight ? TIGHT : LOOSE
        const bx = j.x - bell.w / 2
        if (j.y > rows + j.tail + 4 || j.y < -bell.h - 6) {
          jellies[i] = make(false)
          if (j.y < 0) jellies[i]!.y = rows + 4
          continue
        }
        stamp(p, bell, bx, j.y, j.seed, TINT, BELL)

        for (let s = 0; s < j.strands; s++) {
          const anchor = bx + 1 + ((bell.w - 2) * s) / Math.max(1, j.strands - 1)
          const len = j.tail - ((s * 3) % 5)
          for (let k = 0; k < len; k++) {
            const depth = k / len
            const lean = Math.sin(t * 1.4 - k * 0.3 + j.sway + s) * (0.6 + depth * 2.6)
            p.put(anchor + lean, j.y + bell.h + k, STRAND[(depth * STRAND.length) | 0]!, depth < 0.45 ? 3 : 4)
          }
        }
      }
    }
  },
}
