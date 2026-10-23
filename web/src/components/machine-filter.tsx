import { Server } from 'lucide-react'
import { HOME, setMachineFilter, useMachineFilter, useMachines } from '@/lib/machines'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const DOT = {
  open: 'bg-emerald-500',
  connecting: 'bg-amber-500 animate-pulse',
  closed: 'bg-red-500',
} as const

/**
 * Pílulas para escolher a máquina (só com mais de uma): a bolinha mostra a conexão com cada uma.
 * `all` acrescenta "Todas" (`null`).
 */
export function MachineChips({
  value,
  onChange,
  all = false,
  className,
}: {
  value: string | null
  onChange: (machine: string | null) => void
  all?: boolean
  className?: string
}) {
  const machines = useMachines((s) => s.machines)
  const connections = useStore((s) => s.connections)
  if (machines.length < 2) return null
  const chip = (active: boolean) =>
    cn(
      'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
      active ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
    )
  return (
    <div className={cn('flex gap-1.5 overflow-x-auto', className)}>
      {all && (
        <button type="button" className={chip(value === null)} aria-pressed={value === null} onClick={() => onChange(null)}>
          Todas
        </button>
      )}
      {machines.map((m) => (
        <button key={m.id} type="button" className={chip(value === m.id)} aria-pressed={value === m.id} onClick={() => onChange(m.id)}>
          <span className={cn('size-1.5 rounded-full', DOT[connections[m.id] ?? 'connecting'])} />
          <Server className="size-3" />
          {m.name}
        </button>
      ))}
    </div>
  )
}

/** Filtro de máquinas do topo (lista de sessões, projetos, computador); sem "Todas", vale a desta página. */
export function MachineFilter({ all = true, className }: { all?: boolean; className?: string }) {
  const filter = useMachineFilter()
  return <MachineChips value={all ? filter : (filter ?? HOME)} onChange={setMachineFilter} all={all} className={className} />
}
