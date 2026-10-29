import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { Pending } from '@/components/home/now'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { projectName } from '@/lib/format'
import { useWidth } from '@/lib/hooks'
import { HOME } from '@/lib/machines'
import { useStore } from '@/lib/store'
import type { CatalogEntry, OfficeRoom } from '@/lib/types'
import { Backdrop, Labels, drawWorld, headTop, stateOf, type Frame, type Placed } from './render'
import { AREA_W, FLOOR_H, buildingWidth, deliveryX, layoutFor, type Layout } from './scene'
import { skyAt, type Sky } from './sky'
import { Street } from './street'
import { World } from './world'

/** Cada conversa fica na área em que apareceu; a de quem fechou vira vaga para a próxima. */
class Slots {
  private readonly bySession = new Map<string, number>()

  assign(rooms: OfficeRoom[]): Placed[] {
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
// Quadros por segundo: pixel art não precisa de mais, e a salinha fica de fundo por horas. Sem ninguém
// andando nem nada no ar, metade: luzes, nuvens e a rua vão bem assim.
const FPS = 12
const FPS_STILL = 6

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

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * O escritório em pixel art: um prédio numa cidade, cada andar com áreas (uma por conversa aberta)
 * dos lados do corredor. Os claudinhos saem do elevador e vão até a estação do que estão fazendo.
 * Tocar num claudinho mostra o que ele faz (e ele pula); tocar na área abre a conversa, ou os
 * pedidos dela, se estiver pedindo você.
 */
export function PixelOffice({ rooms, clock }: { rooms: OfficeRoom[]; clock?: { hour?: number; rain?: boolean } }) {
  const box = useRef<HTMLDivElement>(null)
  const pix = useRef<HTMLCanvasElement>(null)
  const width = useWidth(box)
  const [, navigate] = useLocation()
  const [street] = useState(() => new Street())
  const [world] = useState(() => {
    const w = new World()
    w.calm = reducedMotion()
    w.onPush = () => street.deliver()
    return w
  })
  const [slots] = useState(() => new Slots())
  const placed = useMemo(() => slots.assign(rooms), [slots, rooms])
  const total = Math.max(1, ...placed.map((p) => p.slot + 1))
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const { layout, scale } = useMemo(() => fit(width, total, dpr), [width, total, dpr])
  const fiveHour = useStore((s) => s.usages[HOME]?.plan?.fiveHour)
  const catalog = useStore((s) => s.catalog)
  const [askingId, setAskingId] = useState<string | null>(null)
  const asking = askingId ? placed.find((p) => p.room.sessionId === askingId)?.room : undefined
  // Respondido (aqui ou em outro lugar): a folha dos pedidos fecha sozinha.
  if (askingId && !(asking && stateOf(asking).asking)) setAskingId(null)

  // O laço de desenho lê sempre o mais recente daqui, sem recomeçar a cada resposta do servidor.
  const live = useRef({ placed, fiveHour, selected: undefined as { key: string; until: number } | undefined })
  useEffect(() => {
    live.current.placed = placed
    live.current.fiveHour = fiveHour
  }, [placed, fiveHour])

  useEffect(() => {
    world.sync(
      placed.map((p) => {
        const side = layout.area(p.slot).side
        return {
          key: p.key,
          workers: p.room.workers,
          events: p.room.events ?? [],
          todos: p.room.todos,
          model: p.room.model,
          state: p.room.state,
          entryX: layout.entryX(side),
          askX: layout.askX(side),
          coolerX: layout.coolerX(side),
        }
      }),
    )
  }, [world, placed, layout])

  // Quem passa a pedir você: a salinha rola até a área dele, se estiver fora da tela.
  const askingKeys = useRef(new Set<string>())
  useEffect(() => {
    const now = new Set(placed.filter((p) => stateOf(p.room).asking).map((p) => p.key))
    const fresh = placed.find((p) => now.has(p.key) && !askingKeys.current.has(p.key))
    askingKeys.current = now
    const el = pix.current
    const scroller = el?.closest('main')
    if (!fresh || !el || !scroller) return
    const r = el.getBoundingClientRect()
    const k = r.height / layout.height
    const area = layout.area(fresh.slot)
    const top = r.top + area.y * k
    const bottom = top + FLOOR_H * k
    const view = scroller.getBoundingClientRect()
    if (top >= view.top && bottom <= view.bottom) return
    scroller.scrollBy({ top: (top + bottom) / 2 - (view.top + view.bottom) / 2, behavior: 'smooth' })
  }, [placed, layout])

  useEffect(() => {
    const el = pix.current
    if (!el || !width) return
    // O mundo é desenhado pequeno e ampliado sem suavizar; os textos vão por cima, na resolução da tela.
    // Uma camada só: duas sobrepostas custam mais para o navegador compor a cada quadro.
    const low = document.createElement('canvas')
    low.width = layout.width
    low.height = layout.height
    const lctx = low.getContext('2d')!
    el.width = Math.round(layout.width * scale)
    el.height = Math.round(layout.height * scale)
    el.style.width = `${el.width / dpr}px`
    el.style.height = `${el.height / dpr}px`
    const ctx = el.getContext('2d')!
    const back = new Backdrop(layout)
    const labels = new Labels(getComputedStyle(document.body).fontFamily)
    // Hora pedida na URL (`?hora=21`): o relógio anda a partir dela.
    const offset = clock?.hour === undefined ? 0 : (clock.hour - new Date().getHours()) * 3_600_000
    const skyNow = () => skyAt(new Date(Date.now() + offset), clock?.rain)
    let sky: Sky = skyNow()
    let skyAtMs = Date.now()
    let last = performance.now()
    let drawn = 0
    let raf = 0

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const still = !world.busy
      if (now - drawn < 1000 / (still ? FPS_STILL : FPS) - 4) return
      drawn = now
      const dt = Math.min((now - last) / 1000, 0.5)
      last = now
      if (Date.now() - skyAtMs > 10_000) {
        sky = skyNow()
        skyAtMs = Date.now()
      }
      world.step(dt)
      if (!world.calm) street.step(dt, layout.width, sky, deliveryX(layout))

      const { placed, fiveHour, selected } = live.current
      const used = fiveHour?.utilization ?? 0
      const reset = fiveHour?.resetsAt ? new Date(fiveHour.resetsAt) : undefined
      const frame: Frame = {
        layout,
        placed,
        world,
        street,
        sky,
        t: world.time,
        tick: Math.floor(world.time * 12),
        closed: used >= 100,
        reopen: reset && !Number.isNaN(reset.getTime()) ? reset.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : undefined,
        warn: used >= 90,
        selected: selected && selected.until > world.time ? selected.key : undefined,
      }
      lctx.clearRect(0, 0, low.width, low.height)
      drawWorld(lctx, back, frame)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(low, 0, 0, el.width, el.height)
      labels.draw(ctx, frame, scale, dpr)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [world, street, layout, scale, dpr, width, clock?.hour, clock?.rain])

  /** O claudinho ou a área sob o dedo, em pixels do mundo. */
  const hit = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const wx = ((e.clientX - r.left) / r.width) * layout.width
    const wy = ((e.clientY - r.top) / r.height) * layout.height
    const areaOf = new Map(placed.map((p) => [p.key, layout.area(p.slot)]))
    let actor: string | undefined
    let front = -Infinity
    for (const a of world.actors.values()) {
      const o = areaOf.get(a.room)
      if (!o || a.leaving) continue
      const x = o.x + a.x
      const y = o.y + a.y
      if (Math.abs(wx - x) <= 10 && wy >= o.y + headTop(world, a) - 3 && wy <= y + 2 && y > front) {
        actor = a.key
        front = y
      }
    }
    const room = placed.find((p) => {
      const a = layout.area(p.slot)
      return wx >= a.x && wx < a.x + AREA_W && wy >= a.y && wy < a.y + FLOOR_H
    })
    return { actor, room }
  }

  const entryOf = (room: OfficeRoom): CatalogEntry =>
    catalog.find((c) => c.sessionId === room.sessionId) ?? {
      sessionId: room.sessionId,
      title: room.title,
      cwd: room.cwd,
      state: room.state,
      owner: room.owner,
      lastModified: 0,
      machine: room.machine,
    }

  return (
    <div ref={box} className="flex w-full justify-center">
      <canvas
          ref={pix}
          role="img"
          aria-label={`Escritório com ${rooms.length} ${rooms.length === 1 ? 'área' : 'áreas'}: ${rooms.map((r) => `${r.title} (${stateOf(r).label})`).join(', ')}`}
          className="block [image-rendering:pixelated]"
          onClick={(e) => {
            const { actor, room } = hit(e)
            if (actor) {
              world.poke(actor)
              live.current.selected = { key: actor, until: world.time + 5 }
              return
            }
            if (!room || room.room.sessionId.startsWith('demo-')) return
            // Pedindo você numa conversa do painel: os pedidos abrem aqui mesmo, para responder sem sair.
            if (stateOf(room.room).asking && room.room.owner === 'panel') setAskingId(room.room.sessionId)
            else navigate(`/s/${room.room.sessionId}`)
          }}
          onMouseMove={(e) => {
            const { actor, room } = hit(e)
            e.currentTarget.style.cursor = actor || room ? 'pointer' : 'default'
          }}
        />
      <Sheet open={Boolean(asking)} onOpenChange={(o) => !o && setAskingId(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Pedindo você</SheetTitle>
            <SheetDescription>{asking ? `${asking.title} · ${projectName(asking.cwd)}` : ''}</SheetDescription>
          </SheetHeader>
          {asking && (
            <div className="px-4">
              <Pending s={entryOf(asking)} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
