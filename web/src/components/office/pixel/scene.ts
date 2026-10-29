import type { OfficeActivity, OfficeTodos } from '@/lib/types'
import { seeded, type Sky } from './sky'
import { PAL, rect, type Ctx, type Facing } from './sprites'

/**
 * O escritório em corte, como nos jogos de prédio em pixel: cada andar tem áreas (uma por conversa,
 * separadas por divisórias de cubículo) e o corredor com o elevador; o prédio fica numa cidade, com
 * o céu da hora do dia. Medidas em pixels do mundo.
 *
 * O que não muda de um quadro para outro (cidade, prédio, móveis apagados) vai para um fundo pronto,
 * refeito só quando a luz do dia ou as áreas mudam; a cada quadro entra só o que está vivo.
 */
export const AREA_W = 256
export const FLOOR_H = 112
export const CORRIDOR_W = 72
/** Paredes de fora do prédio. */
const WALL_W = 10
/** Telhado (mureta, letreiro, caixa d'água, antena) e céu acima dele. */
export const ROOF_H = 30
const SKY_H = 36
/**
 * Calçada e rua embaixo do prédio, na mesma escala dos claudinhos: quem anda na calçada tem a
 * altura de um deles, e um carro tem umas duas vezes e meia isso de comprimento.
 */
export const GROUND_H = 56
/** A partir do topo da calçada: altura dela, e onde as rodas de cada mão da rua tocam o asfalto. */
export const WALK_H = 10
export const LANE_FAR = 32
export const LANE_NEAR = 54
/** Linha onde a parede encontra o chão; o chão vai daqui até FLOOR_FRONT. */
export const FLOOR_BACK = 84
export const FLOOR_FRONT = 102
/** Faixa da frente do chão por onde se anda (pelo corredor também). */
export const LANE_Y = 100

type Seat = 'chair' | 'sofa'
/** `chair`: qual cadeira ele ocupa (o encosto passa a ser desenhado na frente); `slump`: caído, dormindo. */
export type Spot = { x: number; y: number; facing: Facing; seated?: Seat; arms?: boolean; chair?: 'web' | 'edit'; slump?: boolean }

/** Estação de cada atividade: compactar a conversa é no gaveteiro, como ler arquivos. */
export type Station = Exclude<OfficeActivity, 'ask' | 'compact' | 'background'>
export const stationOf = (a: OfficeActivity): Station | 'ask' =>
  a === 'compact' ? 'files' : a === 'background' ? 'idle' : a

/** Onde cada claudinho fica (os pés) em cada estação da área. `ask` é no corredor (ver layout). */
export const SPOTS: Record<Station, Spot> = {
  files: { x: 39, y: 94, facing: 'back' },
  web: { x: 71, y: 95, facing: 'back', seated: 'chair', chair: 'web', arms: true },
  edit: { x: 111, y: 95, facing: 'back', seated: 'chair', chair: 'edit', arms: true },
  plan: { x: 149, y: 92, facing: 'back', arms: true },
  command: { x: 177, y: 95, facing: 'back', arms: true },
  think: { x: 197, y: 96, facing: 'back' },
  idle: { x: 222, y: 88, facing: 'front', seated: 'sofa' },
}

/**
 * O n-ésimo na mesma estação: ao lado (e, sem cadeira sobrando, de pé atrás de quem está sentado).
 * Quem pede você sai da área e espera no corredor (`askX`), virado para a tela.
 */
export function spotFor(activity: OfficeActivity, n: number, askX: number): Spot {
  const station = stationOf(activity)
  if (station === 'ask') return { x: askX + (askX > AREA_W / 2 ? 1 : -1) * n * 16, y: 97, facing: 'front' }
  const s = SPOTS[station]
  if (n === 0) return s
  if (s.seated === 'sofa' && n === 1) return { ...s, x: s.x + 18 }
  const side = n % 2 === 1 ? 1 : -1
  const dx = side * Math.ceil(n / 2) * 18
  return { x: s.x + dx, y: Math.min(LANE_Y, s.y + 3), facing: s.facing, arms: s.arms && !s.seated }
}

/**
 * Os jeitos de descansar: o sofá (que cabe dois), um cochilo na cadeira da bancada, a janela, a
 * planta para regar, a estante, o café, o quadro, uma espreguiçada e o dois a dois da conversa.
 * O bebedouro fica no corredor, e por isso o x dele vem do andar (ver world.ts).
 */
export const REST_SPOTS = {
  sofa: { x: 222, y: 88, facing: 'front', seated: 'sofa' },
  sofaEnd: { x: 240, y: 88, facing: 'front', seated: 'sofa' },
  nap: { x: 111, y: 95, facing: 'back', seated: 'chair', chair: 'edit', slump: true },
  window: { x: 112, y: 89, facing: 'back' },
  plant: { x: 27, y: 96, facing: 'left' },
  shelf: { x: 40, y: 95, facing: 'back' },
  board: { x: 149, y: 93, facing: 'back', arms: true },
  coffee: { x: 197, y: 96, facing: 'back' },
  stretch: { x: 232, y: 97, facing: 'front', arms: true },
  chatLeft: { x: 178, y: 99, facing: 'right' },
  chatRight: { x: 197, y: 99, facing: 'left' },
} satisfies Record<string, Spot>

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
  /** Elevador, lugar de espera e bebedouro no corredor, em coordenadas da área (fora dela). */
  entryX: (side: Area['side']) => number
  askX: (side: Area['side']) => number
  coolerX: (side: Area['side']) => number
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
    coolerX: (s) => (s === 'left' ? AREA_W + 11 : -CORRIDOR_W + 11),
  }
}

/** Letreiro do telhado (o nome é escrito por cima, na resolução da tela). */
export function signBox(l: Layout): { x: number; y: number; w: number; h: number } {
  const w = Math.min(150, l.building.w - 80)
  return { x: l.building.x + (l.building.w - w) / 2, y: l.building.y + 2, w, h: 17 }
}

/** Onde o caminhão de entregas para: na frente do prédio. */
export const deliveryX = (l: Layout) => l.building.x + l.building.w / 2

const groundOf = (l: Layout) => l.height - GROUND_H

// ---------------------------------------------------------------------------
// Cidade: prédios ao fundo, rua, árvores, postes e os enfeites da época. Vai para o fundo pronto.
// ---------------------------------------------------------------------------

export function city(ctx: Ctx, l: Layout, sky: Sky): void {
  const ground = groundOf(l)
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
          if (r() < 0.35 * sky.dark) rect(ctx, wx, wy, 2, 2, sky.lit)
        }
      }
      x += w + 2 + Math.floor(r() * 6)
    }
  }
  // Calçada (com as juntas das placas), meio-fio e o asfalto das duas mãos, com a faixa no meio.
  rect(ctx, 0, ground, l.width, WALK_H, sky.rain ? '#a4a9b1' : '#b9bec6')
  for (let x = 0; x < l.width; x += 26) rect(ctx, x, ground + 1, 1, WALK_H - 2, sky.rain ? '#989da5' : '#aab0b8')
  rect(ctx, 0, ground + WALK_H, l.width, 3, '#8b929c')
  rect(ctx, 0, ground + WALK_H + 3, l.width, GROUND_H - WALK_H - 3, sky.rain ? '#343840' : '#3d424b')
  for (let x = 6; x < l.width; x += 34) rect(ctx, x, ground + 42, 16, 2, '#e7d17a')
  const outside = (x: number) => x > 2 && x < l.width - 8 && (x < l.building.x - 6 || x > l.building.x + l.building.w + 2)
  // Postes: acesos à noite, com o cone de luz na calçada.
  for (const px of [l.building.x - 40, l.building.x + l.building.w + 34, 34, l.width - 42].filter(outside)) {
    rect(ctx, px, ground - 44, 2, 46, '#4a505a')
    rect(ctx, px - 1, ground - 46, 9, 3, '#4a505a')
    rect(ctx, px + 1, ground - 43, 5, 2, sky.dark > 0.4 ? '#fff2b0' : '#8a9099')
    if (sky.dark > 0.4) {
      ctx.globalAlpha = 0.12 * sky.dark
      for (let i = 0; i < 44; i++) rect(ctx, px + 3 - i * 0.6, ground - 41 + i, 2 + i * 1.2, 1, '#fff2b0')
      ctx.globalAlpha = 1
    }
  }
  const trees = [14, l.width - 36]
  if (l.building.x > 30) trees.push(l.building.x - 26, l.building.x + l.building.w + 8)
  for (const tx of trees) {
    rect(ctx, tx + 8, ground - 22, 5, 24, '#6b4a2f')
    rect(ctx, tx + 7, ground - 14, 2, 4, '#5a3c26')
    rect(ctx, tx, ground - 40, 21, 20, PAL.leafDark)
    rect(ctx, tx + 3, ground - 46, 15, 10, PAL.leaf)
    rect(ctx, tx + 2, ground - 24, 17, 5, PAL.leafDark)
  }
  if (sky.season === 'halloween') {
    // Abóboras na calçada, de cara acesa à noite.
    for (const tx of trees) {
      const x = tx + 22
      rect(ctx, x, ground + 2, 10, 7, '#ef7d1a')
      rect(ctx, x + 1, ground + 1, 8, 1, '#ef7d1a')
      rect(ctx, x + 3, ground - 1, 2, 2, PAL.leafDark)
      if (sky.dark > 0.4) {
        rect(ctx, x + 2, ground + 4, 2, 2, PAL.gold)
        rect(ctx, x + 6, ground + 4, 2, 2, PAL.gold)
        rect(ctx, x + 3, ground + 7, 4, 1, PAL.gold)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// O prédio: fachada, telhado, andares, corredor, divisórias e os móveis apagados de cada área.
// ---------------------------------------------------------------------------

/** O prédio inteiro como fica parado: `occupied` diz quais áreas têm conversa (as outras estão livres). */
export function building(ctx: Ctx, l: Layout, sky: Sky, occupied: Set<number>): void {
  facade(ctx, l, sky)
  for (let floor = 0; floor < l.floors; floor++) {
    storey(ctx, l, floor, sky)
    corridor(ctx, l, floor, false)
  }
  for (let s = 0; s < l.floors * l.perFloor; s++) {
    const area = l.area(s)
    if (occupied.has(s)) areaBack(ctx, area.x, area.y, sky)
    else freeArea(ctx, area.x, area.y, sky)
    partition(ctx, area.side === 'left' ? area.x + AREA_W - 2 : area.x - 2, area.y)
  }
}

function facade(ctx: Ctx, l: Layout, sky: Sky): void {
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
  rect(ctx, sx + 1, y + 3, sw - 2, 15, sky.dark > 0.2 ? '#2d3340' : '#2a2f39')
  rect(ctx, x + w - 22, y - 14, 2, 38, '#6b727c')
  rect(ctx, x + w - 26, y - 4, 10, 2, '#6b727c')
  if (sky.season === 'junina') {
    // Bandeirinhas de um lado a outro da mureta, em duas fileiras caídas.
    const colors = ['#e34948', '#f6c945', '#2a78d6', '#1baf7a', '#e87ba4']
    for (let row = 0; row < 2; row++) {
      for (let i = 0, fx = x + 2; fx < x + w - 4; fx += 6, i++) {
        const p = (fx - x) / w
        const fy = y + ROOF_H - 4 + row * 7 + Math.sin(Math.PI * p) * 5
        rect(ctx, fx, fy, 1, 1, '#555c66')
        rect(ctx, fx + 1, fy, 3, 2, colors[(i + row * 2) % colors.length])
        rect(ctx, fx + 2, fy + 2, 1, 1, colors[(i + row * 2) % colors.length])
      }
    }
  }
}

/** O miolo de um andar: teto com luminárias, parede com janelas, chão e laje. Pinta a largura toda. */
function storey(ctx: Ctx, l: Layout, floor: number, sky: Sky): void {
  const x = l.building.x + WALL_W
  const w = l.building.w - WALL_W * 2
  const y = l.floorTop(floor)
  rect(ctx, x, y, w, FLOOR_BACK, PAL.wall)
  rect(ctx, x, y + FLOOR_BACK - 16, w, 16, PAL.wallLow)
  rect(ctx, x, y + FLOOR_BACK - 3, w, 3, PAL.wallLine)
  // Teto e luminárias (acesas no escuro).
  rect(ctx, x, y, w, 5, '#d5dbe2')
  rect(ctx, x, y + 5, w, 1, '#aab3bf')
  for (let lx = x + 20; lx < x + w - 10; lx += 48) {
    rect(ctx, lx, y + 5, 14, 2, '#eef2f6')
    if (sky.dark > 0.2) {
      // Cone de luz abrindo para baixo, bem fraco.
      ctx.globalAlpha = 0.08 * sky.dark
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

/** Corredor de um andar: lajotas, elevador, bebedouro e planta. */
function corridor(ctx: Ctx, l: Layout, floor: number, open: boolean): void {
  const x = l.corridorX
  const y = l.floorTop(floor)
  rect(ctx, x, y + 6, CORRIDOR_W, FLOOR_BACK - 6, '#5a6380')
  rect(ctx, x, y + FLOOR_BACK - 16, CORRIDOR_W, 16, '#525a75')
  rect(ctx, x, y + FLOOR_BACK, CORRIDOR_W, FLOOR_FRONT - FLOOR_BACK, '#b9bfc8')
  for (let fx = 0; fx < CORRIDOR_W; fx += 9) rect(ctx, x + fx, y + FLOOR_BACK, 1, FLOOR_FRONT - FLOOR_BACK, '#a3aab4')
  for (let fy = FLOOR_BACK + 6; fy < FLOOR_FRONT; fy += 6) rect(ctx, x, y + fy, CORRIDOR_W, 1, '#a3aab4')
  elevator(ctx, l, floor, open)
  // Bebedouro e planta.
  rect(ctx, x + 6, y + FLOOR_BACK - 22, 9, 22, '#e3e8ee')
  rect(ctx, x + 6, y + FLOOR_BACK - 32, 9, 10, '#7fc4f0')
  rect(ctx, x + 7, y + FLOOR_BACK - 31, 2, 8, '#bfe3fb')
  rect(ctx, x + CORRIDOR_W - 14, y + FLOOR_BACK - 8, 9, 8, PAL.pot)
  rect(ctx, x + CORRIDOR_W - 16, y + FLOOR_BACK - 22, 5, 14, PAL.leafDark)
  rect(ctx, x + CORRIDOR_W - 11, y + FLOOR_BACK - 26, 5, 18, PAL.leaf)
  rect(ctx, x + CORRIDOR_W - 7, y + FLOOR_BACK - 18, 4, 10, PAL.leafDark)
}

/** Portas do elevador, abertas quando alguém chega ou sai no andar. */
function elevator(ctx: Ctx, l: Layout, floor: number, open: boolean): void {
  const ex = l.corridorX + CORRIDOR_W / 2 - 13
  const ey = l.floorTop(floor) + FLOOR_BACK - 44
  rect(ctx, ex - 3, ey - 3, 32, 47, '#8e98a4')
  rect(ctx, ex, ey, 26, 44, '#2b2f38')
  const gap = open ? 9 : 0
  rect(ctx, ex + 1, ey + 1, 12 - gap, 43, '#b6c0cb')
  rect(ctx, ex + 13 + gap, ey + 1, 12 - gap, 43, '#a7b1bc')
  rect(ctx, ex + 12, ey + 1, 2, 43, open ? '#2b2f38' : '#8e98a4')
  rect(ctx, ex + 8, ey - 9, 10, 5, PAL.ink)
  rect(ctx, ex + 29, ey + 20, 3, 5, '#5a636e')
  rect(ctx, ex + 30, ey + 21, 1, 1, open ? PAL.amber : PAL.led)
}

/** Divisória de cubículo entre a área e o corredor (meia altura; a frente do chão fica livre para passar). */
function partition(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x, y + 46, 4, FLOOR_BACK - 46 + 8, '#7f8aa3')
  rect(ctx, x, y + 44, 4, 3, '#c3cad6')
  rect(ctx, x + 1, y + 50, 2, FLOOR_BACK - 54, '#95a0b8')
  rect(ctx, x, y + FLOOR_BACK + 8, 4, 2, '#5f6880')
}

/** Os móveis de uma área, todos apagados (quem está em uso acende por cima, em areaLive). */
function areaBack(ctx: Ctx, ox: number, oy: number, sky: Sky): void {
  // Planta alta no canto esquerdo.
  rect(ctx, ox + 9, oy + FLOOR_BACK - 9, 12, 9, PAL.pot)
  rect(ctx, ox + 9, oy + FLOOR_BACK - 9, 12, 1, PAL.potDark)
  rect(ctx, ox + 8, oy + FLOOR_BACK - 26, 5, 17, PAL.leafDark)
  rect(ctx, ox + 13, oy + FLOOR_BACK - 34, 5, 25, PAL.leaf)
  rect(ctx, ox + 17, oy + FLOOR_BACK - 24, 5, 15, PAL.leafDark)
  shelf(ctx, ox + 28, oy + 10)
  windowPane(ctx, ox + 60, oy + 14, 24, sky)
  windowPane(ctx, ox + 100, oy + 14, 24, sky)
  tv(ctx, ox, oy, false, 0)
  whiteboard(ctx, ox, oy, false, 0)
  cabinet(ctx, ox, oy, false, 0)
  pcDesk(ctx, ox, oy, false, 0)
  workbench(ctx, ox, oy, false, 0)
  rack(ctx, ox, oy, false, 0)
  testLight(ctx, ox, oy, undefined)
  coffee(ctx, ox, oy, false, 0)
  chair(ctx, ox + SPOTS.web.x, oy + SPOTS.web.y - 2, 'all')
  chair(ctx, ox + SPOTS.edit.x, oy + SPOTS.edit.y - 2, 'all')
  sofa(ctx, ox, oy, 'all')
}

/** Área sem conversa: caixas de mudança, uma janela e a luz apagada. */
function freeArea(ctx: Ctx, ox: number, oy: number, sky: Sky): void {
  windowPane(ctx, ox + 100, oy + 14, 24, sky)
  for (const [bx, bw, bh] of [
    [70, 22, 16],
    [94, 18, 12],
    [78, 16, 10],
  ]) {
    const by = bx === 78 ? FLOOR_BACK - 26 : FLOOR_BACK - bh
    rect(ctx, ox + bx, oy + by, bw, bh, PAL.cardboard)
    rect(ctx, ox + bx, oy + by, bw, 2, PAL.cardboardLight)
    rect(ctx, ox + bx + bw / 2 - 1, oy + by, 2, bh, PAL.cardboardDark)
  }
  ctx.globalAlpha = 0.45
  rect(ctx, ox, oy + 6, AREA_W, FLOOR_FRONT - 6, '#0a0c14')
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// O que muda a cada quadro.
// ---------------------------------------------------------------------------

/** Antena piscando, elevadores abertos e, no Natal, as luzinhas da mureta. */
export function buildingLive(ctx: Ctx, l: Layout, sky: Sky, f: number, openFloors: Set<number>): void {
  const { x, y, w } = l.building
  if (f % 16 < 8) rect(ctx, x + w - 23, y - 17, 4, 3, '#ff4d4d')
  for (const floor of openFloors) elevator(ctx, l, floor, true)
  if (sky.season === 'natal') {
    const colors = ['#e34948', '#f6c945', '#3ddc84', '#63c7ff']
    for (let i = 0, lx = x - 1; lx < x + w + 2; lx += 5, i++) {
      rect(ctx, lx, y + ROOF_H - 7, 2, 2, (i + (f >> 3)) % 3 === 0 ? '#555c66' : colors[i % colors.length])
    }
  }
}

export type Occupancy = { active: Set<OfficeActivity>; chairs: Set<'web' | 'edit'>; sofa: boolean }

/** O que a área mostra além dos móveis: tarefas no quadro, papéis na bancada, testes e a luz da sala. */
export type AreaLive = {
  occ: Occupancy
  todos?: OfficeTodos
  /** Folhas na pilha da bancada (uma por arquivo editado). */
  papers: number
  /** Resultado do último teste, enquanto o semáforo fica aceso. */
  test?: boolean
  /** Comando com erro: o rack pisca vermelho. */
  alarm: boolean
  /** Âmbar pulsando (pede você), luz apagada (descansando à noite) ou fora do expediente (limite do plano). */
  mood: 'ask' | 'dark' | 'off' | null
}

export function areaLive(ctx: Ctx, ox: number, oy: number, live: AreaLive, f: number): void {
  const on = (a: OfficeActivity) => live.occ.active.has(a)
  if (on('background')) tv(ctx, ox, oy, true, f)
  if (on('plan') || live.todos) whiteboard(ctx, ox, oy, on('plan'), f, live.todos)
  if (on('files') || on('compact')) cabinet(ctx, ox, oy, true, on('compact') ? f * 2 : f)
  if (on('web')) pcDesk(ctx, ox, oy, true, f)
  if (on('edit')) workbench(ctx, ox, oy, true, f)
  if (live.papers > 0) papers(ctx, ox, oy, live.papers)
  if (on('command') || live.alarm) rack(ctx, ox, oy, true, f, live.alarm)
  if (live.test !== undefined) testLight(ctx, ox, oy, live.test)
  if (on('think')) coffee(ctx, ox, oy, true, f)
}

/** A luz da sala por cima de tudo (menos dos nomes): âmbar pulsando, apagada ou fechada. */
export function areaMood(ctx: Ctx, ox: number, oy: number, mood: AreaLive['mood'], t: number): void {
  if (!mood) return
  ctx.globalAlpha = mood === 'ask' ? 0.07 + 0.05 * Math.sin(t * 4) : mood === 'dark' ? 0.28 : 0.42
  rect(ctx, ox, oy + 6, AREA_W, FLOOR_FRONT - 6, mood === 'ask' ? PAL.amber : '#070914')
  ctx.globalAlpha = 1
}

/** O que fica na frente de quem está sentado: encostos das cadeiras e a frente do sofá. */
export function areaFront(ctx: Ctx, ox: number, oy: number, occ: Occupancy): void {
  if (occ.chairs.has('web')) chair(ctx, ox + SPOTS.web.x, oy + SPOTS.web.y - 2, 'back')
  if (occ.chairs.has('edit')) chair(ctx, ox + SPOTS.edit.x, oy + SPOTS.edit.y - 2, 'back')
  if (occ.sofa) sofa(ctx, ox, oy, 'front')
}

// ---------------------------------------------------------------------------
// Móveis. `on`: alguém está trabalhando nele; `f`: quadro da animação (~12 por segundo).
// ---------------------------------------------------------------------------

/** Estante na parede: de onde saem os livros das skills. */
function shelf(ctx: Ctx, x: number, y: number): void {
  for (let row = 0; row < 2; row++) {
    const by = y + row * 11
    rect(ctx, x, by + 9, 24, 2, PAL.woodDark)
    for (let i = 0, bx = x + 1; bx < x + 22; i++) {
      const w = 2 + (i % 3 === 0 ? 1 : 0)
      const h = 6 + ((i + row) % 3)
      rect(ctx, bx, by + 9 - h, w, h, PAL.books[(i + row * 2) % PAL.books.length])
      bx += w + (i % 4 === 3 ? 2 : 0)
    }
  }
}

function windowPane(ctx: Ctx, x: number, y: number, w: number, sky: Sky): void {
  rect(ctx, x - 2, y - 2, w + 4, 26, PAL.rim)
  rect(ctx, x, y, w, 11, sky.pane[0])
  rect(ctx, x, y + 11, w, 11, sky.pane[1])
  rect(ctx, x + 2, y + 2, 3, 18, sky.night ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.45)')
  if (sky.rain) for (let i = 0; i < 4; i++) rect(ctx, x + 6 + i * 5, y + 3 + ((i * 7) % 12), 1, 3, 'rgba(255,255,255,0.5)')
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
      rect(ctx, x + 7, y + 1 + i * 11, 3, 4, PAL.paper)
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
  rect(ctx, x + 27, y - 4, 6, 1, PAL.paper)
  // Caneca de lápis.
  rect(ctx, x + 2, y - 5, 4, 5, PAL.red)
  rect(ctx, x + 3, y - 8, 1, 3, PAL.brass)
}

/** Onde as folhas editadas pousam: a pilha ao lado do notebook (ver world.ts). */
export const PILE = { x: 120 + 3, y: FLOOR_BACK - 18 }

function papers(ctx: Ctx, ox: number, oy: number, n: number): void {
  const x = ox + 94 + 26
  const y = oy + FLOOR_BACK - 14 - 4
  for (let i = 0; i < Math.min(n, 9); i++) rect(ctx, x + (i % 2), y - i, 7, 1, i % 2 ? PAL.white : PAL.paper)
}

function whiteboard(ctx: Ctx, ox: number, oy: number, on: boolean, f: number, todos?: OfficeTodos): void {
  const x = ox + 134
  const y = oy + 22
  rect(ctx, x, y, 32, 24, PAL.boardFrame)
  rect(ctx, x + 1, y + 1, 30, 21, PAL.board)
  rect(ctx, x + 2, y + 23, 28, 2, PAL.metalDark)
  if (todos && todos.total > 0) {
    // As tarefas da conversa: feitas com ✓ verde, a atual em azul, e a barra de progresso embaixo.
    const rows = Math.min(todos.total, 4)
    const start = Math.max(0, Math.min(todos.done - 1, todos.total - rows))
    for (let i = 0; i < rows; i++) {
      const n = start + i
      const ry = y + 3 + i * 4
      const done = n < todos.done
      const current = n === todos.done
      rect(ctx, x + 3, ry, 2, 2, done ? PAL.led : current ? PAL.blue : PAL.metalLight)
      rect(ctx, x + 7, ry, [18, 12, 20, 14][n % 4], 1, done ? PAL.metalLight : current ? PAL.blue : PAL.metal)
    }
    rect(ctx, x + 3, y + 19, 26, 2, PAL.metalLight)
    rect(ctx, x + 3, y + 19, Math.round((26 * todos.done) / todos.total), 2, PAL.led)
    if (on && f % 8 < 4) rect(ctx, x + 26, y + 3, 2, 2, PAL.red)
    return
  }
  // Rabiscos: um plano que vai crescendo enquanto alguém está no quadro.
  const lines = on ? 1 + ((f >> 2) % 4) : 2
  for (let i = 0; i < lines; i++) rect(ctx, x + 4, y + 4 + i * 4, [18, 12, 22, 9][i], 1, i === 3 ? PAL.red : PAL.blue)
  if (on) rect(ctx, x + 24, y + 4, 3, 3, PAL.led)
}

function rack(ctx: Ctx, ox: number, oy: number, on: boolean, f: number, alarm = false): void {
  const x = ox + 170
  const y = oy + FLOOR_BACK - 46
  rect(ctx, x, y, 16, 46, PAL.rack)
  rect(ctx, x, y, 16, 2, PAL.metalDark)
  // Telinha do terminal: o cursor pisca rodando um comando.
  rect(ctx, x + 2, y + 4, 12, 8, PAL.ink)
  if (on) {
    const c = alarm ? PAL.ledRed : PAL.led
    rect(ctx, x + 3, y + 6, 2, 1, c)
    rect(ctx, x + 4, y + 7, 1, 1, c)
    rect(ctx, x + 3, y + 8, 2, 1, c)
    if (f % 6 < 3) rect(ctx, x + 7, y + 9, 3, 1, c)
  }
  for (let i = 0; i < 5; i++) {
    rect(ctx, x + 2, y + 15 + i * 6, 12, 4, PAL.rackFront)
    const lit = alarm ? f % 4 < 2 : on ? (f + i * 2) % 5 < 3 : i === 0
    rect(ctx, x + 11, y + 16 + i * 6, 1, 1, lit ? (alarm ? PAL.ledRed : PAL.led) : PAL.metalDeep)
    rect(ctx, x + 9, y + 16 + i * 6, 1, 1, alarm || (on && (f + i) % 7 === 0) ? PAL.ledRed : PAL.metalDeep)
  }
}

/** Semáforo em cima do rack: verde ou vermelho pelo último teste; apagado sem teste recente. */
function testLight(ctx: Ctx, ox: number, oy: number, ok: boolean | undefined): void {
  const x = ox + 174
  const y = oy + FLOOR_BACK - 46 - 6
  rect(ctx, x, y, 8, 6, PAL.ink)
  rect(ctx, x + 1, y + 1, 2, 4, ok === false ? PAL.ledRed : '#4a2a2a')
  rect(ctx, x + 5, y + 1, 2, 4, ok === true ? PAL.led : '#26402f')
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
