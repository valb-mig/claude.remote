import { Bot, Check, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { api, errorMessage } from '@/lib/api'
import { shortPath } from '@/lib/format'
import type { Item } from './items'
import { ToolDetails } from './activity'

type Props = Extract<Item, { type: 'approval' }> & { sessionId: string; actionable: boolean }

const RESOLVED = {
  allow: { icon: Check, label: 'Permitido' },
  deny: { icon: X, label: 'Negado' },
  cancelled: { icon: X, label: 'Cancelado' },
} as const

export function ApprovalCard({ sessionId, req, resolution, actionable, agent }: Props) {
  const [busy, setBusy] = useState<'allow' | 'deny' | 'always' | null>(null)

  if (resolution) {
    const { icon: Icon, label } = RESOLVED[resolution]
    return (
      <div className="flex min-w-0 items-center gap-2 px-2 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        {label}: {req.toolName}
        {agent && <span className="truncate">· subagente “{agent}”</span>}
      </div>
    )
  }

  async function decide(kind: 'allow' | 'deny' | 'always') {
    setBusy(kind)
    try {
      await api.approve(sessionId, req.requestId, { allow: kind !== 'deny', always: kind === 'always' })
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(null)
    }
  }

  const use = { kind: 'tool_use' as const, id: req.requestId, name: req.toolName, input: req.input }
  return (
    <Card size="sm" className="border-amber-500/50 ring-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
          {req.title ?? `Permitir ${req.toolName}?`}
        </CardTitle>
        {agent && (
          <CardDescription className="flex min-w-0 items-center gap-1.5">
            <Bot className="size-3.5 shrink-0" />
            <span className="truncate">Pedido do subagente “{agent}”</span>
          </CardDescription>
        )}
        {req.decisionReason && <CardDescription>{req.decisionReason}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-1.5">
        <ToolDetails use={use} />
        {req.blockedPath && (
          <p className="text-xs text-muted-foreground">Fora das pastas permitidas: {shortPath(req.blockedPath)}</p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {actionable ? (
          <>
            <Button size="lg" className="flex-1" disabled={busy !== null} onClick={() => decide('allow')}>
              Permitir
            </Button>
            <Button size="lg" variant="outline" className="flex-1" disabled={busy !== null} onClick={() => decide('deny')}>
              Negar
            </Button>
            {req.canAlwaysAllow && (
              <Button size="lg" variant="ghost" className="w-full" disabled={busy !== null} onClick={() => decide('always')}>
                Sempre permitir nesta sessão
              </Button>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Sem resposta: a sessão não está mais aberta no painel.</p>
        )}
      </CardFooter>
    </Card>
  )
}
