import {
  Bot,
  BrainCircuit,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  Download,
  FileImage,
  Image as ImageIcon,
  Info,
  Lightbulb,
  ListTree,
  Loader2,
  LocateFixed,
  MessageCircleQuestion,
  MessageSquareText,
  Minus,
  Network,
  PanelRight,
  Plus,
  Scan,
  Share2,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { toast } from 'sonner'
import { STATUS } from '@/components/agents/status'
import { AgentStatusIcon } from '@/components/agents/status-icon'
import { toolIcon } from '@/components/chat/activity'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { errorMessage } from '@/lib/api'
import { useWidth } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { canShareImage, download, mapImage, type ImageFormat } from './export'
import { branchColor, edgePath, edgeWidth, isLeaf, layout, type Box, type Mode } from './layout'
import { focusOf, fold, type MindKind, type MindNode } from './model'

const MODES: { mode: Mode; label: string; icon: LucideIcon }[] = [
  { mode: 'map', label: 'Mapa (galhos dos dois lados)', icon: Network },
  { mode: 'right', label: 'Galhos para a direita', icon: PanelRight },
  { mode: 'tree', label: 'Árvore (de cima para baixo)', icon: ListTree },
]

/** O maior arranjo que cabe legível na largura: o mapa completo só em tela grande. */
const autoMode = (width: number): Mode => (width >= 1300 ? 'map' : width >= 720 ? 'right' : 'tree')
const MIN_ZOOM = 0.3
const MAX_ZOOM = 1.6
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100))
/** Espaço no topo para a barra de ferramentas não cobrir o desenho. */
const TOOLBAR = 44

const KIND_ICON: Partial<Record<MindKind, LucideIcon>> = {
  step: Lightbulb,
  answer: MessageSquareText,
  approval: ShieldAlert,
  question: MessageCircleQuestion,
  agent: Bot,
  notice: Info,
}

const active = (n: MindNode) => n.status === 'running' || n.status === 'waiting'

function NodeView({ box, onTap }: { box: Box; onTap: (n: MindNode) => void }) {
  const n = box.node
  const color = branchColor(n.branch)
  const style: CSSProperties = { left: box.x, top: box.y, width: box.w, height: box.h }
  const enter = 'animate-in fade-in-0 zoom-in-95 duration-300'
  const status = n.status !== 'done' && <AgentStatusIcon status={n.status} className="size-3.5" />

  if (n.kind === 'root') {
    return (
      <div style={style} className="absolute flex items-center gap-2.5 rounded-2xl bg-primary px-3.5 text-primary-foreground shadow-md">
        <BrainCircuit className="size-5 shrink-0" />
        <div className="min-w-0">
          <div className="line-clamp-2 text-[13px] leading-tight font-semibold">{n.label}</div>
          {n.meta && <div className="truncate text-[11px] opacity-70">{n.meta}</div>}
        </div>
      </div>
    )
  }

  if (n.kind === 'turn') {
    return (
      <button
        type="button"
        onClick={() => onTap(n)}
        style={{ ...style, borderColor: color }}
        aria-expanded={n.folded === undefined}
        className={cn(
          'absolute flex items-center gap-2 rounded-xl border-2 bg-card px-2 text-left shadow-sm transition-shadow hover:shadow-md active:scale-[0.98]',
          enter,
          active(n) && STATUS[n.status].node,
        )}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: color }}>
          {n.branch + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[12.5px] leading-tight font-medium">{n.label}</div>
          {n.meta && <div className="truncate text-[11px] text-muted-foreground">{n.meta}</div>}
        </div>
        {status}
        <ChevronRight
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', box.side === -1 && 'rotate-180', n.folded === undefined && 'opacity-30')}
        />
      </button>
    )
  }

  if (isLeaf(n)) {
    const icon = n.kind === 'more' ? (n.label.startsWith('+') ? ChevronsUpDown : ChevronsDownUp) : n.kind === 'notice' ? Info : toolIcon(n.tool ?? '')
    const failed = n.status === 'failed'
    return (
      <button
        type="button"
        onClick={() => onTap(n)}
        style={style}
        title={n.label}
        className={cn(
          'absolute flex items-center gap-1.5 rounded-full border bg-background px-2.5 text-left text-[11.5px] shadow-xs transition-shadow hover:shadow-md active:scale-[0.98]',
          enter,
          n.kind === 'more' && 'border-dashed text-muted-foreground',
          failed && 'border-red-500/50 text-red-700 dark:text-red-300',
          active(n) && STATUS[n.status].node,
        )}
      >
        {n.status === 'running' ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />
        ) : (
          createElement(icon, { className: 'size-3.5 shrink-0', style: failed || n.kind === 'more' ? undefined : { color } })
        )}
        <span className={cn('min-w-0 flex-1 truncate', (n.kind === 'command' || n.kind === 'search') && 'font-mono text-[11px]')}>{n.label}</span>
        {n.meta && <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">{n.meta}</span>}
      </button>
    )
  }

  const Icon = KIND_ICON[n.kind] ?? Lightbulb
  const waiting = n.status === 'waiting'
  return (
    <button
      type="button"
      onClick={() => onTap(n)}
      style={style}
      className={cn(
        'absolute flex items-center gap-2 overflow-hidden rounded-xl border bg-card pr-2 pl-3.5 text-left shadow-xs transition-shadow hover:shadow-md active:scale-[0.98]',
        enter,
        waiting && 'bg-amber-50 dark:bg-amber-950/40',
        active(n) && STATUS[n.status].node,
      )}
    >
      <span className="absolute inset-y-2 left-1 w-[3px] rounded-full" style={{ background: color }} />
      <Icon className={cn('size-4 shrink-0', waiting ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[12px] leading-snug">{n.label}</div>
        {n.meta && (
          <div className={cn('truncate text-[10.5px]', waiting ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>{n.meta}</div>
        )}
      </div>
      {status}
    </button>
  )
}

/**
 * O mapa mental da conversa, ao vivo. Tocar num turno abre ou fecha os passos dele; num passo ou
 * ação, leva ao ponto do chat; num subagente, abre a folha dele; num pedido, ao cartão de resposta.
 */
export function MindMap({
  root,
  title,
  onJump,
  onAgent,
  onRequest,
  side,
}: {
  root: MindNode
  title: string
  onJump: (itemKey: string) => void
  onAgent: (id: string) => void
  onRequest: (itemKey: string) => void
  /** Lado a lado com o chat: `null` se a tela não comporta. */
  side: { on: boolean; toggle: () => void } | null
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const width = useWidth(scroller)
  const [open, setOpen] = useState<ReadonlyMap<string, boolean>>(new Map())
  const visible = useMemo(() => fold(root, open), [root, open])
  const [modePick, setMode] = useState<Mode | null>(null)
  const mode = modePick ?? autoMode(width)
  const g = useMemo(() => layout(visible, mode, width || 360), [visible, mode, width])
  const fit = width ? Math.min(1, width / g.width) : 1
  const [zoomPick, setZoom] = useState<number | null>(null)
  const scale = zoomPick ?? (mode === 'tree' ? 1 : Math.max(fit, 0.6))
  const [follow, setFollow] = useState(true)

  // Ao vivo: mantém à vista o pedido que espera você ou o passo em andamento.
  const focus = useMemo(() => focusOf(visible), [visible])
  const focusBox = g.boxes.find((b) => b.node.id === focus.id)
  const fx = focusBox ? focusBox.x + focusBox.w / 2 : null
  const fy = focusBox ? focusBox.y + focusBox.h / 2 : null
  const placed = useRef(false)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !follow || fx === null || fy === null || !width) return
    el.scrollTo({
      left: fx * scale - el.clientWidth / 2,
      top: TOOLBAR + fy * scale - el.clientHeight / 2,
      behavior: placed.current ? 'smooth' : 'auto',
    })
    placed.current = true
  }, [follow, fx, fy, scale, width])

  // Arrastar ou rolar com a mão solta o acompanhamento; o botão de mira volta a seguir.
  const touching = useRef(false)
  const wheelAt = useRef(0)
  const onScroll = () => {
    if (follow && (touching.current || Date.now() - wheelAt.current < 250)) setFollow(false)
  }

  // Pinça no celular e Ctrl + roda no PC mudam o zoom (a página em si não tem zoom no app).
  const scaleRef = useRef(scale)
  useLayoutEffect(() => {
    scaleRef.current = scale
  })
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let pinch: { dist: number; scale: number } | null = null
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { dist: dist(e.touches), scale: scaleRef.current }
    }
    const move = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      setZoom(clampZoom((pinch.scale * dist(e.touches)) / pinch.dist))
    }
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null
    }
    const wheel = (e: WheelEvent) => {
      wheelAt.current = Date.now()
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(clampZoom(scaleRef.current * (1 - e.deltaY * 0.002)))
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('wheel', wheel)
    }
  }, [])

  const toggle = (id: string, value: boolean) => setOpen((m) => new Map(m).set(id, value))
  const tap = (n: MindNode) => {
    if (n.kind === 'turn') return toggle(n.id, n.folded !== undefined)
    if (n.toggles) return toggle(n.toggles, n.label.startsWith('+'))
    if (n.agentId) return onAgent(n.agentId)
    if (n.requestId && n.itemKey) return onRequest(n.itemKey)
    if (n.itemKey) onJump(n.itemKey)
  }
  const anyFolded = visible.children.some((t) => t.folded !== undefined)
  const toggleAll = () => {
    const last = root.children.at(-1)?.id
    // Recolher tudo deixa aberto o turno atual, onde a conversa está.
    setOpen(new Map(root.children.map((t) => [t.id, anyFolded || t.id === last])))
  }

  const [exporting, setExporting] = useState(false)
  const shareable = useMemo(() => canShareImage(), [])
  const save = async (format: ImageFormat, share: boolean) => {
    setExporting(true)
    try {
      const file = await mapImage(g, title, format)
      if (share) await navigator.share({ files: [file], title })
      else download(file)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toast.error('Não deu para gerar a imagem', { description: errorMessage(err) })
    } finally {
      setExporting(false)
    }
  }

  const zoom = (by: number) => setZoom(clampZoom(scale + by))
  const nextMode = MODES[(MODES.findIndex((m) => m.mode === mode) + 1) % MODES.length]
  const ModeIcon = MODES.find((m) => m.mode === mode)!.icon

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <div
        ref={scroller}
        onScroll={onScroll}
        onPointerDown={() => (touching.current = true)}
        onPointerUp={() => (touching.current = false)}
        onPointerCancel={() => (touching.current = false)}
        className="min-h-0 flex-1 overflow-auto overscroll-contain bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] bg-size-[16px_16px]"
      >
        {root.children.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">O mapa aparece quando a conversa começar.</p>
        ) : (
          <div className="relative mx-auto" style={{ width: g.width * scale, height: g.height * scale, marginTop: TOOLBAR }}>
            <div className="absolute top-0 left-0 origin-top-left" style={{ width: g.width, height: g.height, transform: `scale(${scale})` }}>
              <svg width={g.width} height={g.height} className="absolute inset-0" aria-hidden>
                {g.edges.map((e) => (
                  <path
                    key={e.to.node.id}
                    d={edgePath(e, g.mode)}
                    fill="none"
                    stroke={branchColor(e.to.node.branch)}
                    strokeWidth={edgeWidth(e.to)}
                    strokeLinecap="round"
                    strokeOpacity={isLeaf(e.to.node) ? 0.55 : 0.85}
                    strokeDasharray={active(e.to.node) ? '6 5' : undefined}
                    className={cn(active(e.to.node) && 'motion-safe:animate-[agent-flow_0.9s_linear_infinite]')}
                  />
                ))}
              </svg>
              {g.boxes.map((box) => (
                <NodeView key={box.node.id} box={box} onTap={tap} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute top-2 right-2 left-2 flex justify-end">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border bg-background/85 p-0.5 shadow-sm backdrop-blur">
          <Button
            variant={follow ? 'ghost' : 'secondary'}
            size="icon-sm"
            onClick={() => setFollow(!follow)}
            aria-pressed={follow}
            aria-label={follow ? 'Acompanhando ao vivo: tocar para soltar' : 'Voltar a acompanhar ao vivo'}
            title={follow ? 'Acompanhando ao vivo' : 'Acompanhar ao vivo'}
            className={cn(follow && 'text-sky-600 dark:text-sky-400')}
          >
            <LocateFixed />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setMode(nextMode.mode)
              setZoom(null)
            }}
            aria-label={`Trocar para: ${nextMode.label}`}
            title={`Trocar para: ${nextMode.label}`}
          >
            <ModeIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={toggleAll} aria-label={anyFolded ? 'Abrir todos os turnos' : 'Recolher os turnos'} title={anyFolded ? 'Abrir todos' : 'Recolher'}>
            {anyFolded ? <ChevronsUpDown /> : <ChevronsDownUp />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => zoom(-0.1)} aria-label="Diminuir">
            <Minus />
          </Button>
          <button type="button" className="w-10 text-center text-xs text-muted-foreground tabular-nums" onClick={() => setZoom(1)} title="Tamanho real">
            {Math.round(scale * 100)}%
          </button>
          <Button variant="ghost" size="icon-sm" onClick={() => zoom(0.1)} aria-label="Aumentar">
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom(fit)} aria-label="Caber na tela" title="Caber na tela">
            <Scan />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" disabled={exporting || root.children.length === 0} aria-label="Salvar como imagem" title="Salvar como imagem">
                {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void save('png', false)}>
                <ImageIcon /> Baixar PNG
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void save('svg', false)}>
                <FileImage /> Baixar SVG
              </DropdownMenuItem>
              {shareable && (
                <DropdownMenuItem onSelect={() => void save('png', true)}>
                  <Share2 /> Compartilhar imagem
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {side && (
            <Button
              variant={side.on ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={side.toggle}
              aria-pressed={side.on}
              aria-label={side.on ? 'Só o mapa' : 'Chat e mapa lado a lado'}
              title={side.on ? 'Só o mapa' : 'Lado a lado com o chat'}
            >
              <Columns2 />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
