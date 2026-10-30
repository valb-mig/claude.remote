import { useAudio } from '@/lib/audio'
import { listenAudio } from '@/lib/store'
import type { Paint } from './grid'
import { noise, type Look, type Step, type Theme } from './scene'

/**
 * Som do PC: o espectro do que está tocando nas caixas, em barras no rodapé, com o pico de cada
 * faixa caindo devagar por cima — como o mostrador de um aparelho de som.
 *
 * Quem escuta é o PC (server/src/audio.ts); aqui só chega o espectro pronto, umas 25 vezes por
 * segundo. Com o PC mudo as barras descansam no zero, como as de um aparelho de som: fica a linha
 * de base e mais nada.
 */

const BAR = '#%8X='
const CHARS = BAR

const DARK = ['#9effa0', '#4fd964', '#ffd84f', '#ff8a3d', '#ff4d5e', '#e8fbff']
const LIGHT = ['#1d7a32', '#116b24', '#8a6a00', '#a04a08', '#9c1020', '#0d3444']

// Sem quadro por este tempo a ligação caiu ou ninguém está ouvindo.
const IDLE_MS = 1_500
// Quanto o pico de uma faixa desce por segundo, em fração da altura máxima.
const PEAK_FALL = 0.5

export const som: Theme = {
  id: 'som',
  name: 'Som do PC',
  hint: 'O espectro do que está tocando no PC, em barras no rodapé.',

  attach: listenAudio,

  look: (dark): Look => ({
    chars: CHARS,
    palette: dark ? DARK : LIGHT,
    size: 11,
    tile: 0.55,
    backdrop: dark
      ? 'radial-gradient(90% 55% at 50% 108%, rgba(60,220,140,0.16), rgba(60,220,140,0) 72%),linear-gradient(180deg, #060e10 0%, #04090c 60%, #02060a 100%)'
      : 'radial-gradient(90% 55% at 50% 108%, rgba(60,200,130,0.28), rgba(60,200,130,0) 72%),linear-gradient(180deg, #eef6f4 0%, #dfeae8 60%, #cfdedc 100%)',
  }),

  create(cols, rows): Step {
    const seed = (Math.random() * 1e6) | 0
    const floor = rows - 1
    const maxBar = floor - Math.max(2, Math.round(rows * 0.42))
    const peaks = new Float32Array(32)

    return (p: Paint, dt: number) => {
      const { spectrum, at } = useAudio.getState()
      const live = at > 0 && Date.now() - at < IDLE_MS
      const bands = spectrum.bands
      const n = bands.length || 1

      for (let b = 0; b < n; b++) {
        const x0 = Math.round((b * cols) / n)
        // Um vão entre as barras quando há largura para isso; grudadas elas viram um bloco só.
        const x1 = Math.max(x0 + 1, Math.round(((b + 1) * cols) / n) - (cols / n > 3 ? 1 : 0))
        // Sem ligação os números que sobraram são de antes; zerar evita o mostrador congelar no
        // último compasso que chegou. O `max(1)` deixa a linha de base acesa.
        const v = live ? bands[b]! / 255 : 0
        const h = Math.max(1, Math.round(v * maxBar))

        for (let i = 0; i < h; i++) {
          const y = floor - i
          const tier = i / Math.max(1, maxBar)
          const color = tier > 0.8 ? 4 : tier > 0.6 ? 3 : tier > 0.35 ? 2 : tier > 0.12 ? 1 : 0
          for (let x = x0; x < x1; x++) p.put(x, y, BAR[(noise(x, y, seed) * BAR.length) | 0]!, color)
        }

        peaks[b] = Math.max(h, peaks[b]! - dt * maxBar * PEAK_FALL)
        const peak = Math.round(peaks[b]!)
        if (peak > h) for (let x = x0; x < x1; x++) p.put(x, floor - peak, '=', 5)
      }
    }
  },
}
