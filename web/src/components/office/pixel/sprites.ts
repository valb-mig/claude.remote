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
  gold: '#f6c945',
  white: '#f7f7f5',
  paper: '#fff6d8',
  cardboard: '#c49a6c',
  cardboardLight: '#d8b48a',
  cardboardDark: '#a57c52',
  steam: '#d4dae2',
  smoke: '#9aa1ab',
  books: ['#d9534f', '#5bc0de', '#f0ad4e', '#5cb85c', '#9b59b6', '#e8e1d0'],
  shadow: 'rgba(0,0,0,0.22)',
}

/** Cores dos claudinhos: o gestor na cor do Claude; os subagentes com a primeira cor livre da área. */
export const BODY = ['#d97757', '#2a78d6', '#1baf7a', '#e87ba4', '#7b6ce0', '#eda100', '#eb6834']

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
// Piscando: os olhos viram um tracinho na linha de baixo.
const closed = (rows: string[]) => rows.map((row, r) => (r === 3 || r === 4 ? row.replace(/K/g, 'o') : row))
/** Quanto o corpo desaba no cochilo (ver `slump`). */
export const SLUMP = 4
/** Altura do corpo; de pé, mais as pernas. */
export const BODY_ROWS = FRONT.length
export const LEG_ROWS = 4
const LEGS = [4, 7, 11, 14]
const SPRITE_W = FRONT[0].length

export type Facing = 'front' | 'back' | 'left' | 'right'

export type Pose = { facing: Facing; step?: number; seated?: boolean; lead?: boolean; arms?: boolean; blink?: boolean; slump?: boolean }

/**
 * Desenha um claudinho com os pés em (x, y). `step` alterna as pernas andando; `seated` esconde as
 * pernas (a cadeira ou o sofá cobrem); `arms` levanta os bracinhos (digitando, apontando).
 */
function paint(ctx: Ctx, x: number, y: number, tint: Tint, o: Pose): void {
  const base = o.facing === 'front' ? FRONT : o.facing === 'back' ? BACK : SIDE
  const rows = (o.blink || o.slump) && o.facing !== 'back' ? closed(base) : base
  const mirror = o.facing === 'left'
  const left = x - SPRITE_W / 2
  const legs = o.seated ? 0 : LEG_ROWS
  // Dormindo: o corpo desaba um pouco, como quem apoiou a cabeça.
  const top = y - rows.length - legs + (o.slump ? SLUMP : 0)

  // Sombra no chão.
  if (!o.seated) rect(ctx, left + 3, y - 1, SPRITE_W - 6, 2, PAL.shadow)

  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[mirror ? row.length - 1 - c : c]
      if (ch === '.') continue
      // Braços erguidos: as pontas da linha dos braços sobem.
      const lift = o.arms && (r === 7 || r === 8) && (c < 3 || c > SPRITE_W - 4) ? -3 : 0
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
    rect(ctx, left + (mirror ? SPRITE_W - 2 - c : c), top + rows.length, 2, short ? 2 : LEG_ROWS, tint.dark)
  })
}

// Cada pose de cada cor é desenhada uma vez, pixel a pixel, e depois só copiada: um drawImage por claudinho.
const SPRITE_H = BODY_ROWS + LEG_ROWS + 2 + SLUMP
const FEET = BODY_ROWS + LEG_ROWS
const sprites = new Map<string, HTMLCanvasElement>()

function sprite(tint: Tint, o: Pose): HTMLCanvasElement {
  const key = `${tint.body}|${o.facing}|${o.step ?? 0}|${o.seated ? 1 : 0}|${o.lead ? 1 : 0}|${o.arms ? 1 : 0}|${o.blink ? 1 : 0}|${o.slump ? 1 : 0}`
  let c = sprites.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = SPRITE_W
    c.height = SPRITE_H
    paint(c.getContext('2d')!, SPRITE_W / 2, FEET, tint, o)
    sprites.set(key, c)
  }
  return c
}

/** Família do modelo, pelo nome (ex.: "claude-opus-5-5", "sonnet"): define o chapéu do gestor. */
export type Family = 'fable' | 'opus' | 'sonnet' | 'haiku'
export const familyOf = (model?: string): Family | undefined => /fable|opus|sonnet|haiku/i.exec(model ?? '')?.[0].toLowerCase() as Family | undefined

/** Chapéu por cima da cabeça (`top` é a primeira linha do corpo): coroa, chapéu de mago, boina ou brotinho. */
function hat(ctx: Ctx, cx: number, top: number, family: Family): void {
  if (family === 'opus') {
    rect(ctx, cx - 4, top - 2, 9, 2, PAL.gold)
    for (const dx of [-4, 0, 4]) rect(ctx, cx + dx, top - 4, 1, 2, PAL.gold)
    rect(ctx, cx, top - 2, 1, 1, PAL.red)
  } else if (family === 'fable') {
    const w = [10, 8, 6, 4, 2]
    w.forEach((wi, i) => rect(ctx, cx - wi / 2, top - 1 - i, wi, 1, i % 2 ? '#5b3fb0' : '#6f52c8'))
    rect(ctx, cx, top - 7, 1, 1, PAL.gold)
    rect(ctx, cx - 2, top - 3, 1, 1, PAL.gold)
  } else if (family === 'sonnet') {
    rect(ctx, cx - 5, top - 1, 11, 1, '#a63a3a')
    rect(ctx, cx - 4, top - 2, 9, 1, '#c24a4a')
    rect(ctx, cx, top - 3, 1, 1, '#a63a3a')
  } else {
    rect(ctx, cx, top - 4, 1, 4, PAL.leafDark)
    rect(ctx, cx - 2, top - 4, 2, 1, PAL.leaf)
    rect(ctx, cx + 1, top - 5, 2, 1, PAL.leaf)
  }
}

/** O que o claudinho leva nas mãos, na altura dos braços. */
export type Carry = 'folder' | 'box' | 'book'

function carried(ctx: Ctx, cx: number, top: number, item: Carry, facing: Facing): void {
  const dx = facing === 'left' ? -9 : facing === 'right' ? 4 : -3
  const y = top + 7
  if (item === 'box') {
    rect(ctx, cx + dx - 1, y - 2, 8, 6, PAL.cardboard)
    rect(ctx, cx + dx - 1, y - 2, 8, 1, PAL.cardboardLight)
    rect(ctx, cx + dx + 2, y - 2, 2, 6, PAL.cardboardDark)
  } else if (item === 'folder') {
    rect(ctx, cx + dx, y - 1, 7, 5, PAL.amber)
    rect(ctx, cx + dx, y - 2, 3, 1, PAL.amber)
    rect(ctx, cx + dx + 1, y, 5, 1, PAL.paper)
  } else {
    rect(ctx, cx + dx, y - 1, 6, 5, PAL.books[0])
    rect(ctx, cx + dx + 1, y, 4, 1, PAL.paper)
  }
}

/** Claudinho com os pés em (x, y): o corpo pronto do cache, o chapéu do modelo e o que leva nas mãos. */
export function claudinho(
  ctx: Ctx,
  x: number,
  y: number,
  tint: Tint,
  o: Pose & { bob?: number; hat?: Family; carry?: Carry },
): void {
  const fx = Math.round(x)
  const fy = Math.round(y) + (o.bob ?? 0)
  ctx.drawImage(sprite(tint, o), fx - SPRITE_W / 2, fy - FEET)
  const top = fy - BODY_ROWS - (o.seated ? 0 : LEG_ROWS)
  if (o.hat) hat(ctx, fx, top, o.hat)
  if (o.carry) carried(ctx, fx, top, o.carry, o.facing)
}

export type BubbleKind = 'dots' | 'alert' | 'sleep' | 'check' | 'error' | 'heart' | 'bulb'

/** Balão de fala em pixel, com rabinho, acima de (x, y). `kind` define o desenho de dentro. */
export function bubble(ctx: Ctx, x: number, y: number, kind: BubbleKind, frame: number): void {
  const bx = Math.round(x) - 7
  const by = Math.round(y) - 11
  const bg = kind === 'alert' ? PAL.amber : kind === 'error' ? PAL.red : kind === 'check' ? PAL.led : PAL.white
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
  } else if (kind === 'error') {
    // "!?" em branco.
    rect(ctx, bx + 4, by + 2, 1, 3, PAL.white)
    rect(ctx, bx + 4, by + 6, 1, 1, PAL.white)
    rect(ctx, bx + 7, by + 2, 3, 1, PAL.white)
    rect(ctx, bx + 9, by + 3, 1, 1, PAL.white)
    rect(ctx, bx + 8, by + 4, 1, 1, PAL.white)
    rect(ctx, bx + 8, by + 6, 1, 1, PAL.white)
  } else if (kind === 'check') {
    rect(ctx, bx + 3, by + 4, 1, 1, PAL.white)
    rect(ctx, bx + 4, by + 5, 1, 1, PAL.white)
    rect(ctx, bx + 5, by + 6, 1, 1, PAL.white)
    rect(ctx, bx + 6, by + 5, 1, 1, PAL.white)
    rect(ctx, bx + 7, by + 4, 1, 1, PAL.white)
    rect(ctx, bx + 8, by + 3, 1, 1, PAL.white)
    rect(ctx, bx + 9, by + 2, 1, 1, PAL.white)
  } else if (kind === 'heart') {
    rect(ctx, bx + 4, by + 2, 2, 1, PAL.red)
    rect(ctx, bx + 8, by + 2, 2, 1, PAL.red)
    rect(ctx, bx + 3, by + 3, 8, 2, PAL.red)
    rect(ctx, bx + 4, by + 5, 6, 1, PAL.red)
    rect(ctx, bx + 5, by + 6, 4, 1, PAL.red)
  } else if (kind === 'bulb') {
    rect(ctx, bx + 5, by + 2, 4, 3, PAL.gold)
    rect(ctx, bx + 4, by + 3, 6, 1, PAL.gold)
    rect(ctx, bx + 6, by + 5, 2, 1, PAL.metalDark)
    rect(ctx, bx + 6, by + 6, 2, 1, PAL.metalDeep)
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
