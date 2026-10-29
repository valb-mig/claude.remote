import { rect, type Ctx } from './sprites'

/**
 * O céu da salinha segue o relógio: as cores passam devagar de uma hora para outra, o sol e a lua
 * cruzam o céu, e às vezes chove. Datas comemorativas enfeitam a cidade.
 */

export type Season = 'halloween' | 'junina' | 'natal' | null

export type Sky = {
  top: string
  bottom: string
  far: string
  near: string
  lit: string
  /** 0 de dia, 1 de noite: quanto escuro está (janelas acesas, luminárias, estrelas). */
  dark: number
  night: boolean
  dusk: boolean
  /** O céu visto de uma janela do prédio, lá em cima: mais perto do topo que do horizonte. */
  pane: [string, string]
  rain: boolean
  season: Season
  /** Hora com fração (14,5 = 14h30). */
  hour: number
  /** Muda a cada 5 minutos ou quando o tempo vira: o fundo pronto é refeito só então. */
  key: string
}

type Stop = { h: number; top: string; bottom: string; far: string; near: string }
const NIGHT = { top: '#0b1430', bottom: '#253463', far: '#1d2747', near: '#121a31' }
const STOPS: Stop[] = [
  { h: 0, ...NIGHT },
  { h: 4.5, ...NIGHT },
  { h: 5.75, top: '#5b5fb5', bottom: '#ffb37a', far: '#8b6f92', near: '#5e4c6e' },
  { h: 7, top: '#7cc4f5', bottom: '#ffe2b8', far: '#a9bfd3', near: '#8aa0b8' },
  { h: 12, top: '#6ec6ff', bottom: '#cdeeff', far: '#a8c4d8', near: '#86a4bc' },
  { h: 16.5, top: '#78b6ec', bottom: '#ffd9a0', far: '#a6b4c8', near: '#8496ad' },
  { h: 18, top: '#4b4fa5', bottom: '#ff9e6b', far: '#7d6188', near: '#574565' },
  { h: 19.5, ...NIGHT },
  { h: 24, ...NIGHT },
]

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const mix = (a: string, b: string, t: number) => {
  const ca = rgb(a)
  const cb = rgb(b)
  return hex(ca.map((v, i) => v + (cb[i] - v) * t))
}

/** Gerador repetível: a cidade é sempre a mesma, só a luz muda. */
export function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/** Número de 0 a 1 que só depende do texto: o mesmo dia e hora dão sempre a mesma chuva. */
function hashed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10_000) / 10_000
}

function seasonOf(d: Date): Season {
  const m = d.getMonth() + 1
  const day = d.getDate()
  if ((m === 10 && day >= 15) || (m === 11 && day <= 2)) return 'halloween'
  if (m === 6 || (m === 7 && day <= 15)) return 'junina'
  if (m === 12 || (m === 1 && day <= 6)) return 'natal'
  return null
}

/** `forceRain`: para ver a chuva sem esperar por ela (`/salinha?chuva`). */
export function skyAt(d: Date, forceRain = false): Sky {
  const hour = d.getHours() + d.getMinutes() / 60
  const i = STOPS.findIndex((s) => s.h > hour)
  const a = STOPS[i - 1]
  const b = STOPS[i]
  const t = (hour - a.h) / (b.h - a.h)
  // Chove em uma de cada nove horas, sempre as mesmas para o mesmo dia.
  const rain = forceRain || hashed(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`) < 0.11
  const grey = (c: string) => (rain ? mix(c, '#6c7480', 0.45) : c)
  const dark = hour < 4.5 || hour >= 19.5 ? 1 : hour < 7 ? 1 - (hour - 4.5) / 2.5 : hour >= 17 ? (hour - 17) / 2.5 : 0
  const top = grey(mix(a.top, b.top, t))
  const bottom = grey(mix(a.bottom, b.bottom, t))
  return {
    top,
    bottom,
    pane: [mix(top, bottom, 0.15), mix(top, bottom, 0.45)],
    far: grey(mix(a.far, b.far, t)),
    near: grey(mix(a.near, b.near, t)),
    lit: dark > 0.7 ? '#ffd36b' : '#ffd88a',
    dark,
    night: dark > 0.7,
    dusk: dark > 0.2 && dark <= 0.7,
    rain,
    season: seasonOf(d),
    hour,
    key: `${Math.floor((d.getHours() * 60 + d.getMinutes()) / 5)}|${rain ? 1 : 0}|${seasonOf(d)}`,
  }
}

/** Degradê do céu, sol e lua: muda devagar, vai para o fundo pronto. `ground` é a linha da calçada. */
export function skyBack(ctx: Ctx, width: number, ground: number, sky: Sky): void {
  const bands = 8
  for (let i = 0; i < bands; i++) {
    rect(ctx, 0, (ground / bands) * i, width, ground / bands + 1, mix(sky.top, sky.bottom, i / (bands - 1)))
  }
  if (sky.rain) return
  // O sol cruza das 6h às 18h; a lua, das 19h às 5h. O arco fica na faixa de céu que aparece acima
  // do prédio: mais embaixo eles passariam a viagem toda escondidos atrás dele.
  const arc = (p: number) => ({ x: width * (0.08 + 0.84 * p), y: 7 + (1 - Math.sin(Math.PI * p)) * 36 })
  if (sky.hour >= 6 && sky.hour <= 18) {
    const { x, y } = arc((sky.hour - 6) / 12)
    const sun = sky.dark > 0.2 ? '#ffb86b' : '#ffe27a'
    rect(ctx, x - 5, y - 3, 10, 6, sun)
    rect(ctx, x - 3, y - 5, 6, 10, sun)
    rect(ctx, x - 4, y - 4, 8, 8, sun)
  }
  const moonP = sky.hour >= 19 ? (sky.hour - 19) / 10 : sky.hour <= 5 ? (sky.hour + 5) / 10 : -1
  if (moonP >= 0) {
    // Lua cheia: um disco em blocos, com duas crateras.
    const { x, y } = arc(moonP)
    rect(ctx, x - 4, y - 2, 9, 5, '#f3f0d8')
    rect(ctx, x - 2, y - 4, 5, 9, '#f3f0d8')
    rect(ctx, x - 3, y - 3, 7, 7, '#f3f0d8')
    rect(ctx, x - 2, y - 2, 2, 2, '#ddd9c0')
    rect(ctx, x + 1, y + 1, 2, 2, '#ddd9c0')
  }
}

type Cloud = { seed: number; speed: number; y: number; w: number }
const CLOUDS: Cloud[] = Array.from({ length: 6 }, (_, i) => {
  const r = seeded(101 + i * 17)
  return { seed: r(), speed: 1.5 + r() * 3, y: 6 + r() * 44, w: 18 + Math.floor(r() * 22) }
})

/**
 * O que se mexe no céu, atrás da cidade: estrelas piscando, nuvens, um avião de vez em quando,
 * pássaros de dia e, no Halloween, morcegos. `t` em segundos.
 */
export function skyLife(ctx: Ctx, width: number, ground: number, sky: Sky, t: number, f: number): void {
  if (sky.dark > 0.5 && !sky.rain) {
    const rnd = seeded(7)
    ctx.globalAlpha = Math.min(1, (sky.dark - 0.5) * 2)
    for (let i = 0; i < width / 6; i++) {
      const x = rnd() * width
      const y = rnd() * ground * 0.6
      const blink = rnd()
      if ((i + (f >> 3)) % 9 !== 0 || blink < 0.5) rect(ctx, x, y, 1, 1, '#e8eefc')
    }
    ctx.globalAlpha = 1
  }
  // Nuvens: brancas de dia, escuras à noite, mais cheias com chuva.
  const clouds = sky.rain ? CLOUDS.length : 4
  ctx.globalAlpha = sky.rain ? 0.9 : sky.dark > 0.5 ? 0.35 : 0.8
  const color = sky.rain ? '#8d949e' : sky.dark > 0.5 ? '#4a5578' : '#ffffff'
  for (let i = 0; i < clouds; i++) {
    const c = CLOUDS[i]
    const span = width + c.w * 2
    const x = ((c.seed * span + t * c.speed) % span) - c.w
    rect(ctx, x, c.y + 3, c.w, 4, color)
    rect(ctx, x + c.w * 0.2, c.y, c.w * 0.45, 4, color)
    rect(ctx, x + c.w * 0.5, c.y + 1, c.w * 0.3, 3, color)
  }
  ctx.globalAlpha = 1
  // Avião cruzando a cada 2 minutos: de noite só as luzinhas.
  const flight = t % 120
  if (flight < 40 && !sky.rain) {
    const x = (flight / 40) * (width + 40) - 20
    const y = 14 + (Math.floor(t / 120) % 3) * 6
    if (sky.dark < 0.5) {
      rect(ctx, x, y, 12, 2, '#e9edf2')
      rect(ctx, x + 4, y - 2, 3, 2, '#e9edf2')
      rect(ctx, x + 4, y + 2, 3, 1, '#c5ccd5')
      rect(ctx, x + 11, y - 1, 1, 1, '#c5ccd5')
    }
    if (f % 8 < 4) rect(ctx, x + 1, y, 1, 1, PAL_RED)
    if (f % 8 >= 4) rect(ctx, x + 10, y + 1, 1, 1, '#ffffff')
  }
  // Pássaros de dia; morcegos nas noites de Halloween.
  const bats = sky.season === 'halloween' && sky.dark > 0.5
  if ((sky.dark < 0.3 || bats) && !sky.rain) {
    const flock = t % 70
    if (flock < 30) {
      const dir = Math.floor(t / 70) % 2 ? 1 : -1
      const p = flock / 30
      const x0 = dir > 0 ? -10 + p * (width + 20) : width + 10 - p * (width + 20)
      for (let i = 0; i < 3; i++) {
        const x = x0 - dir * i * 7
        const y = 30 + i * 3 + Math.sin(t * 2 + i) * 2
        const up = (f + i * 2) % 6 < 3
        const col = bats ? '#1a1424' : '#3a3f4a'
        rect(ctx, x - 2, y + (up ? -1 : 0), 2, 1, col)
        rect(ctx, x, y, 1, 1, col)
        rect(ctx, x + 1, y + (up ? -1 : 0), 2, 1, col)
      }
    }
  }
}

const PAL_RED = '#ff4d4d'

/** Chuva caindo, menos dentro do prédio em corte (`hole`). */
export function rainfall(ctx: Ctx, width: number, height: number, hole: { x: number; y: number; w: number; h: number }, t: number): void {
  const rnd = seeded(31)
  ctx.globalAlpha = 0.55
  for (let i = 0; i < width / 3; i++) {
    const x0 = rnd() * width
    const speed = 110 + rnd() * 50
    const y = (rnd() * height + t * speed) % height
    const x = (x0 - y * 0.25 + width) % width
    if (x > hole.x && x < hole.x + hole.w && y > hole.y && y < hole.y + hole.h) continue
    rect(ctx, x, y, 1, 3, '#b9c7dc')
  }
  ctx.globalAlpha = 1
}
