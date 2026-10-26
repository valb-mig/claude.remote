/**
 * Pixel art desenhada pelo próprio código, sem imagens: cada `rect` é um bloco de pixels do mundo,
 * ampliado sem suavização na tela. Paleta inspirada nos escritórios em corte de jogos de pixel.
 */

export type Ctx = CanvasRenderingContext2D

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

export const PAL = {
  wall: '#4b5470',
  wallLow: '#434b65',
  wallLine: '#3a4157',
  rim: '#a9b2be',
  rimLight: '#cdd3db',
  rimDark: '#7c8794',
  floor: '#c77a45',
  floorLine: '#b56b3b',
  floorEdge: '#8f5530',
  slab: '#2f2a2c',
  wood: '#b4774a',
  woodDark: '#8c5634',
  woodDeep: '#6e4229',
  brass: '#e0b37a',
  metal: '#8e98a4',
  metalDark: '#6f7985',
  metalDeep: '#535c67',
  metalLight: '#c9d0d8',
  ink: '#23262e',
  screenOff: '#39405a',
  screen: '#63c7ff',
  screenLight: '#c4efff',
  chair: '#2f3b63',
  chairLight: '#465a92',
  rack: '#2b2f38',
  rackFront: '#20242b',
  led: '#3ddc84',
  ledRed: '#ff6b5e',
  board: '#f2f4f7',
  boardFrame: '#9aa3ad',
  blue: '#2a78d6',
  red: '#e34948',
  sofa: '#5468a8',
  sofaDark: '#43548a',
  sofaLight: '#6c82c4',
  pot: '#b5653b',
  potDark: '#8e4c2b',
  leaf: '#4caf50',
  leafDark: '#2e7d32',
  glass: '#7fd3ff',
  glassLight: '#c4efff',
  amber: '#f5a623',
  white: '#f7f7f5',
  steam: '#d4dae2',
  books: ['#d9534f', '#5bc0de', '#f0ad4e', '#5cb85c', '#9b59b6', '#e8e1d0'],
  shadow: 'rgba(0,0,0,0.22)',
}

/** Cores dos claudinhos: o gestor na cor do Claude; os subagentes na ordem em que chegaram. */
const BODY = ['#d97757', '#2a78d6', '#1baf7a', '#e87ba4', '#7b6ce0', '#eda100', '#eb6834']

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)))
  return `rgb(${c(16)},${c(8)},${c(0)})`
}

export type Tint = { body: string; dark: string; light: string }
export const tintOf = (i: number): Tint => {
  const body = BODY[i % BODY.length]
  return { body, dark: shade(body, 0.72), light: shade(body, 1.18) }
}

// Corpo do claudinho, 20 × 13 (as pernas são desenhadas à parte, para andar). o: corpo, h: brilho,
// d: sombra, K: olho, t: gravata do gestor.
const FRONT = [
  '.....oooooooooo.....',
  '....hhoooooooooo....',
  '...oooooooooooooo...',
  '...oooKKooooKKooo...',
  '...oooKKooooKKooo...',
  '...oooKKooooKKooo...',
  '...oooooooooooooo...',
  'ooooooooottooooooooo',
  'ooooooooottooooooooo',
  '...oooooottoooooo...',
  '...oooooooooooooo...',
  '...oooooooooooooo...',
  '...dddddddddddddd...',
]
const BACK = FRONT.map((row) => row.replace(/[Kt]/g, 'o'))
const SIDE = [
  '.....oooooooooo.....',
  '....hhoooooooooo....',
  '...oooooooooooooo...',
  '...ooooooooooKKoKo..',
  '...ooooooooooKKoKo..',
  '...ooooooooooKKoKo..',
  '...oooooooooooooo...',
  '...ooooooooooooooooo',
  '...ooooooooooooooooo',
  '...oooooooooooooo...',
  '...oooooooooooooo...',
  '...oooooooooooooo...',
  '...dddddddddddddd...',
]
/** Altura do corpo; de pé, mais as pernas. */
export const BODY_ROWS = FRONT.length
export const LEG_ROWS = 4
const LEGS = [4, 7, 11, 14]

export type Facing = 'front' | 'back' | 'left' | 'right'

/**
 * Desenha um claudinho com os pés em (x, y). `step` alterna as pernas andando; `seated` esconde as
 * pernas (a cadeira ou o sofá cobrem); `arms` levanta os bracinhos (digitando, apontando).
 */
export function claudinho(
  ctx: Ctx,
  x: number,
  y: number,
  tint: Tint,
  o: { facing: Facing; step?: number; seated?: boolean; lead?: boolean; arms?: boolean; bob?: number },
): void {
  const rows = o.facing === 'front' ? FRONT : o.facing === 'back' ? BACK : SIDE
  const mirror = o.facing === 'left'
  const width = rows[0].length
  const left = Math.round(x) - width / 2
  const legs = o.seated ? 0 : LEG_ROWS
  const top = Math.round(y) - rows.length - legs + (o.bob ?? 0)

  // Sombra no chão.
  if (!o.seated) rect(ctx, left + 3, Math.round(y) - 1, width - 6, 2, PAL.shadow)

  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[mirror ? row.length - 1 - c : c]
      if (ch === '.') continue
      // Braços erguidos: as pontas da linha dos braços sobem.
      const lift = o.arms && (r === 7 || r === 8) && (c < 3 || c > width - 4) ? -3 : 0
      const color =
        ch === 'K' ? PAL.ink : ch === 't' ? (o.lead ? PAL.ink : tint.body) : ch === 'h' ? tint.light : ch === 'd' ? tint.dark : tint.body
      rect(ctx, left + c, top + r + lift, 1, 1, color)
    }
  })

  if (o.seated) return
  // Quatro perninhas de 2 px; andando, duas de cada vez ficam mais curtas.
  const step = o.step ?? 0
  LEGS.forEach((c, i) => {
    const short = step !== 0 && i % 2 === (step > 0 ? 0 : 1)
    rect(ctx, left + (mirror ? width - 2 - c : c), top + rows.length, 2, short ? 2 : LEG_ROWS, tint.dark)
  })
}

/** Balão de fala em pixel, com rabinho, acima de (x, y). `kind` define o desenho de dentro. */
export function bubble(ctx: Ctx, x: number, y: number, kind: 'dots' | 'alert' | 'sleep', frame: number): void {
  const bx = Math.round(x) - 7
  const by = Math.round(y) - 11
  const bg = kind === 'alert' ? PAL.amber : PAL.white
  rect(ctx, bx, by, 14, 9, PAL.ink)
  rect(ctx, bx + 1, by + 1, 12, 7, bg)
  rect(ctx, bx + 5, by + 9, 3, 1, PAL.ink)
  rect(ctx, bx + 6, by + 8, 1, 2, bg)
  if (kind === 'dots') {
    // As reticências acendem uma por vez.
    for (let i = 0; i < 3; i++) rect(ctx, bx + 3 + i * 3, by + 4, 2, 2, i <= frame % 3 ? PAL.ink : PAL.metalLight)
  } else if (kind === 'alert') {
    rect(ctx, bx + 6, by + 2, 2, 3, PAL.white)
    rect(ctx, bx + 6, by + 6, 2, 1, PAL.white)
  } else {
    // "z" em pixels.
    const zx = bx + 4
    const zy = by + 2
    rect(ctx, zx, zy, 6, 1, PAL.ink)
    rect(ctx, zx + 4, zy + 1, 1, 1, PAL.ink)
    rect(ctx, zx + 3, zy + 2, 1, 1, PAL.ink)
    rect(ctx, zx + 2, zy + 3, 1, 1, PAL.ink)
    rect(ctx, zx + 1, zy + 4, 1, 1, PAL.ink)
    rect(ctx, zx, zy + 4, 6, 1, PAL.ink)
  }
}
