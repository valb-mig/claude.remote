import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { projectName } from '@/lib/format'
import { useWidth } from '@/lib/hooks'
import { HOME } from '@/lib/machines'
import type { OfficeRoom } from '@/lib/types'
import {
  AREA_W,
  CORRIDOR_W,
  FLOOR_BACK,
  FLOOR_H,
  areaBack,
  areaFront,
  buildingWidth,
  corridor,
  facade,
  freeArea,
  layoutFor,
  partition,
  scenery,
  signBox,
  skyAt,
  storey,
  type Layout,
} from './scene'
import { BODY_ROWS, LEG_ROWS, bubble, claudinho } from './sprites'
import { World, type Actor } from './world'

/** Cada conversa fica na área em que apareceu; a de quem fechou vira vaga para a próxima. */
class Slots {
  private readonly bySession = new Map<string, number>()

  assign(rooms: OfficeRoom[]): { room: OfficeRoom; key: string; slot: number }[] {
    const keys = new Set(rooms.map(keyOf))
    for (const k of [...this.bySession.keys()]) if (!keys.has(k)) this.bySession.delete(k)
    const used = new Set(this.bySession.values())
    return rooms.map((room) => {
      const key = keyOf(room)
      let slot = this.bySession.get(key)
      if (slot === undefined) {
        slot = 0
        while (used.has(slot)) slot++
        used.add(slot)
        this.bySession.set(key, slot)
      }
      return { room, key, slot }
    })
  }
}

const keyOf = (r: OfficeRoom) => `${r.machine ?? HOME}|${r.sessionId}`

// Pixels de tela (CSS) por pixel do mundo: com duas áreas por andar abaixo disso os claudinhos ficam
// miúdos, e o prédio passa a ter uma área por andar; acima do máximo, o prédio vira outdoor.
const MIN_CSS = 1.2
const MAX_CSS = 3.5
// Quadros por segundo: pixel art não precisa de mais, e a salinha fica de fundo por horas.
const FPS = 12

// Cidade de cada lado do prédio: no mínimo um respiro, no máximo o que cabe sem virar paisagem.
const MIN_SIDE = 6
const MAX_SIDE = 60

/**
 * Duas áreas por andar se couberem legíveis; senão uma. O prédio decide a escala e a cidade em volta
 * preenche o resto da largura, para a escala poder ser inteira (pixels nítidos) sem sobrar faixa vazia.
 */
function fit(width: number, slots: number, dpr: number): { layout: Layout; scale: number } {
  for (const perFloor of [2, 1] as const) {
    const bw = buildingWidth(perFloor)
    let scale = (width * dpr) / (bw + MIN_SIDE * 2)
    // Tela comum: pixels inteiros, para ficarem nítidos; em telas densas a diferença não aparece.
    if (dpr < 2) scale = Math.min(Math.floor(scale), Math.floor(MAX_CSS * dpr))
    else scale = Math.min(scale, MAX_CSS * dpr)
    if (scale / dpr < MIN_CSS && perFloor === 2) continue
    scale = Math.max(scale, 1)
    const side = Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.floor(((width * dpr) / scale - bw) / 2)))
    return { layout: layoutFor(slots, perFloor, side), scale }
  }
  return { layout: layoutFor(slots, 1, MIN_SIDE), scale: dpr }
}

const stateOf = (room: OfficeRoom) => {
  const lead = room.workers[0]?.activity
  if (room.state === 'waiting' || lead === 'ask') return { color: '#f5a623', label: 'Pede você' }
  if (room.state === 'running') return { color: '#63c7ff', label: 'Trabalhando' }
  if (lead === 'background') return { color: '#63c7ff', label: 'Em segundo plano' }
  return { color: '#3ddc84', label: 'Descansando' }
}

/** Topo da cabeça (pixels do mundo, na área): de pé, sentado na cadeira (mais alto) ou no sofá. */
function headTop(a: Actor): number {
  const seat = a.path.length ? undefined : a.spot.seated
  return a.y - (seat === 'chair' ? 4 + BODY_ROWS : seat === 'sofa' ? BODY_ROWS : BODY_ROWS + LEG_ROWS)
}

function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  let t = text
  while (t.length > 1 && ctx.measureText(t).width > maxW) t = `${t.slice(0, -2)}…`
  return t
}

/** Etiqueta escura arredondada; com `sub`, uma segunda linha menor (a placa da área). `y` é o topo. */
function pill(
  ctx: CanvasRenderingContext2D,
  font: string,
  x: number,
  y: number,
  o: { text: string; size: number; maxW: number; dot?: string; sub?: string; dim?: boolean },
): void {
  const pad = o.size * 0.55
  const dotW = o.dot ? o.size * 0.9 : 0
  ctx.font = `600 ${o.size}px ${font}`
  const title = clip(ctx, o.text, o.maxW - pad * 2 - dotW)
  let w = ctx.measureText(title).width + dotW
  let sub = ''
  if (o.sub) {
    ctx.font = `500 ${o.size * 0.86}px ${font}`
    sub = clip(ctx, o.sub, o.maxW - pad * 2)
    w = Math.max(w, ctx.measureText(sub).width)
  }
  w += pad * 2
  const h = o.size * (o.sub ? 2.75 : 1.55)
  ctx.fillStyle = o.dim ? 'rgba(16,18,28,0.55)' : 'rgba(16,18,28,0.86)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, o.size * 0.6)
  ctx.fill()
  const line1 = y + o.size * 0.82
  if (o.dot) {
    ctx.fillStyle = o.dot
    ctx.beginPath()
    ctx.arc(x + pad + o.size * 0.3, line1, o.size * 0.28, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${o.size}px ${font}`
  ctx.fillStyle = o.dim ? 'rgba(242,244,247,0.6)' : '#f2f4f7'
  ctx.fillText(title, x + pad + dotW, line1)
  if (sub) {
    ctx.font = `500 ${o.size * 0.86}px ${font}`
    ctx.fillStyle = 'rgba(190,198,214,0.95)'
    ctx.fillText(sub, x + pad, y + o.size * 1.98)
  }
}

/**
 * O escritório em pixel art: um prédio numa cidade, cada andar com áreas (uma por conversa aberta)
 * dos lados do corredor. Os claudinhos saem do elevador e vão até a estação do que estão fazendo.
 * Tocar numa área abre a conversa.
 */
export function PixelOffice({ rooms }: { rooms: OfficeRoom[] }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const width = useWidth(box)
  const [, navigate] = useLocation()
  const [world] = useState(() => new World())
  const [slots] = useState(() => new Slots())
  const placed = useMemo(() => slots.assign(rooms), [slots, rooms])
  const total = Math.max(1, ...placed.map((p) => p.slot + 1))
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const { layout, scale } = useMemo(() => fit(width, total, dpr), [width, total, dpr])

  useEffect(() => {
    world.sync(
      placed.map((p) => {
        const side = layout.area(p.slot).side
        return { key: p.key, workers: p.room.workers, entryX: layout.entryX(side), askX: layout.askX(side) }
      }),
    )
  }, [world, placed, layout])

  useEffect(() => {
    const el = canvas.current
    if (!el || !width) return
    const low = document.createElement('canvas')
    low.width = layout.width
    low.height = layout.height
    const lc = low.getContext('2d')!
    el.width = Math.round(layout.width * scale)
    el.height = Math.round(layout.height * scale)
    el.style.width = `${el.width / dpr}px`
    el.style.height = `${el.height / dpr}px`
    const ctx = el.getContext('2d')!
    const bySlot = new Map(placed.map((p) => [p.slot, p]))
    const areaOf = new Map(placed.map((p) => [p.key, layout.area(p.slot)]))
    const slotsShown = layout.floors * layout.perFloor
    const font = getComputedStyle(document.body).fontFamily
    let frame = 0
    let last = performance.now()
    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      timer = setTimeout(tick, 1000 / FPS)
      // Aba escondida: nada se mexe na tela, nada é desenhado.
      if (document.hidden) {
        last = performance.now()
        return
      }
      const now = performance.now()
      world.step(Math.min((now - last) / 1000, 0.5))
      last = now
      frame++
      const sky = skyAt(new Date().getHours())

      lc.clearRect(0, 0, low.width, low.height)
      scenery(lc, layout, sky, frame)
      facade(lc, layout, sky, frame)
      // Elevador aberto no andar onde alguém está chegando ou indo embora.
      const elevatorX = layout.corridorX + CORRIDOR_W / 2
      const busy = new Set<number>()
      for (const a of world.actors.values()) {
        const area = areaOf.get(a.room)
        if (area && a.path.length && Math.abs(area.x + a.x - elevatorX) < 14 && a.y < 99) busy.add(area.floor)
      }
      for (let floor = 0; floor < layout.floors; floor++) {
        storey(lc, layout, floor, sky)
        corridor(lc, layout, floor, busy.has(floor))
      }
      const occ = new Map(placed.map((p) => [p.key, world.occupancy(p.key)]))
      for (let s = 0; s < slotsShown; s++) {
        const area = layout.area(s)
        const p = bySlot.get(s)
        if (p) areaBack(lc, area.x, area.y, occ.get(p.key)!, sky, frame)
        else freeArea(lc, area.x, area.y, sky)
        partition(lc, area.side === 'left' ? area.x + AREA_W - 2 : area.x - 2, area.y)
      }

      // De trás para a frente: quem está mais perto cobre quem está atrás (e o encosto cobre quem senta).
      const draws: { y: number; draw: () => void }[] = []
      for (const p of placed) {
        const area = layout.area(p.slot)
        draws.push({ y: area.y + 95.5, draw: () => areaFront(lc, area.x, area.y, occ.get(p.key)!) })
      }
      for (const a of world.actors.values()) {
        const o = areaOf.get(a.room)
        if (!o) continue
        const walking = a.path.length > 0
        const seat = walking ? undefined : a.spot.seated
        const gait = Math.floor(a.stride * 8) % 2
        draws.push({
          y: o.y + a.y,
          draw: () =>
            claudinho(lc, o.x + a.x, o.y + a.y - (seat === 'chair' ? 4 : 0), a.tint, {
              facing: a.facing,
              step: walking ? (gait ? 1 : -1) : 0,
              bob: walking ? -gait : 0,
              seated: Boolean(seat),
              lead: a.lead,
              arms: !walking && Boolean(a.spot.arms) && (a.activity === 'plan' || frame % 2 === 0),
            }),
        })
      }
      draws.sort((a, b) => a.y - b.y).forEach((d) => d.draw())
      for (const a of world.actors.values()) {
        const o = areaOf.get(a.room)
        if (!o || a.path.length || a.leaving) continue
        // Balão ao lado da cabeça; o nome fica em cima dela.
        const head = o.y + headTop(a) + 2
        if (a.activity === 'think') bubble(lc, o.x + a.x + 13, head, 'dots', frame >> 2)
        if (a.activity === 'ask') bubble(lc, o.x + a.x + 13, head, 'alert', frame)
        if (a.activity === 'idle' && frame % 40 < 26) bubble(lc, o.x + a.x + 13, head, 'sleep', frame)
      }

      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, el.width, el.height)
      ctx.drawImage(low, 0, 0, el.width, el.height)

      // Textos na resolução da tela: letreiro, andares, placa de cada área e o nome de cada um.
      const k = scale
      const sign = signBox(layout)
      ctx.font = `700 ${Math.min(sign.h * 0.62 * k, 15 * dpr)}px ${font}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = sky.night || sky.dusk ? '#ffd36b' : '#f2f4f7'
      ctx.fillText('CLAUDE REMOTE', (sign.x + sign.w / 2) * k, (sign.y + sign.h / 2 + 0.5) * k)
      ctx.font = `700 ${7 * dpr}px ${font}`
      ctx.fillStyle = '#3ddc84'
      for (let floor = 0; floor < layout.floors; floor++) {
        ctx.fillText(`${floor + 1}`, elevatorX * k, (layout.floorTop(floor) + FLOOR_BACK - 50.5) * k)
      }
      ctx.textAlign = 'left'
      for (let s = 0; s < slotsShown; s++) {
        const area = layout.area(s)
        const p = bySlot.get(s)
        if (!p) {
          pill(ctx, font, (area.x + 30) * k, (area.y + 10) * k, { text: 'Área livre', size: 10 * dpr, maxW: AREA_W * 0.5 * k, dim: true })
          continue
        }
        const lead = p.room.workers[0]
        const crew = p.room.workers.length - 1
        const sub = [lead?.detail, projectName(p.room.cwd), crew > 0 && `${crew} ${crew === 1 ? 'funcionário' : 'funcionários'}`]
          .filter(Boolean)
          .join(' · ')
        pill(ctx, font, (area.x + 30) * k, (area.y + 9) * k, {
          text: p.room.title,
          sub,
          size: 10.5 * dpr,
          maxW: (AREA_W - 40) * k,
          dot: stateOf(p.room).color,
        })
      }
      // Nomes: quem está junto de outro tem a etiqueta empurrada para cima, para não se cobrirem.
      const tag = 9 * dpr
      const tagH = tag * 1.55
      const taken: { x: number; y: number; w: number }[] = []
      const actors = [...world.actors.values()].sort((a, b) => a.x - b.x)
      for (const a of actors) {
        const o = areaOf.get(a.room)
        if (!o) continue
        ctx.font = `600 ${tag}px ${font}`
        const w = Math.min(ctx.measureText(a.name).width + tag * 1.1, 70 * k)
        const x = (o.x + a.x) * k - w / 2
        let y = (o.y + headTop(a) - 2) * k - tagH
        while (taken.some((t) => x < t.x + t.w + 2 && t.x < x + w + 2 && Math.abs(t.y - y) < tagH + 1)) y -= tagH + 2
        taken.push({ x, y, w })
        pill(ctx, font, x, y, { text: a.name, size: tag, maxW: 70 * k })
      }
    }
    tick()
    return () => clearTimeout(timer)
  }, [world, placed, layout, scale, dpr, width])

  const roomAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const wx = ((e.clientX - r.left) / r.width) * layout.width
    const wy = ((e.clientY - r.top) / r.height) * layout.height
    return placed.find((p) => {
      const a = layout.area(p.slot)
      return wx >= a.x && wx < a.x + AREA_W && wy >= a.y && wy < a.y + FLOOR_H
    })
  }

  return (
    <div ref={box} className="flex w-full justify-center">
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Escritório com ${rooms.length} ${rooms.length === 1 ? 'área' : 'áreas'}: ${rooms.map((r) => `${r.title} (${stateOf(r).label})`).join(', ')}`}
        className="block [image-rendering:pixelated]"
        onClick={(e) => {
          const p = roomAt(e)
          if (p && !p.room.sessionId.startsWith('demo-')) navigate(`/s/${p.room.sessionId}`)
        }}
        onMouseMove={(e) => (e.currentTarget.style.cursor = roomAt(e) ? 'pointer' : 'default')}
      />
    </div>
  )
}
