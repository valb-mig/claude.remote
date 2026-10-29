import { projectName } from '@/lib/format'
import type { OfficeRoom } from '@/lib/types'
import {
  AREA_W,
  CORRIDOR_W,
  FLOOR_BACK,
  GROUND_H,
  ROOF_H,
  areaFront,
  areaLive,
  areaMood,
  building,
  buildingLive,
  city,
  signBox,
  type AreaLive,
  type Layout,
} from './scene'
import { rainfall, skyBack, skyLife, type Sky } from './sky'
import { BODY_ROWS, LEG_ROWS, PAL, SLUMP, bubble, claudinho, rect, type Ctx } from './sprites'
import type { Street } from './street'
import type { Actor, Effect, World } from './world'

/**
 * Um quadro da salinha: os pixels do mundo, num canvas pequeno ampliado sem suavizar, e por cima os
 * textos, na resolução da tela, com as etiquetas prontas em cache.
 */

export type Placed = { room: OfficeRoom; key: string; slot: number }

export type Frame = {
  layout: Layout
  placed: Placed[]
  world: World
  street: Street
  sky: Sky
  /** Segundos (o relógio do mundo) e o quadro da animação (12 por segundo). */
  t: number
  tick: number
  /** Limite de 5 h estourado: escritório fechado até `reopen`; perto do fim, o letreiro fica âmbar. */
  closed: boolean
  reopen?: string
  warn: boolean
  /** Claudinho tocado há pouco: mostra o que ele faz no lugar do nome. */
  selected?: string
}

export const stateOf = (room: OfficeRoom) => {
  const lead = room.workers[0]?.activity
  if (room.state === 'waiting' || lead === 'ask') return { color: '#f5a623', label: 'Pede você', asking: true }
  if (room.state === 'running') return { color: '#63c7ff', label: 'Trabalhando', asking: false }
  if (lead === 'background') return { color: '#63c7ff', label: 'Em segundo plano', asking: false }
  return { color: '#3ddc84', label: 'Descansando', asking: false }
}

/** Topo da cabeça (pixels do mundo, na área): de pé, sentado na cadeira (mais alto), no sofá ou caído. */
export function headTop(world: World, a: Actor): number {
  const seat = world.seatOf(a)
  const slump = world.slumped(a) ? SLUMP : 0
  return a.y + slump - (seat === 'chair' ? 4 + BODY_ROWS : seat === 'sofa' ? BODY_ROWS : BODY_ROWS + LEG_ROWS)
}

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** O fundo pronto: o céu (refeito a cada 5 min) e a cidade com o prédio parado (e quando as áreas mudam). */
export class Backdrop {
  private skyKey = ''
  private cityKey = ''
  private readonly layout: Layout
  private readonly skyCanvas: HTMLCanvasElement
  private readonly cityCanvas: HTMLCanvasElement

  constructor(layout: Layout) {
    this.layout = layout
    this.skyCanvas = canvas(layout.width, layout.height)
    this.cityCanvas = canvas(layout.width, layout.height)
  }

  draw(ctx: Ctx, f: Frame, occupied: Set<number>, then: () => void): void {
    const l = this.layout
    const ground = l.height - GROUND_H
    if (this.skyKey !== f.sky.key) {
      const c = this.skyCanvas.getContext('2d')!
      c.clearRect(0, 0, l.width, l.height)
      skyBack(c, l.width, ground, f.sky)
      this.skyKey = f.sky.key
    }
    const cityKey = `${f.sky.key}|${[...occupied].sort().join(',')}`
    if (this.cityKey !== cityKey) {
      const c = this.cityCanvas.getContext('2d')!
      c.clearRect(0, 0, l.width, l.height)
      city(c, l, f.sky)
      building(c, l, f.sky, occupied)
      this.cityKey = cityKey
    }
    ctx.drawImage(this.skyCanvas, 0, 0)
    // Entre o céu e a cidade: estrelas, nuvens, avião, pássaros.
    then()
    ctx.drawImage(this.cityCanvas, 0, 0)
  }
}

function effect(ctx: Ctx, ox: number, oy: number, e: Effect, t: number): void {
  const p = Math.min(1, (t - e.t0) / e.dur)
  const x = ox + e.x0 + (e.x1 - e.x0) * p
  // Folhas e livros voam em arco; fumaça e gotas vão em linha.
  const arc = e.kind === 'paper' || e.kind === 'book' ? Math.sin(Math.PI * p) * 10 : 0
  const y = oy + e.y0 + (e.y1 - e.y0) * p - arc
  if (e.kind === 'paper') {
    rect(ctx, x - 2, y - 1, 4, 3, PAL.white)
    rect(ctx, x - 1, y, 2, 1, PAL.metalLight)
  } else if (e.kind === 'book') {
    rect(ctx, x - 2, y - 2, 5, 4, PAL.books[1])
    rect(ctx, x - 1, y - 1, 3, 1, PAL.paper)
  } else if (e.kind === 'drop') {
    rect(ctx, x, y, 1, 2, '#7fc4f0')
  } else {
    ctx.globalAlpha = 0.7 * (1 - p)
    const s = 3 + Math.round(p * 5)
    rect(ctx, x - s / 2, y - s / 2, s, s, PAL.smoke)
    rect(ctx, x - s / 2 + 3, y - s / 2 + 3, s - 1, s - 1, PAL.smoke)
    rect(ctx, x - s / 2 - 3, y - s / 2 + 2, s - 2, s - 2, PAL.smoke)
    ctx.globalAlpha = 1
  }
}

/** Os pixels do mundo de um quadro. */
export function drawWorld(ctx: Ctx, back: Backdrop, f: Frame): void {
  const { layout: l, world, sky } = f
  const ground = l.height - GROUND_H
  const areaOf = new Map(f.placed.map((p) => [p.key, l.area(p.slot)]))
  back.draw(ctx, f, new Set(f.placed.map((p) => p.slot)), () => skyLife(ctx, l.width, ground, sky, world.calm ? 0 : f.t, f.tick))
  f.street.draw(ctx, ground, sky, world.calm ? 0 : f.t)
  if (sky.rain) {
    const b = l.building
    rainfall(ctx, l.width, l.height, { x: b.x - 3, y: b.y + ROOF_H - 6, w: b.w + 6, h: b.h }, world.calm ? 0 : f.t)
  }

  // Elevador aberto no andar onde alguém está chegando, saindo ou deixando a caixa do commit.
  const elevatorX = l.corridorX + CORRIDOR_W / 2
  const open = new Set<number>()
  for (const a of world.actors.values()) {
    const area = areaOf.get(a.room)
    if (area && Math.abs(area.x + a.x - elevatorX) < 14 && a.y < 99) open.add(area.floor)
  }
  buildingLive(ctx, l, sky, f.tick, open)

  const lives = new Map<string, AreaLive>()
  for (const p of f.placed) {
    const area = l.area(p.slot)
    const rs = world.rooms.get(p.key)
    const lead = world.actors.get(`${p.key}|lead`)
    const asking = stateOf(p.room).asking
    // Descansando à noite, a luz da área apaga (o gestor dorme no sofá).
    const sleeping = lead?.activity === 'idle' && !lead.task && sky.dark > 0.6
    const live: AreaLive = {
      occ: world.occupancy(p.key),
      todos: rs?.todos,
      papers: rs?.papers ?? 0,
      test: rs?.test?.ok,
      alarm: (rs?.alarmUntil ?? 0) > f.t,
      mood: asking ? 'ask' : f.closed ? 'off' : sleeping ? 'dark' : null,
    }
    lives.set(p.key, live)
    areaLive(ctx, area.x, area.y, live, f.tick)
  }

  // De trás para a frente: quem está mais perto cobre quem está atrás (e o encosto cobre quem senta).
  const draws: { y: number; draw: () => void }[] = []
  for (const p of f.placed) {
    const area = l.area(p.slot)
    const occ = lives.get(p.key)!.occ
    draws.push({ y: area.y + 95.5, draw: () => areaFront(ctx, area.x, area.y, occ) })
  }
  for (const a of world.actors.values()) {
    const o = areaOf.get(a.room)
    if (!o) continue
    const walking = a.path.length > 0
    const seat = world.seatOf(a)
    const gait = Math.floor(a.stride * 8) % 2
    const rs = world.rooms.get(a.room)
    const carry = a.task?.carry && a.arrived === null ? a.task.carry : undefined
    draws.push({
      y: o.y + a.y,
      draw: () =>
        claudinho(ctx, o.x + a.x, o.y + a.y - (seat === 'chair' ? 4 : 0), a.tint, {
          facing: a.facing,
          step: walking ? (gait ? 1 : -1) : 0,
          bob: (walking ? -gait : 0) + world.bob(a),
          seated: Boolean(seat),
          lead: a.lead,
          arms: world.arms(a, f.tick),
          blink: world.time < a.blinkUntil,
          slump: world.slumped(a),
          hat: a.lead ? rs?.family : undefined,
          carry,
        }),
    })
  }
  draws.sort((a, b) => a.y - b.y).forEach((d) => d.draw())

  for (const e of world.effects) {
    const o = areaOf.get(e.room)
    if (o) effect(ctx, o.x, o.y, e, f.t)
  }
  for (const p of f.placed) {
    const area = l.area(p.slot)
    areaMood(ctx, area.x, area.y, lives.get(p.key)!.mood, f.t)
  }
  for (const a of world.actors.values()) {
    const o = areaOf.get(a.room)
    if (!o) continue
    const kind = world.bubbleOf(a, f.tick)
    // Balão ao lado da cabeça; o nome fica em cima dela.
    if (kind) bubble(ctx, o.x + a.x + 13, o.y + headTop(world, a) + 2 + world.bob(a), kind, kind === 'dots' ? f.tick >> 2 : f.tick)
  }
}

function clip(ctx: Ctx, text: string, maxW: number): string {
  let t = text
  while (t.length > 1 && ctx.measureText(t).width > maxW) t = `${t.slice(0, -2)}…`
  return t
}

type PillOpts = { text: string; size: number; maxW: number; dot?: string; sub?: string; dim?: boolean }

/** Os textos da salinha: letreiro, andares, placas das áreas e nomes, com as etiquetas prontas em cache. */
export class Labels {
  private readonly pills = new Map<string, HTMLCanvasElement>()
  private readonly font: string

  constructor(font: string) {
    this.font = font
  }

  /** Etiqueta escura arredondada; com `sub`, uma segunda linha menor (a placa da área). */
  private pill(o: PillOpts): HTMLCanvasElement {
    const key = `${o.text}|${o.sub ?? ''}|${o.size}|${Math.round(o.maxW)}|${o.dot ?? ''}|${o.dim ? 1 : 0}`
    let c = this.pills.get(key)
    if (c) return c
    if (this.pills.size > 400) this.pills.clear()
    const probe = canvas(1, 1).getContext('2d')!
    const pad = o.size * 0.55
    const dotW = o.dot ? o.size * 0.9 : 0
    probe.font = `600 ${o.size}px ${this.font}`
    const title = clip(probe, o.text, o.maxW - pad * 2 - dotW)
    let w = probe.measureText(title).width + dotW
    let sub = ''
    if (o.sub) {
      probe.font = `500 ${o.size * 0.86}px ${this.font}`
      sub = clip(probe, o.sub, o.maxW - pad * 2)
      w = Math.max(w, probe.measureText(sub).width)
    }
    w += pad * 2
    const h = o.size * (o.sub ? 2.75 : 1.55)
    c = canvas(Math.ceil(w), Math.ceil(h))
    const ctx = c.getContext('2d')!
    ctx.fillStyle = o.dim ? 'rgba(16,18,28,0.55)' : 'rgba(16,18,28,0.86)'
    ctx.beginPath()
    ctx.roundRect(0, 0, w, h, o.size * 0.6)
    ctx.fill()
    const line1 = o.size * 0.82
    if (o.dot) {
      ctx.fillStyle = o.dot
      ctx.beginPath()
      ctx.arc(pad + o.size * 0.3, line1, o.size * 0.28, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${o.size}px ${this.font}`
    ctx.fillStyle = o.dim ? 'rgba(242,244,247,0.6)' : '#f2f4f7'
    ctx.fillText(title, pad + dotW, line1)
    if (sub) {
      ctx.font = `500 ${o.size * 0.86}px ${this.font}`
      ctx.fillStyle = 'rgba(190,198,214,0.95)'
      ctx.fillText(sub, pad, o.size * 1.98)
    }
    this.pills.set(key, c)
    return c
  }

  draw(ctx: Ctx, f: Frame, k: number, dpr: number): void {
    const { layout: l, world } = f
    const areaOf = new Map(f.placed.map((p) => [p.key, l.area(p.slot)]))
    const items: { c: HTMLCanvasElement; x: number; y: number }[] = []

    for (let s = 0; s < l.floors * l.perFloor; s++) {
      const area = l.area(s)
      const p = f.placed.find((q) => q.slot === s)
      if (!p) {
        items.push({ c: this.pill({ text: 'Área livre', size: 10 * dpr, maxW: AREA_W * 0.5 * k, dim: true }), x: (area.x + 30) * k, y: (area.y + 10) * k })
        continue
      }
      const lead = p.room.workers[0]
      const crew = p.room.workers.length - 1
      const sub = [lead?.detail, projectName(p.room.cwd), crew > 0 && `${crew} ${crew === 1 ? 'funcionário' : 'funcionários'}`]
        .filter(Boolean)
        .join(' · ')
      const c = this.pill({ text: p.room.title, sub, size: 10.5 * dpr, maxW: (AREA_W - 40) * k, dot: stateOf(p.room).color })
      items.push({ c, x: (area.x + 30) * k, y: (area.y + 9) * k })
    }

    // Nomes: quem está junto de outro tem a etiqueta empurrada para cima, para não se cobrirem.
    const tag = 9 * dpr
    const taken: { x: number; y: number; w: number; h: number }[] = []
    const actors = [...world.actors.values()].sort((a, b) => a.x - b.x)
    for (const a of actors) {
      const o = areaOf.get(a.room)
      if (!o) continue
      const chosen = f.selected === a.key && a.detail
      const c = this.pill(chosen ? { text: a.detail!, size: tag, maxW: 150 * k } : { text: a.name, size: tag, maxW: 70 * k })
      const x = Math.round((o.x + a.x) * k - c.width / 2)
      // Com balão ao lado da cabeça, a etiqueta sobe acima dele, para não se cobrirem.
      const lift = world.bubbleOf(a, f.tick) ? 11 : 0
      let y = Math.round((o.y + headTop(world, a) - 2 - lift + world.bob(a)) * k - c.height)
      while (taken.some((t) => x < t.x + t.w + 2 && t.x < x + c.width + 2 && Math.abs(t.y - y) < c.height + 1)) y -= c.height + 2
      taken.push({ x, y, w: c.width, h: c.height })
      items.push({ c, x, y })
    }

    const sign = signBox(l)
    const signText = f.closed ? (f.reopen ? `VOLTA ÀS ${f.reopen}` : 'FECHADO') : 'CLAUDE REMOTE'
    const signColor = f.closed || f.warn ? '#f5a623' : f.sky.dark > 0.2 ? '#ffd36b' : '#f2f4f7'
    ctx.font = `700 ${Math.min(sign.h * 0.62 * k, 15 * dpr)}px ${this.font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = signColor
    ctx.fillText(signText, (sign.x + sign.w / 2) * k, (sign.y + sign.h / 2 + 0.5) * k)
    ctx.font = `700 ${7 * dpr}px ${this.font}`
    ctx.fillStyle = '#3ddc84'
    const elevatorX = l.corridorX + CORRIDOR_W / 2
    for (let floor = 0; floor < l.floors; floor++) ctx.fillText(`${floor + 1}`, elevatorX * k, (l.floorTop(floor) + FLOOR_BACK - 50.5) * k)
    for (const i of items) ctx.drawImage(i.c, i.x, i.y)
  }
}
