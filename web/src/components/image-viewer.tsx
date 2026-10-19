import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus, X } from 'lucide-react'
import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** Arrasto mínimo, em px, para passar para a imagem do lado. */
const SWIPE = 60
const MAX_ZOOM = 5
/** Zoom do toque duplo e passo dos botões − e +. */
const TAP_ZOOM = 2.5
const STEP_ZOOM = 1.5

type Point = { x: number; y: number }
/** Zoom e deslocamento da imagem; `scale` 1 é o tamanho que cabe na moldura. */
type View = { scale: number; x: number; y: number }
const FIT: View = { scale: 1, x: 0, y: 0 }

type Gesture =
  | { kind: 'drag'; start: Point; view: View; moved: boolean; horizontal: boolean; dx: number; onImage: boolean }
  | { kind: 'pinch'; dist: number; mid: Point; view: View }

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Leva para `to` o ponto da imagem que estava em `from`, já com o zoom novo (pinça, toque duplo, roda). */
function zoomAt(base: View, scale: number, from: Point, to = from): View {
  const s = Math.min(MAX_ZOOM, scale)
  return { scale: s, x: to.x - (s * (from.x - base.x)) / base.scale, y: to.y - (s * (from.y - base.y)) / base.scale }
}

const barButton = 'flex size-10 items-center justify-center rounded-full text-white disabled:opacity-30'

/**
 * Uma imagem com zoom: pinça, toque duplo, roda do mouse ou os botões − e +; ampliada, arrastar
 * passeia por ela. Sem zoom, deslizar de lado passa para a vizinha. Tocar fora da imagem fecha.
 */
function Stage({
  src,
  many,
  canPrev,
  canNext,
  onStep,
  onClose,
}: {
  src: string
  many: boolean
  canPrev: boolean
  canNext: boolean
  onStep: (step: number) => void
  onClose: () => void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const [view, setView] = useState<View>(FIT)
  const [swipe, setSwipe] = useState(0)
  const [touching, setTouching] = useState(false)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const lastTap = useRef<{ at: number; p: Point } | null>(null)

  /** Medidas da imagem sem zoom (os offsets ignoram o transform) e da tela. */
  function frame() {
    const el = img.current!
    const box = el.parentElement!
    const area = stage.current!
    return {
      cx: box.offsetLeft + el.offsetLeft + el.offsetWidth / 2,
      cy: box.offsetTop + el.offsetTop + el.offsetHeight / 2,
      w: el.offsetWidth,
      h: el.offsetHeight,
      W: area.clientWidth,
      H: area.clientHeight,
      rect: area.getBoundingClientRect(),
    }
  }

  /** Posição do toque relativa ao centro da imagem sem zoom. */
  function point(e: { clientX: number; clientY: number }): Point {
    const f = frame()
    return { x: e.clientX - f.rect.left - f.cx, y: e.clientY - f.rect.top - f.cy }
  }

  /** Ampliada, a imagem sempre cobre a tela no sentido em que é maior que ela; no outro, fica centralizada. */
  function clamp(v: View): View {
    const f = frame()
    const fit = (t: number, size: number, c: number, total: number) =>
      size <= total ? 0 : Math.min(size / 2 - c, Math.max(total - c - size / 2, t))
    return { scale: v.scale, x: fit(v.x, f.w * v.scale, f.cx, f.W), y: fit(v.y, f.h * v.scale, f.cy, f.H) }
  }

  /** Zoom ancorado num ponto; de volta a 1 (ou menos), cabe de novo na moldura. */
  const settle = (v: View) => (v.scale <= 1.01 ? FIT : clamp(v))

  function zoomBy(factor: number) {
    const f = frame()
    const center = { x: f.W / 2 - f.cx, y: f.H / 2 - f.cy }
    setView(settle(zoomAt(view, view.scale * factor, center)))
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = point(e)
    pointers.current.set(e.pointerId, p)
    setTouching(true)
    const [a, b] = [...pointers.current.values()]
    if (pointers.current.size === 1) {
      gesture.current = { kind: 'drag', start: p, view, moved: false, horizontal: false, dx: 0, onImage: e.target === img.current }
    } else if (a && b) {
      gesture.current = { kind: 'pinch', dist: distance(a, b), mid: middle(a, b), view }
    }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return
    const p = point(e)
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()]
      if (!a || !b) return
      const next = zoomAt(g.view, (g.view.scale * distance(a, b)) / g.dist, g.mid, middle(a, b))
      // Durante a pinça dá para reduzir um pouco abaixo do normal; ao soltar, volta.
      setView(next.scale > 1 ? clamp(next) : { ...next, scale: Math.max(0.6, next.scale) })
      return
    }
    const dx = p.x - g.start.x
    const dy = p.y - g.start.y
    if (!g.moved && Math.hypot(dx, dy) > 8) {
      g.moved = true
      g.horizontal = Math.abs(dx) > Math.abs(dy)
    }
    if (!g.moved) return
    if (g.view.scale > 1) return setView(clamp({ ...g.view, x: g.view.x + dx, y: g.view.y + dy }))
    if (!g.horizontal || !many) return
    // Na primeira e na última, puxar para fora resiste.
    g.dx = (dx > 0 && !canPrev) || (dx < 0 && !canNext) ? dx / 3 : dx
    setSwipe(g.dx)
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(e.pointerId)) return
    if (pointers.current.size === 0) setTouching(false)
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.kind === 'pinch') return setView(settle)
    if (g.moved || e.type === 'pointercancel') {
      setSwipe(0)
      if (Math.abs(g.dx) > SWIPE) onStep(g.dx < 0 ? 1 : -1)
      return
    }
    // Toque: fora da imagem fecha; dois toques na imagem ampliam ali ou voltam ao tamanho da moldura.
    if (!g.onImage) return onClose()
    const now = performance.now()
    const tap = lastTap.current
    if (tap && now - tap.at < 300 && distance(tap.p, g.start) < 30) {
      lastTap.current = null
      setView(view.scale > 1 ? FIT : clamp(zoomAt(view, TAP_ZOOM, g.start)))
    } else {
      lastTap.current = { at: now, p: g.start }
    }
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    setView(settle(zoomAt(view, view.scale * Math.exp(-e.deltaY * 0.0015), point(e))))
  }

  const zoomed = view.scale > 1
  return (
    <>
      <div
        ref={stage}
        className="absolute inset-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {/* Sem zoom, a imagem fica numa moldura com folga: abaixo do topo e acima da barra de botões. */}
        <div className="pointer-events-none absolute inset-x-4 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.75rem)] bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.25rem)] flex items-center justify-center">
          <img
            ref={img}
            src={src}
            alt=""
            draggable={false}
            className={cn('pointer-events-auto max-h-full max-w-full object-contain shadow-2xl', !zoomed && 'rounded-lg')}
            style={{
              transform: `translate(${view.x + swipe}px, ${view.y}px) scale(${view.scale})`,
              transition: touching ? 'none' : 'transform 150ms ease-out',
            }}
          />
        </div>
      </div>
      <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-white/15 p-1">
        {many && (
          <button type="button" onClick={() => onStep(-1)} disabled={!canPrev} className={barButton} aria-label="Imagem anterior">
            <ChevronLeft className="size-5" />
          </button>
        )}
        <button type="button" onClick={() => zoomBy(1 / STEP_ZOOM)} disabled={!zoomed} className={barButton} aria-label="Diminuir zoom">
          <Minus className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setView(FIT)}
          className="h-10 min-w-14 rounded-full px-1 text-sm text-white tabular-nums"
          aria-label="Voltar ao tamanho da tela"
        >
          {Math.round(view.scale * 100)}%
        </button>
        <button type="button" onClick={() => zoomBy(STEP_ZOOM)} disabled={view.scale >= MAX_ZOOM} className={barButton} aria-label="Aumentar zoom">
          <Plus className="size-5" />
        </button>
        {many && (
          <button type="button" onClick={() => onStep(1)} disabled={!canNext} className={barButton} aria-label="Próxima imagem">
            <ChevronRight className="size-5" />
          </button>
        )}
      </div>
    </>
  )
}

/**
 * Imagem ampliada por cima do chat, com zoom; com várias, passa de lado deslizando, pelas setas ou
 * pelo teclado. "Abrir original" leva ao arquivo inteiro.
 */
export function ImageViewer({
  images,
  index,
  from,
  onIndexChange,
  open,
  onOpenChange,
}: {
  images: string[]
  index: number
  /** Quem mandou ("Claude", "Você"), no selo de cima junto com a posição. */
  from?: string
  onIndexChange: (index: number) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const src = images[index] ?? images[0]
  const many = images.length > 1
  const go = (step: number) => {
    const next = index + step
    if (next >= 0 && next < images.length) onIndexChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-dvh w-screen max-w-none touch-none overflow-hidden rounded-none border-0 bg-black/85 p-0 ring-0 sm:max-w-none"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') go(-1)
          if (e.key === 'ArrowRight') go(1)
        }}
      >
        <DialogTitle className="sr-only">Imagem</DialogTitle>
        {/* Uma por vez: trocar de imagem volta o zoom ao normal. */}
        {src && (
          <Stage
            key={src}
            src={src}
            many={many}
            canPrev={index > 0}
            canNext={index < images.length - 1}
            onStep={go}
            onClose={() => onOpenChange(false)}
          />
        )}
        {/* As vizinhas já carregam, para passar sem esperar. */}
        {[images[index - 1], images[index + 1]].map((near) => near && <img key={near} src={near} alt="" className="hidden" />)}
        {(from || many) && (
          <span className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 rounded-full bg-white/15 px-3 py-2 text-sm text-white tabular-nums">
            {[from, many && `${index + 1} / ${images.length}`].filter(Boolean).join(' · ')}
          </span>
        )}
        <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 flex gap-2">
          <a href={src} target="_blank" rel="noreferrer" className="rounded-full bg-white/15 p-2.5 text-white" aria-label="Abrir original">
            <ExternalLink className="size-5" />
          </a>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-full bg-white/15 p-2.5 text-white" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Miniatura que abre a imagem ampliada ao tocar. Com `gallery` (as imagens da sequência, na ordem),
 * dá para passar de lado pelas outras a partir desta.
 */
export function ImageThumb({
  src,
  gallery,
  from,
  alt,
  className,
}: {
  src: string
  gallery?: string[]
  from?: string
  alt?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const images = gallery?.includes(src) ? gallery : [src]
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIndex(images.indexOf(src))
          setOpen(true)
        }}
        className="shrink-0 overflow-hidden rounded-xl border bg-muted"
        aria-label="Ampliar imagem"
      >
        <img src={src} alt={alt ?? ''} loading="lazy" className={cn('block object-cover', className)} />
      </button>
      <ImageViewer images={images} index={index} from={from} onIndexChange={setIndex} open={open} onOpenChange={setOpen} />
    </>
  )
}
