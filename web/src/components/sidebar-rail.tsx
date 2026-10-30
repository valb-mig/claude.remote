import { Armchair, FolderGit2, House, MessagesSquare, Monitor, OctagonAlert, PanelLeftClose, PanelLeftOpen, Plus, TriangleAlert } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { severityOf } from '@/components/pc-status'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { setComputerOpen, useComputer } from '@/lib/computer'
import { bytes, resetTime, shortDuration } from '@/lib/format'
import { HOME, useMachineFilter, useMachines } from '@/lib/machines'
import { setSidebarCollapsed, useSidebar } from '@/lib/sidebar'
import { useStore } from '@/lib/store'
import { useWakatimeToday } from '@/lib/wakatime'
import type { UsageWindow } from '@/lib/types'
import { cn } from '@/lib/utils'

// Mesmas cores do quadro do PC (pc-status.tsx): padrão → alerta → crítico, trilho no tom mais claro.
const RING = {
  normal: { stroke: 'stroke-sky-500', track: 'stroke-sky-500/20' },
  warning: { stroke: 'stroke-[#fab219]', track: 'stroke-[#fab219]/25' },
  critical: { stroke: 'stroke-[#d03b3b]', track: 'stroke-[#d03b3b]/25' },
  // Horas de hoje: encher é bom, e bater a meta fica em verde (ver o anel do WakaTime).
  done: { stroke: 'stroke-emerald-500', track: 'stroke-emerald-500/20' },
}
const R = 15
const CIRCUMFERENCE = 2 * Math.PI * R

/**
 * Anel de progresso com a porcentagem no meio; alerta e crítico vêm com ícone, para não depender
 * só da cor. `text` troca o que vai no meio e `level` desliga a escala de severidade, para o anel
 * em que encher não é problema nenhum.
 */
function Ring({
  label,
  percent,
  tip,
  text,
  level: fixed,
}: {
  label: string
  percent: number | null
  tip: string
  text?: string
  level?: keyof typeof RING
}) {
  const known = percent !== null
  const level = fixed ?? (known ? severityOf(percent) : 'normal')
  const Icon = level === 'critical' ? OctagonAlert : level === 'warning' ? TriangleAlert : null
  const fill = known ? Math.min(100, Math.max(0, percent)) : 0
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setComputerOpen(true)}
          aria-label={tip}
          className="flex w-14 flex-col items-center gap-0.5 rounded-lg py-1 hover:bg-muted/60"
        >
          <span className="relative size-10">
            <svg viewBox="0 0 36 36" className="size-10 -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r={R} fill="none" strokeWidth="3.5" className={known ? RING[level].track : 'stroke-muted'} />
              {known && (
                <circle
                  cx="18"
                  cy="18"
                  r={R}
                  fill="none"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE * (1 - fill / 100)}
                  className={cn('transition-[stroke-dashoffset] duration-500', RING[level].stroke)}
                />
              )}
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums">
              {text ?? (known ? `${Math.round(percent)}%` : '—')}
            </span>
          </span>
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            {Icon && (
              <Icon className={cn('size-2.5', level === 'critical' ? 'text-[#d03b3b]' : 'text-[#c98a00] dark:text-[#fab219]')} aria-hidden />
            )}
            {label}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{tip}</TooltipContent>
    </Tooltip>
  )
}

function windowTip(name: string, w: UsageWindow | null | undefined): string {
  if (!w || w.utilization === null) return `${name}: sem dado`
  return `${name}: ${Math.round(w.utilization)}%${w.resetsAt ? ` · reseta ${resetTime(w.resetsAt)}` : ''}`
}

/** Ícone da alça, com o nome ao passar o mouse. */
function RailItem({
  label,
  active,
  badge,
  href,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  badge?: number
  href?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  const className = cn(
    'relative flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-5',
    active && 'bg-muted text-foreground',
  )
  const content = (
    <>
      {children}
      {badge ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] leading-4 font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} aria-label={label} className={className}>
            {content}
          </Link>
        ) : (
          <button type="button" aria-label={label} onClick={onClick} className={className}>
            {content}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Alça do PC, sempre à esquerda: as abas e, embaixo, CPU, memória e os limites do Claude em anéis.
 * O botão do topo e Sessões abrem e recolhem a lista de conversas ao lado, como na barra do VS Code.
 */
export function SidebarRail() {
  const [location] = useLocation()
  const attention = useStore((s) => s.catalog.reduce((n, c) => n + (c.state === 'waiting' ? 1 : 0), 0))
  const machine = useMachineFilter() ?? HOME
  const system = useStore((s) => s.systems[machine])
  const usage = useStore((s) => s.usages[machine])
  // Com várias máquinas, os anéis dizem de qual é (a do filtro das Sessões).
  const name = useMachines((s) => (s.machines.length > 1 ? s.machines.find((m) => m.id === machine)?.name : undefined))
  const of = (text: string) => (name ? `${name} · ${text}` : text)
  const collapsed = useSidebar((s) => s.collapsed)
  const computer = useComputer((s) => s.open)
  const toggle = () => setSidebarCollapsed(!collapsed)
  const coding = useWakatimeToday(machine)
  const plan = usage?.plan?.available ? usage.plan : null
  const memory = system ? (system.memory.used / system.memory.total) * 100 : null

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="flex w-16 shrink-0 flex-col items-center gap-1 border-r py-3">
        <RailItem label={collapsed ? 'Abrir a lista de conversas' : 'Recolher a lista de conversas'} onClick={toggle}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </RailItem>
        <RailItem label="Nova conversa" href="/nova" active={location === '/nova'}>
          <Plus />
        </RailItem>
        <div className="my-1 h-px w-8 bg-border" />
        <RailItem label="Início" href="/" active={location === '/'}>
          <House />
        </RailItem>
        <RailItem
          label={attention ? `Sessões: ${attention} ${attention === 1 ? 'precisa' : 'precisam'} de você` : 'Sessões'}
          onClick={toggle}
          // Marcada enquanto a lista de conversas está aberta ao lado.
          active={!collapsed}
          badge={attention}
        >
          <MessagesSquare />
        </RailItem>
        <RailItem label="Projetos" href="/projetos" active={location.startsWith('/projetos')}>
          <FolderGit2 />
        </RailItem>
        {/* Abre por cima, sem tirar você da conversa (ver lib/computer.ts). */}
        <RailItem label="Computador" onClick={() => setComputerOpen(true)} active={computer}>
          <Monitor />
        </RailItem>
        <RailItem label="Salinha: seus claudinhos trabalhando" href="/salinha">
          <Armchair />
        </RailItem>

        <div className="mt-auto flex flex-col items-center gap-1.5">
          {coding && (
            <Ring
              label="Hoje"
              percent={(coding.seconds / (coding.goalHours * 3600)) * 100}
              level={coding.seconds >= coding.goalHours * 3600 ? 'done' : 'normal'}
              text={shortDuration(coding.seconds)}
              tip={of(`Codando hoje: ${coding.text} · meta de ${coding.goalHours} h (WakaTime)`)}
            />
          )}
          <Ring
            label="CPU"
            percent={system ? system.cpu.percent : null}
            tip={of(system ? `CPU: ${Math.round(system.cpu.percent)}% · carga ${system.cpu.load[0].toLocaleString('pt-BR')}` : 'CPU: carregando')}
          />
          <Ring
            label="Mem."
            percent={memory}
            tip={of(system ? `Memória: ${bytes(system.memory.used)} de ${bytes(system.memory.total)}` : 'Memória: carregando')}
          />
          <Ring label="5 h" percent={plan?.fiveHour?.utilization ?? null} tip={of(windowTip('Claude · 5 h', plan?.fiveHour))} />
          <Ring label="Semana" percent={plan?.sevenDay?.utilization ?? null} tip={of(windowTip('Claude · semana', plan?.sevenDay))} />
        </div>
      </aside>
    </TooltipProvider>
  )
}
