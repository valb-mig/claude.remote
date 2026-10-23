import { ChevronRight, OctagonAlert, TriangleAlert } from 'lucide-react'
import { Link } from 'wouter'
import { Skeleton } from '@/components/ui/skeleton'
import { bytes, resetTime } from '@/lib/format'
import { useMachines } from '@/lib/machines'
import { useStore } from '@/lib/store'
import type { UsageWindow } from '@/lib/types'
import { cn } from '@/lib/utils'

type Severity = 'normal' | 'warning' | 'critical'

// A barra carrega a gravidade (padrão → alerta → crítico) e o trilho é um tom mais claro
// da mesma cor; alerta e crítico vêm sempre com ícone, para não depender só da cor.
const SEVERITY: Record<Severity, { fill: string; track: string; icon?: typeof TriangleAlert; label?: string }> = {
  normal: { fill: 'bg-sky-500', track: 'bg-sky-500/20' },
  warning: { fill: 'bg-[#fab219]', track: 'bg-[#fab219]/25', icon: TriangleAlert, label: 'alto' },
  critical: { fill: 'bg-[#d03b3b]', track: 'bg-[#d03b3b]/25', icon: OctagonAlert, label: 'crítico' },
}

export const severityOf = (percent: number): Severity => (percent >= 90 ? 'critical' : percent >= 70 ? 'warning' : 'normal')

export function Meter({
  label,
  value,
  percent,
  detail,
  className,
}: {
  label: string
  value: string
  percent: number
  detail?: string
  className?: string
}) {
  const s = SEVERITY[severityOf(percent)]
  const Icon = s.icon
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
          {Icon && (
            <Icon
              className={cn('size-3.5 self-center', severityOf(percent) === 'critical' ? 'text-[#d03b3b]' : 'text-[#c98a00] dark:text-[#fab219]')}
              aria-label={s.label}
            />
          )}
          {value}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className={cn('h-1.5 overflow-hidden rounded-full', s.track)}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500', s.fill)} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      {detail && <div className="truncate text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  )
}

export function WindowMeter({ label, window }: { label: string; window: UsageWindow | null }) {
  if (!window || window.utilization === null) return <Meter label={label} value="—" percent={0} detail="sem dado" />
  return (
    <Meter
      label={label}
      value={`${Math.round(window.utilization)}%`}
      percent={window.utilization}
      detail={window.resetsAt ? `reseta ${resetTime(window.resetsAt)}` : undefined}
    />
  )
}

/** Bloco da home: o estado do PC e do plano num relance; toque abre a aba Computador. */
export function PcStatus({ machine }: { machine: string }) {
  const system = useStore((s) => s.systems[machine])
  const usage = useStore((s) => s.usages[machine])
  // Com várias máquinas, o quadro diz de qual é.
  const name = useMachines((s) => (s.machines.length > 1 ? s.machines.find((m) => m.id === machine)?.name : undefined))
  const plan = usage?.plan

  return (
    <Link href="/computador" className="mx-4 mb-3 block rounded-xl border bg-card p-3 active:bg-muted/50">
      <div className="mb-2.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{name ? `${name} · PC e uso do Claude` : 'PC e uso do Claude'}</span>
        <ChevronRight className="size-4" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {system ? (
          <>
            <Meter
              label="CPU"
              value={`${Math.round(system.cpu.percent)}%`}
              percent={system.cpu.percent}
              detail={`carga ${system.cpu.load[0].toLocaleString('pt-BR')}`}
            />
            <Meter
              label="Memória"
              value={`${bytes(system.memory.used)}`}
              percent={(system.memory.used / system.memory.total) * 100}
              detail={`de ${bytes(system.memory.total)}`}
            />
          </>
        ) : (
          <>
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </>
        )}
        {plan?.available ? (
          <>
            <WindowMeter label="Claude · 5 h" window={plan.fiveHour} />
            <WindowMeter label="Claude · semana" window={plan.sevenDay} />
          </>
        ) : usage?.planError || plan ? (
          <p className="col-span-2 text-xs text-muted-foreground">Limites do plano indisponíveis no momento.</p>
        ) : (
          <>
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </>
        )}
      </div>
    </Link>
  )
}
