import { Check, Circle, Crop, MoveUpRight, Pencil, Undo2, X, type LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { withImage, type Attachment } from '@/lib/attachments'
import { cn } from '@/lib/utils'

type Point = { x: number; y: number }
type Rect = { x: number; y: number; w: number; h: number }
type Tool = 'pen' | 'arrow' | 'circle' | 'crop'
/** Marcações em coordenadas da imagem inteira; só viram pixels ao salvar, então dá para desfazer uma a uma. */
type Mark =
  | { kind: 'pen'; color: string; width: number; points: Point[] }
  | { kind: 'arrow' | 'circle'; color: string; width: number; from: Point; to: Point }
  | { kind: 'crop'; rect: Rect }

const TOOLS: { tool: Tool; label: string; icon: LucideIcon }[] = [
  { tool: 'pen', label: 'Caneta', icon: Pencil },
  { tool: 'arrow', label: 'Seta', icon: MoveUpRight },
  { tool: 'circle', label: 'Círculo', icon: Circle },
  { tool: 'crop', label: 'Recortar', icon: Crop },
]
const COLORS = [
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#facc15', label: 'Amarelo' },
  { value: '#22c55e', label: 'Verde' },
  { value: '#ffffff', label: 'Branco' },
  { value: '#111111', label: 'Preto' },
]

/** Recorte a partir de dois cantos quaisquer. */
function rectOf(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

function paint(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, mark: Mark) {
  if (mark.kind === 'crop') return
  ctx.strokeStyle = mark.color
  ctx.lineWidth = mark.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (mark.kind === 'pen') {
    const [first, ...rest] = mark.points
    if (!first) return
    ctx.moveTo(first.x, first.y)
    for (const p of rest) ctx.lineTo(p.x, p.y)
    if (!rest.length) ctx.lineTo(first.x + 0.01, first.y)
  } else if (mark.kind === 'arrow') {
    const { from, to } = mark
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    const head = mark.width * 4
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    for (const side of [-1, 1]) {
      ctx.moveTo(to.x, to.y)
      ctx.lineTo(to.x - head * Math.cos(angle + (side * Math.PI) / 7), to.y - head * Math.sin(angle + (side * Math.PI) / 7))
    }
  } else {
    const r = rectOf(mark.from, mark.to)
    ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2)
  }
  ctx.stroke()
}

/** Vale guardar? Toques sem arrastar não viram marcação (o da caneta vira um ponto). */
function meaningful(mark: Mark, min: number): boolean {
  if (mark.kind === 'pen') return mark.points.length > 0
  if (mark.kind === 'crop') return mark.rect.w > min && mark.rect.h > min
  return Math.hypot(mark.to.x - mark.from.x, mark.to.y - mark.from.y) > min
}

function Editor({ attachment, onDone, onCancel }: { attachment: Attachment; onDone: (next: Attachment) => void; onCancel: () => void }) {
  const area = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [marks, setMarks] = useState<Mark[]>([])
  const [draft, setDraft] = useState<Mark | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0]!.value)
  const [saving, setSaving] = useState(false)
  /** Onde o dedo começou: o recorte vai deste canto até o dedo. */
  const start = useRef<Point>({ x: 0, y: 0 })

  useEffect(() => {
    const img = new Image()
    img.onload = () => setImage(img)
    img.src = `data:${attachment.mediaType};base64,${attachment.data}`
  }, [attachment])

  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    // Tamanho sem o espaçamento interno, que é só área de toque em volta da imagem.
    const observer = new ResizeObserver(([entry]) => entry && setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // O que aparece: a imagem inteira ou o último recorte.
  const full: Rect = { x: 0, y: 0, w: image?.naturalWidth ?? 1, h: image?.naturalHeight ?? 1 }
  const crop = marks.findLast((m) => m.kind === 'crop')
  const view = crop?.kind === 'crop' ? crop.rect : full
  const scale = Math.min(size.w / view.w, size.h / view.h) || 1
  const width = Math.max(3, Math.round(Math.max(full.w, full.h) * 0.006))

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx || !image) return
    const dpr = window.devicePixelRatio || 1
    el.width = Math.round(view.w * scale * dpr)
    el.height = Math.round(view.h * scale * dpr)
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -view.x * dpr * scale, -view.y * dpr * scale)
    ctx.drawImage(image, 0, 0)
    for (const m of marks) paint(ctx, m)
    if (draft?.kind === 'crop') {
      // Fora do recorte escurece; dentro, a borda tracejada.
      const r = draft.rect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      ctx.beginPath()
      ctx.rect(view.x, view.y, view.w, view.h)
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.fill('evenodd')
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2 / scale
      ctx.setLineDash([6 / scale, 4 / scale])
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.setLineDash([])
    } else if (draft) {
      paint(ctx, draft)
    }
  }, [image, marks, draft, view.x, view.y, view.w, view.h, scale])

  /** Toque na tela → ponto da imagem; fora dela (ex.: recorte começando na borda), encosta na beirada. */
  function point(e: PointerEvent<HTMLDivElement>): Point {
    const r = canvas.current!.getBoundingClientRect()
    const x = view.x + (e.clientX - r.left) / scale
    const y = view.y + (e.clientY - r.top) / scale
    return { x: Math.min(view.x + view.w, Math.max(view.x, x)), y: Math.min(view.y + view.h, Math.max(view.y, y)) }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!image || !e.isPrimary) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = point(e)
    if (tool === 'pen') setDraft({ kind: 'pen', color, width, points: [p] })
    else if (tool === 'crop') setDraft({ kind: 'crop', rect: { ...p, w: 0, h: 0 } })
    else setDraft({ kind: tool, color, width, from: p, to: p })
    start.current = p
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!draft || !e.isPrimary) return
    const p = point(e)
    if (draft.kind === 'pen') setDraft({ ...draft, points: [...draft.points, p] })
    else if (draft.kind === 'crop') setDraft({ kind: 'crop', rect: rectOf(start.current, p) })
    else setDraft({ ...draft, to: p })
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!draft || !e.isPrimary) return
    if (meaningful(draft, 12 / scale)) {
      const done: Mark = draft.kind === 'crop' ? { kind: 'crop', rect: draft.rect } : draft
      setMarks((list) => [...list, done])
    }
    setDraft(null)
  }

  async function save() {
    if (!image) return
    setSaving(true)
    try {
      const r = { x: Math.round(view.x), y: Math.round(view.y), w: Math.round(view.w), h: Math.round(view.h) }
      const out = new OffscreenCanvas(r.w, r.h)
      const ctx = out.getContext('2d')!
      ctx.translate(-r.x, -r.y)
      ctx.drawImage(image, 0, 0)
      for (const m of marks) paint(ctx, m)
      // Print continua PNG para o texto ficar nítido; foto vira JPEG.
      const type = attachment.mediaType === 'image/png' ? 'image/png' : 'image/jpeg'
      onDone(await withImage(attachment, await out.convertToBlob({ type, quality: 0.9 })))
    } catch (err) {
      toast.error(`Não deu para salvar a imagem: ${(err as Error).message}`)
      setSaving(false)
    }
  }

  const button = 'flex items-center justify-center rounded-full text-white disabled:opacity-30'
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={onCancel} className={cn(button, 'size-10 bg-white/15')} aria-label="Cancelar">
          <X className="size-5" />
        </button>
        <span className="flex-1 text-sm font-medium text-white">Marcar imagem</span>
        <button
          type="button"
          onClick={() => setMarks((list) => list.slice(0, -1))}
          disabled={!marks.length}
          className={cn(button, 'size-10 bg-white/15')}
          aria-label="Desfazer"
        >
          <Undo2 className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!marks.length || saving}
          className={cn(button, 'h-10 gap-1.5 bg-white px-4 text-sm font-medium text-black')}
        >
          <Check className="size-4" /> Pronto
        </button>
      </div>

      {/* O toque vale na área toda, não só na imagem: dá para começar o recorte pela borda. */}
      <div
        ref={area}
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center p-3"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDraft(null)}
      >
        <canvas ref={canvas} className="rounded-sm" style={{ width: view.w * scale, height: view.h * scale }} />
      </div>

      <div className="shrink-0 space-y-3 px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className={cn('flex justify-center gap-3', tool === 'crop' && 'invisible')}>
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={cn('size-8 rounded-full border-2 border-white/30', color === c.value && 'ring-2 ring-white ring-offset-2 ring-offset-black')}
              style={{ backgroundColor: c.value }}
              aria-label={c.label}
              aria-pressed={color === c.value}
            />
          ))}
        </div>
        <div className="flex justify-center gap-2">
          {TOOLS.map(({ tool: t, label, icon: Icon }) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              className={cn('flex h-12 w-18 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] text-white/70', tool === t && 'bg-white/15 text-white')}
              aria-pressed={tool === t}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Marcar um print antes de enviar: caneta, seta, círculo e recorte, com desfazer. "Pronto" troca o
 * anexo pela versão marcada; cancelar (ou voltar) deixa como estava.
 */
export function ImageEditor({
  attachment,
  onOpenChange,
  onSave,
}: {
  attachment: Attachment | null
  onOpenChange: (open: boolean) => void
  onSave: (next: Attachment) => void
}) {
  return (
    <Dialog open={Boolean(attachment)} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-dvh w-screen max-w-none touch-none overflow-hidden rounded-none border-0 bg-black p-0 ring-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">Marcar imagem</DialogTitle>
        {attachment && (
          <Editor
            attachment={attachment}
            onCancel={() => onOpenChange(false)}
            onDone={(next) => {
              onSave(next)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
