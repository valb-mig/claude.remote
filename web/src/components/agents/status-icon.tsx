import { Ban, CheckCircle2, CircleAlert, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AgentStatus } from './model'
import { STATUS } from './status'

export function AgentStatusIcon({ status, className }: { status: AgentStatus; className?: string }) {
  switch (status) {
    case 'running':
      return (
        <span className={cn('relative flex size-3.5 shrink-0 items-center justify-center', className)} aria-hidden>
          <span className="absolute size-2 animate-ping rounded-full bg-sky-500/60 motion-reduce:animate-none" />
          <span className="size-2 rounded-full bg-sky-500" />
        </span>
      )
    case 'waiting':
      return <CircleAlert className={cn('size-3.5 shrink-0 text-amber-600 dark:text-amber-400', className)} aria-hidden />
    case 'done':
      return <CheckCircle2 className={cn('size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400', className)} aria-hidden />
    case 'failed':
      return <XCircle className={cn('size-3.5 shrink-0 text-red-600 dark:text-red-400', className)} aria-hidden />
    case 'stopped':
      return <Ban className={cn('size-3.5 shrink-0 text-muted-foreground', className)} aria-hidden />
  }
}

export function AgentStatusBadge({ status, className }: { status: AgentStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 border-transparent', STATUS[status].badge, className)}>
      {status === 'running' && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {STATUS[status].label}
    </Badge>
  )
}
