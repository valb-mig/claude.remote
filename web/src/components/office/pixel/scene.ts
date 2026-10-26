import type { OfficeActivity } from '@/lib/types'
import { PAL, rect, type Ctx, type Facing } from './sprites'

/**
 * O escritório em corte, como nos jogos de prédio em pixel: cada andar tem áreas (uma por conversa,
 * separadas por divisórias de cubículo) e o corredor com o elevador; o prédio fica numa cidade, com
 * o céu da hora do dia. Medidas em pixels do mundo.
 */
export const AREA_W = 256
export const FLOOR_H = 112
export const CORRIDOR_W = 72
/** Paredes de fora do prédio. */
const WALL_W = 10
/** Telhado (mureta, letreiro, caixa d'água, antena) e céu acima dele. */
const ROOF_H = 30
const SKY_H = 36
/** Calçada e rua embaixo do prédio. */
const GROUND_H = 28
/** Linha onde a parede encontra o chão; o chão vai daqui até FLOOR_FRONT. */
export const FLOOR_BACK = 84
export const FLOOR_FRONT = 102
/** Faixa da frente do chão por onde se anda (pelo corredor também). */
export const LANE_Y = 100

type Seat = 'chair' | 'sofa'
export type Spot = { x: number; y: number; facing: Facing; seated?: Seat; arms?: boolean }

/** Onde cada claudinho fica (os pés) em cada estação da área. `ask` é no corredor (ver layout). */
export const SPOTS: Record<Exclude<OfficeActivity, 'ask'>, Spot> = {
  files: { x: 39, y: 94, facing: 'back' },
  web: { x: 71, y: 95, facing: 'back', seated: 'chair', arms: true },
  edit: { x: 111, y: 95, facing: 'back', seated: 'chair', arms: true },
  plan: { x: 149, y: 92, facing: 'back', arms: true },
  command: { x: 177, y: 95, facing: 'back', arms: true },
  think: { x: 197, y: 96, facing: 'back' },
  idle: { x: 222, y: 88, facing: 'front', seated: 'sofa' },
  background: { x: 222, y: 88, facing: 'front', seated: 'sofa' },
}

/**
 * O n-ésimo na mesma estação: ao lado (e, sem cadeira sobrando, de pé atrás de quem está sentado).
 * Quem pede você sai da área e espera no corredor (`askX`), virado para a tela.
 */
export function spotFor(activity: OfficeActivity, n: number, askX: number): Spot {
  if (activity === 'ask') return { x: askX + (askX > AREA_W / 2 ? 1 : -1) * n * 16, y: 97, facing: 'front' }
  const s = SPOTS[activity]
  if (n === 0) return s
  if (s.seated === 'sofa' && n === 1) return { ...s, x: s.x + 18 }
  const side = n % 2 === 1 ? 1 : -1
  const dx = side * Math.ceil(n / 2) * 18
  return { x: s.x + dx, y: Math.min(LANE_Y, s.y + 3), facing: s.facing, arms: s.arms && !s.seated }
}

// ---------------------------------------------------------------------------
// Planta: andares de baixo para cima; com espaço, área | corredor | área; no estreito, corredor | área.
// ---------------------------------------------------------------------------

export type Area = { x: number; y: number; floor: number; side: 'left' | 'right' }

export type Layout = {
  perFloor: 1 | 2
  floors: number
  width: number
  height: number
  building: { x: number; y: number; w: number; h: number }
  /** Topo do andar `floor` (0 é o térreo). */
  floorTop: (floor: number) => number
  corridorX: number
  area: (slot: number) => Area
  /** Elevador e lugar de espera no corredor, em coordenadas da área (fora dela). */
  entryX: (side: Area['side']) => number
  askX: (side: Area['side']) => number
}

/** Largura do prédio (sem a cidade em volta). */
export const buildingWidth = (perFloor: 1 | 2) => (perFloor === 2 ? AREA_W * 2 + CORRIDOR_W : CORRIDOR_W + AREA_W) + WALL_W * 2

/** `side`: quanto de cidade aparece de cada lado do prédio. */
export function layoutFor(slots: number, perFloor: 1 | 2, side: number): Layout {
  const floors = Math.max(1, Math.ceil(slots / perFloor))
  const bw = buildingWidth(perFloor)
  const bx = side
  const by = SKY_H
  const bh = ROOF_H + floors * FLOOR_H
  const corridorX = bx + WALL_W + (perFloor === 2 ? AREA_W : 0)
  const floorTop = (floor: number) => by + ROOF_H + (floors - 1 - floor) * FLOOR_H
  return {
    perFloor,
    floors,
    width: bw + side * 2,
    height: by + bh + GROUND_H,
    building: { x: bx, y: by, w: bw, h: bh },
    floorTop,
    corridorX,
    area: (slot) => {
      const floor = Math.floor(slot / perFloor)
      const left = perFloor === 2 && slot % 2 === 0
      return { x: left ? bx + WALL_W : corridorX + CORRIDOR_W, y: floorTop(floor), floor, side: left ? 'left' : 'right' }
    },
    entryX: (s) => (s === 'left' ? AREA_W + CORRIDOR_W / 2 : -CORRIDOR_W / 2),
    askX: (s) => (s === 'left' ? AREA_W + 14 : -14),
  }
}

// ---------------------------------------------------------------------------
// Céu da hora do dia, cidade ao fundo e a rua.
// ---------------------------------------------------------------------------

export type Sky = { top: string; bottom: string; far: string; near: string; lit: string; night: boolean; dusk: boolean }

export function skyAt(hour: number): Sky {
  if (hour >= 7 && hour < 17) return { top: '#6ec6ff', bottom: '#cdeeff', far: '#a8c4d8', near: '#86a4bc', lit: '#d6e9f5', night: false, dusk: false }
  if ((hour >= 17 && hour < 19) || (hour >= 5 && hour < 7))
    return { top: '#5b5fb5', bottom: '#ffb37a', far: '#8b6f92', near: '#5e4c6e', lit: '#ffd88a', night: false, dusk: true }
  return { top: '#0b1430', bottom: '#253463', far: '#1d2747', near: '#121a31', lit: '#ffd36b', night: true, dusk: false }
}

/** Gerador repetível: a cidade é sempre a mesma, só a luz muda. */
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

export function scenery(ctx: Ctx, l: Layout, sky: Sky, f: number): void {
  const ground = l.height - GROUND_H
  // Céu em faixas (degradê em pixel).
  const bands = 8
  for (let i = 0; i < bands; i++) {
    ctx.globalAlpha = 1
    rect(ctx, 0, (ground / bands) * i, l.width, ground / bands + 1, i < bands / 2 ? sky.top : sky.bottom)
    ctx.globalAlpha = 0.5
    rect(ctx, 0, (ground / bands) * i, l.width, ground / bands + 1, i < bands / 2 ? sky.bottom : sky.top)
  }
  ctx.globalAlpha = 1
  const rnd = seeded(7)
  if (sky.night) {
    for (let i = 0; i < l.width / 6; i++) {
      const x = rnd() * l.width
      const y = rnd() * ground * 0.6
      if ((i + (f >> 3)) % 9 !== 0) rect(ctx, x, y, 1, 1, '#e8eefc')
    }
    rect(ctx, l.width - 30, 10, 8, 8, '#f3f0d8')
    rect(ctx, l.width - 27, 10, 5, 6, sky.top)
  } else if (!sky.dusk) {
    rect(ctx, l.width - 32, 8, 10, 10, '#ffe27a')
    rect(ctx, l.width - 30, 6, 6, 14, '#ffe27a')
    rect(ctx, l.width - 34, 10, 14, 6, '#ffe27a')
  }
  // Duas camadas de prédios ao fundo, com janelas acesas à noite.
  for (const [layer, color, maxH] of [
    [11, sky.far, 0.55],
    [23, sky.near, 0.38],
  ] as const) {
    const r = seeded(layer)
    for (let x = -10; x < l.width; ) {
      const w = 18 + Math.floor(r() * 30)
      const h = Math.floor((0.15 + r() * maxH) * ground)
      rect(ctx, x, ground - h, w, h, color)
      for (let wy = ground - h + 4; wy < ground - 4; wy += 6) {
        for (let wx = x + 3; wx < x + w - 3; wx += 5) {
          const on = r() < (sky.night ? 0.35 : sky.dusk ? 0.18 : 0)
          if (on) rect(ctx, wx, wy, 2, 2, sky.lit)
        }
      }
      x += w + 2 + Math.floor(r() * 6)
    }
  }
  // Calçada, meio-fio, rua com faixa e árvores.
  rect(ctx, 0, ground, l.width, 8, '#b9bec6')
  rect(ctx, 0, ground + 8, l.width, 2, '#8b929c')
  rect(ctx, 0, ground + 10, l.width, GROUND_H - 10, '#3d424b')
  for (let x = 4; x < l.width; x += 22) rect(ctx, x, ground + 18, 10, 2, '#e7d17a')
  const trees = [12, l.width - 24]
  if (l.building.x > 20) trees.push(l.building.x - 14, l.building.x + l.building.w + 4)
  for (const tx of trees) {
    rect(ctx, tx + 4, ground - 10, 3, 12, '#6b4a2f')
    rect(ctx, tx, ground - 24, 12, 14, PAL.leafDark)
    rect(ctx, tx + 2, ground - 27, 8, 6, PAL.leaf)
  }
}

// ---------------------------------------------------------------------------
// O prédio: fachada, telhado, andares, corredor, divisórias.
// ---------------------------------------------------------------------------

/** Letreiro do telhado (o nome é escrito por cima, na resolução da tela). */
export function signBox(l: Layout): { x: number; y: number; w: number; h: number } {
  const w = Math.min(150, l.building.w - 80)
  return { x: l.building.x + (l.building.w - w) / 2, y: l.building.y + 2, w, h: 17 }
}

export function facade(ctx: Ctx, l: Layout, sky: Sky, f: number): void {
  const { x, y, w, h } = l.building
  rect(ctx, x, y + ROOF_H - 4, w, h - ROOF_H + 4, '#9ea6b1')
  rect(ctx, x, y + ROOF_H - 4, 2, h - ROOF_H + 4, '#c5ccd5')
  rect(ctx, x + w - 2, y + ROOF_H - 4, 2, h - ROOF_H + 4, '#7c8592')
  // Telhado: mureta, caixa d'água, letreiro e antena.
  rect(ctx, x - 3, y + ROOF_H - 6, w + 6, 4, '#c5ccd5')
  rect(ctx, x - 3, y + ROOF_H - 2, w + 6, 2, '#7c8592')
  rect(ctx, x + 10, y + 4, 18, 18, '#8a6f5a')
  rect(ctx, x + 10, y + 4, 18, 3, '#a38670')
  rect(ctx, x + 12, y + 22, 2, 2, '#5d4a3d')
  rect(ctx, x + 24, y + 22, 2, 2, '#5d4a3d')
  const { x: sx, w: sw } = signBox(l)
  rect(ctx, sx + 10, y + 18, 3, 6, '#555c66')
  rect(ctx, sx + sw - 13, y + 18, 3, 6, '#555c66')
  rect(ctx, sx, y + 2, sw, 17, '#20242c')
  rect(ctx, sx + 1, y + 3, sw - 2, 15, sky.night || sky.dusk ? '#2d3340' : '#2a2f39')
  rect(ctx, x + w - 22, y - 14, 2, 38, '#6b727c')
  rect(ctx, x + w - 26, y - 4, 10, 2, '#6b727c')
  if (f % 16 < 8) rect(ctx, x + w - 23, y - 17, 4, 3, '#ff4d4d')
}

/** O miolo de um andar: teto com luminárias, parede com janelas, chão e laje. Pinta a largura toda. */
export function storey(ctx: Ctx, l: Layout, floor: number, sky: Sky): void {
  const x = l.building.x + WALL_W
  const w = l.building.w - WALL_W * 2
  const y = l.floorTop(floor)
  rect(ctx, x, y, w, FLOOR_BACK, PAL.wall)
  rect(ctx, x, y + FLOOR_BACK - 16, w, 16, PAL.wallLow)
  rect(ctx, x, y + FLOOR_BACK - 3, w, 3, PAL.wallLine)
  // Teto e luminárias (acesas à noite).
  rect(ctx, x, y, w, 5, '#d5dbe2')
  rect(ctx, x, y + 5, w, 1, '#aab3bf')
  for (let lx = x + 20; lx < x + w - 10; lx += 48) {
    rect(ctx, lx, y + 5, 14, 2, '#eef2f6')
    if (sky.night || sky.dusk) {
      // Cone de luz abrindo para baixo, bem fraco.
      ctx.globalAlpha = 0.07
      for (let i = 0; i < 22; i++) rect(ctx, lx - i * 0.7, y + 7 + i, 14 + i * 1.4, 1, '#fff2b0')
      ctx.globalAlpha = 1
    }
  }
  // Chão de tacos nas áreas; o corredor ganha lajotas por cima (ver corridor).
  rect(ctx, x, y + FLOOR_BACK, w, FLOOR_FRONT - FLOOR_BACK, PAL.floor)
  for (let fy = FLOOR_BACK + 5; fy < FLOOR_FRONT; fy += 6) rect(ctx, x, y + fy, w, 1, PAL.floorLine)
  for (let fx = 6; fx < w; fx += 16) {
    for (let row = 0; row < 3; row++) rect(ctx, x + fx + (row % 2) * 8, y + FLOOR_BACK + row * 6, 1, 5, PAL.floorLine)
  }
  rect(ctx, x, y + FLOOR_FRONT, w, 3, PAL.floorEdge)
  // Laje entre os andares.
  rect(ctx, x, y + FLOOR_FRONT + 3, w, FLOOR_H - FLOOR_FRONT - 3, '#6f7782')
  rect(ctx, x, y + FLOOR_FRONT + 3, w, 1, '#89919c')
}

/** Corredor de um andar: lajotas, elevador (aberto quando alguém chega ou sai), bebedouro e planta. */
export function corridor(ctx: Ctx, l: Layout, floor: number, open: boolean): void {
  const x = l.corridorX
  const y = l.floorTop(floor)
  rect(ctx, x, y + 6, CORRIDOR_W, FLOOR_BACK - 6, '#5a6380')
  rect(ctx, x, y + FLOOR_BACK - 16, CORRIDOR_W, 16, '#525a75')
  rect(ctx, x, y + FLOOR_BACK, CORRIDOR_W, FLOOR_FRONT - FLOOR_BACK, '#b9bfc8')
  for (let fx = 0; fx < CORRIDOR_W; fx += 9) rect(ctx, x + fx, y + FLOOR_BACK, 1, FLOOR_FRONT - FLOOR_BACK, '#a3aab4')
  for (let fy = FLOOR_BACK + 6; fy < FLOOR_FRONT; fy += 6) rect(ctx, x, y + fy, CORRIDOR_W, 1, '#a3aab4')
  // Elevador no meio.
  const ex = x + CORRIDOR_W / 2 - 13
  const ey = y + FLOOR_BACK - 44
  rect(ctx, ex - 3, ey - 3, 32, 47, '#8e98a4')
  rect(ctx, ex, ey, 26, 44, '#2b2f38')
  const gap = open ? 9 : 0
  rect(ctx, ex + 1, ey + 1, 12 - gap, 43, '#b6c0cb')
  rect(ctx, ex + 13 + gap, ey + 1, 12 - gap, 43, '#a7b1bc')
  rect(ctx, ex + 12, ey + 1, 2, 43, open ? '#2b2f38' : '#8e98a4')
  rect(ctx, ex + 8, ey - 9, 10, 5, PAL.ink)
  rect(ctx, ex + 29, ey + 20, 3, 5, '#5a636e')
  rect(ctx, ex + 30, ey + 21, 1, 1, open ? PAL.amber : PAL.led)
  // Bebedouro e planta.
  rect(ctx, x + 6, y + FLOOR_BACK - 22, 9, 22, '#e3e8ee')
  rect(ctx, x + 6, y + FLOOR_BACK - 32, 9, 10, '#7fc4f0')
  rect(ctx, x + 7, y + FLOOR_BACK - 31, 2, 8, '#bfe3fb')
  rect(ctx, x + CORRIDOR_W - 14, y + FLOOR_BACK - 8, 9, 8, PAL.pot)
  rect(ctx, x + CORRIDOR_W - 16, y + FLOOR_BACK - 22, 5, 14, PAL.leafDark)
  rect(ctx, x + CORRIDOR_W - 11, y + FLOOR_BACK - 26, 5, 18, PAL.leaf)
  rect(ctx, x + CORRIDOR_W - 7, y + FLOOR_BACK - 18, 4, 10, PAL.leafDark)
}

/** Divisória de cubículo entre a área e o corredor (meia altura; a frente do chão fica livre para passar). */
export function partition(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x, y + 46, 4, FLOOR_BACK - 46 + 8, '#7f8aa3')
  rect(ctx, x, y + 44, 4, 3, '#c3cad6')
  rect(ctx, x + 1, y + 50, 2, FLOOR_BACK - 54, '#95a0b8')
  rect(ctx, x, y + FLOOR_BACK + 8, 4, 2, '#5f6880')
}

export type Occupancy = { active: Set<OfficeActivity>; chairs: Set<'web' | 'edit'>; sofa: boolean }

/** Os móveis de uma área, com o que está em uso aceso. */
export function areaBack(ctx: Ctx, ox: number, oy: number, occ: Occupancy, sky: Sky, f: number): void {
  const on = (a: OfficeActivity) => occ.active.has(a)
  // Planta alta no canto esquerdo.
  rect(ctx, ox + 9, oy + FLOOR_BACK - 9, 12, 9, PAL.pot)
  rect(ctx, ox + 9, oy + FLOOR_BACK - 9, 12, 1, PAL.potDark)
  rect(ctx, ox + 8, oy + FLOOR_BACK - 26, 5, 17, PAL.leafDark)
  rect(ctx, ox + 13, oy + FLOOR_BACK - 34, 5, 25, PAL.leaf)
  rect(ctx, ox + 17, oy + FLOOR_BACK - 24, 5, 15, PAL.leafDark)
  picture(ctx, ox + 32, oy + 14)
  windowPane(ctx, ox + 60, oy + 14, 24, sky)
  windowPane(ctx, ox + 100, oy + 14, 24, sky)
  tv(ctx, ox, oy, on('background'), f)
  whiteboard(ctx, ox, oy, on('plan'), f)
  cabinet(ctx, ox, oy, on('files'), f)
  pcDesk(ctx, ox, oy, on('web'), f)
  workbench(ctx, ox, oy, on('edit'), f)
  rack(ctx, ox, oy, on('command'), f)
  coffee(ctx, ox, oy, on('think'), f)
  chair(ctx, ox + SPOTS.web.x, oy + SPOTS.web.y - 2, occ.chairs.has('web') ? 'seat' : 'all')
  chair(ctx, ox + SPOTS.edit.x, oy + SPOTS.edit.y - 2, occ.chairs.has('edit') ? 'seat' : 'all')
  sofa(ctx, ox, oy, occ.sofa ? 'back' : 'all')
}

/** O que fica na frente de quem está sentado: encostos das cadeiras e a frente do sofá. */
export function areaFront(ctx: Ctx, ox: number, oy: number, occ: Occupancy): void {
  if (occ.chairs.has('web')) chair(ctx, ox + SPOTS.web.x, oy + SPOTS.web.y - 2, 'back')
  if (occ.chairs.has('edit')) chair(ctx, ox + SPOTS.edit.x, oy + SPOTS.edit.y - 2, 'back')
  if (occ.sofa) sofa(ctx, ox, oy, 'front')
}

/** Área sem conversa: caixas de mudança, uma janela e a luz apagada. */
export function freeArea(ctx: Ctx, ox: number, oy: number, sky: Sky): void {
  windowPane(ctx, ox + 100, oy + 14, 24, sky)
  for (const [bx, bw, bh] of [
    [70, 22, 16],
    [94, 18, 12],
    [78, 16, 10],
  ]) {
    const by = bx === 78 ? FLOOR_BACK - 26 : FLOOR_BACK - bh
    rect(ctx, ox + bx, oy + by, bw, bh, '#c49a6c')
    rect(ctx, ox + bx, oy + by, bw, 2, '#d8b48a')
    rect(ctx, ox + bx + bw / 2 - 1, oy + by, 2, bh, '#a57c52')
  }
  ctx.globalAlpha = 0.45
  rect(ctx, ox, oy + 6, AREA_W, FLOOR_FRONT - 6, '#0a0c14')
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// Móveis. `on`: alguém está trabalhando nele; `f`: quadro da animação (~12 por segundo).
// ---------------------------------------------------------------------------

function picture(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x, y, 16, 12, PAL.woodDeep)
  rect(ctx, x + 1, y + 1, 14, 10, '#7fb7c9')
  rect(ctx, x + 1, y + 7, 14, 4, '#5c9a5e')
  rect(ctx, x + 9, y + 3, 3, 3, '#f6d365')
}

function windowPane(ctx: Ctx, x: number, y: number, w: number, sky: Sky): void {
  rect(ctx, x - 2, y - 2, w + 4, 26, PAL.rim)
  rect(ctx, x, y, w, 11, sky.top)
  rect(ctx, x, y + 11, w, 11, sky.bottom)
  rect(ctx, x + 2, y + 2, 3, 18, sky.night ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.45)')
  rect(ctx, x + Math.floor(w / 2), y, 1, 22, PAL.rim)
  rect(ctx, x - 3, y + 22, w + 6, 2, PAL.rimDark)
}

function cabinet(ctx: Ctx, ox: number, oy: number, on: boolean, f: number): void {
  const x = ox + 30
  const y = oy + FLOOR_BACK - 38
  rect(ctx, x, y, 20, 38, PAL.metalDark)
  rect(ctx, x, y, 20, 2, PAL.metalLight)
  for (let i = 0; i < 3; i++) {
    const open = on && i === 1 && f % 12 < 8
    const dx = open ? -1 : 0
    rect(ctx, x + 2 + dx, y + 4 + i * 11, 16 + (open ? 2 : 0), 9, open ? PAL.metalLight : PAL.metal)
    rect(ctx, x + 7 + dx, y + 7 + i * 11, 6, 2, PAL.metalDeep)
    if (open) {
      // Papéis aparecendo na gaveta aberta.
      rect(ctx, x + 3, y + 2 + i * 11, 3, 3, PAL.white)
      rect(ctx, x + 7, y + 1 + i * 11, 3, 4, '#fff6d8')
    }
  }
  // Plantinha em cima.
  rect(ctx, x + 6, y - 6, 8, 6, PAL.pot)
  rect(ctx, x + 6, y - 6, 8, 1, PAL.potDark)
  rect(ctx, x + 4, y - 13, 4, 7, PAL.leaf)
  rect(ctx, x + 9, y - 16, 4, 10, PAL.leafDark)
  rect(ctx, x + 12, y - 12, 4, 6, PAL.leaf)
}

function desk(ctx: Ctx, x: number, y: number, w: number): void {
  rect(ctx, x, y, w, 4, PAL.wood)
  rect(ctx, x, y + 3, w, 1, PAL.woodDark)
  rect(ctx, x + 1, y + 4, 10, 10, PAL.woodDark)
  rect(ctx, x + 3, y + 7, 6, 1, PAL.woodDeep)
  rect(ctx, x + 5, y + 10, 2, 1, PAL.brass)
  rect(ctx, x + w - 3, y + 4, 2, 10, PAL.woodDeep)
}

function chair(ctx: Ctx, cx: number, seatY: number, part: 'all' | 'seat' | 'back'): void {
  if (part !== 'back') {
    rect(ctx, cx - 1, seatY, 2, 5, PAL.ink)
    rect(ctx, cx - 4, seatY + 4, 8, 1, PAL.ink)
    rect(ctx, cx - 6, seatY - 3, 12, 3, PAL.chair)
  }
  if (part !== 'seat') {
    // Encosto: na frente de quem está sentado de costas para nós, cobrindo só da cintura para baixo.
    rect(ctx, cx - 6, seatY - 8, 12, 9, PAL.chair)
    rect(ctx, cx - 5, seatY - 7, 10, 1, PAL.chairLight)
  }
}

function pcDesk(ctx: Ctx, ox: number, oy: number, on: boolean, f: number): void {
  const x = ox + 54
  const y = oy + FLOOR_BACK - 14
  desk(ctx, x, y, 36)
  // Monitor e o gabinete do mini PC.
  rect(ctx, x + 8, y - 15, 18, 13, PAL.ink)
  rect(ctx, x + 9, y - 14, 16, 10, on ? PAL.screen : PAL.screenOff)
  if (on) {
    // Um globo girando na tela: está na web.
    const g = f % 4
    rect(ctx, x + 13, y - 13, 8, 8, PAL.screenLight)
    rect(ctx, x + 14 + g, y - 13, 1, 8, PAL.screen)
    rect(ctx, x + 13, y - 10, 8, 1, PAL.screen)
  }
  rect(ctx, x + 16, y - 2, 2, 2, PAL.ink)
  rect(ctx, x + 12, y - 1, 10, 1, PAL.ink)
  rect(ctx, x + 28, y - 10, 6, 10, PAL.metalDeep)
  rect(ctx, x + 29, y - 8, 1, 1, on ? PAL.led : PAL.metal)
}

function workbench(ctx: Ctx, ox: number, oy: number, on: boolean, f: number): void {
  const x = ox + 94
  const y = oy + FLOOR_BACK - 14
  desk(ctx, x, y, 36)
  // Notebook aberto e papéis.
  rect(ctx, x + 10, y - 9, 14, 9, PAL.ink)
  rect(ctx, x + 11, y - 8, 12, 7, on ? PAL.screen : PAL.screenOff)
  if (on) for (let i = 0; i < 3; i++) rect(ctx, x + 12, y - 7 + i * 2, (f + i * 3) % 9 + 2, 1, PAL.screenLight)
  rect(ctx, x + 8, y - 1, 18, 1, PAL.metalDeep)
  rect(ctx, x + 26, y - 3, 7, 3, PAL.white)
  rect(ctx, x + 27, y - 4, 6, 1, '#fff6d8')
  // Caneca de lápis.
  rect(ctx, x + 2, y - 5, 4, 5, PAL.red)
  rect(ctx, x + 3, y - 8, 1, 3, PAL.brass)
}

function whiteboard(ctx: Ctx, ox: number, oy: number, on: boolean, f: number): void {
  const x = ox + 134
  const y = oy + 22
  rect(ctx, x, y, 32, 24, PAL.boardFrame)
  rect(ctx, x + 1, y + 1, 30, 21, PAL.board)
  rect(ctx, x + 2, y + 23, 28, 2, PAL.metalDark)
  // Rabiscos: um plano que vai crescendo enquanto alguém está no quadro.
  const lines = on ? 1 + (f >> 2) % 4 : 2
  for (let i = 0; i < lines; i++) rect(ctx, x + 4, y + 4 + i * 4, [18, 12, 22, 9][i], 1, i === 3 ? PAL.red : PAL.blue)
  if (on) rect(ctx, x + 24, y + 4, 3, 3, PAL.led)
}

function rack(ctx: Ctx, ox: number, oy: number, on: boolean, f: number): void {
  const x = ox + 170
  const y = oy + FLOOR_BACK - 46
  rect(ctx, x, y, 16, 46, PAL.rack)
  rect(ctx, x, y, 16, 2, PAL.metalDark)
  // Telinha do terminal: o cursor pisca rodando um comando.
  rect(ctx, x + 2, y + 4, 12, 8, PAL.ink)
  if (on) {
    rect(ctx, x + 3, y + 6, 2, 1, PAL.led)
    rect(ctx, x + 4, y + 7, 1, 1, PAL.led)
    rect(ctx, x + 3, y + 8, 2, 1, PAL.led)
    if (f % 6 < 3) rect(ctx, x + 7, y + 9, 3, 1, PAL.led)
  }
  for (let i = 0; i < 5; i++) {
    rect(ctx, x + 2, y + 15 + i * 6, 12, 4, PAL.rackFront)
    const lit = on ? (f + i * 2) % 5 < 3 : i === 0
    rect(ctx, x + 11, y + 16 + i * 6, 1, 1, lit ? PAL.led : PAL.metalDeep)
    rect(ctx, x + 9, y + 16 + i * 6, 1, 1, on && (f + i) % 7 === 0 ? PAL.ledRed : PAL.metalDeep)
  }
}

function coffee(ctx: Ctx, ox: number, oy: number, on: boolean, f: number): void {
  const x = ox + 189
  const y = oy + FLOOR_BACK - 18
  // Carrinho com a cafeteira.
  rect(ctx, x, y, 16, 3, PAL.wood)
  rect(ctx, x + 1, y + 3, 14, 15, PAL.woodDark)
  rect(ctx, x + 3, y + 7, 10, 1, PAL.woodDeep)
  rect(ctx, x + 3, y - 14, 10, 14, '#3a3f47')
  rect(ctx, x + 4, y - 12, 8, 3, on ? PAL.ledRed : PAL.metalDeep)
  rect(ctx, x + 6, y - 5, 4, 4, PAL.white)
  if (on) {
    // Vapor subindo da xícara.
    const s = f % 6
    rect(ctx, x + 7, y - 8 - s, 1, 2, PAL.steam)
    rect(ctx, x + 8, y - 11 - ((s + 3) % 6), 1, 2, PAL.steam)
  }
}

function sofa(ctx: Ctx, ox: number, oy: number, part: 'all' | 'back' | 'front'): void {
  const x = ox + 210
  const y = oy + FLOOR_BACK - 6
  if (part !== 'front') {
    rect(ctx, x + 3, y - 8, 34, 10, PAL.sofaDark)
    rect(ctx, x + 4, y - 7, 32, 2, PAL.sofa)
    rect(ctx, x + 3, y + 2, 34, 6, PAL.sofa)
    rect(ctx, x + 4, y + 2, 32, 1, PAL.sofaLight)
  }
  if (part !== 'back') {
    rect(ctx, x, y - 4, 4, 14, PAL.sofaDark)
    rect(ctx, x + 36, y - 4, 4, 14, PAL.sofaDark)
    rect(ctx, x + 3, y + 8, 34, 4, PAL.sofaDark)
  }
}

function tv(ctx: Ctx, ox: number, oy: number, on: boolean, f: number): void {
  const x = ox + 216
  const y = oy + 26
  rect(ctx, x, y, 28, 18, PAL.ink)
  rect(ctx, x + 1, y + 1, 26, 15, on ? PAL.screen : PAL.screenOff)
  if (on) {
    // Barra de progresso: algo rodando em segundo plano.
    rect(ctx, x + 4, y + 11, 20, 2, PAL.screenLight)
    rect(ctx, x + 4, y + 11, 2 + (f % 18), 2, PAL.white)
  }
  rect(ctx, x + 12, y + 17, 4, 2, PAL.ink)
}

