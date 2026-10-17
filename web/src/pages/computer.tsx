import { RefreshCw } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout'
import { Meter, WindowMeter } from '@/components/pc-status'
import { PushSettings } from '@/components/push-settings'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api'
import { bytes, relativeTime, uptime } from '@/lib/format'
import { reconnectNow, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const CONNECTION = {
  open: { label: 'Conectado', dot: 'bg-emerald-500' },
  connecting: { label: 'Conectando…', dot: 'bg-amber-500 animate-pulse' },
  closed: { label: 'Desconectado', dot: 'bg-red-500' },
} as const

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

export function ComputerPage() {
  const connection = useStore((s) => s.connection)
  const catalog = useStore((s) => s.catalog)
  const system = useStore((s) => s.system)
  const usage = useStore((s) => s.usage)
  const [health, setHealth] = useState<Awaited<ReturnType<typeof api.health>> | null>(null)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    api.health().then(setHealth, () => setHealth(null))
  }, [connection])

  const counts = useMemo(() => {
    const pc = catalog.filter((c) => c.owner === 'pc')
    return {
      pc: pc.length,
      pcBusy: pc.filter((c) => c.state === 'running').length,
      pcWaiting: pc.filter((c) => c.state === 'waiting').length,
      panel: catalog.filter((c) => c.owner === 'panel').length,
      saved: catalog.length,
    }
  }, [catalog])

  const c = CONNECTION[connection]
  return (
    <>
      <PageHeader title="Computador" />
      <div className="space-y-4 px-4 pb-6">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Conexão</CardTitle>
            <CardDescription>O PC executa tudo; o celular só envia mensagens e respostas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row
              label="Status"
              value={
                <span className="flex items-center gap-2">
                  <span className={cn('size-2 rounded-full', c.dot)} />
                  {c.label}
                </span>
              }
            />
            <Row label="Servidor" value={health ? `iniciado ${relativeTime(health.startedAt)}` : '—'} />
            <Row label="Endereço" value={<span className="font-mono text-xs">{health?.tailnetHost ?? location.host}</span>} />
            <Button variant="outline" className="mt-2 w-full" onClick={() => reconnectNow(true)}>
              <RefreshCw /> Reconectar
            </Button>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Sistema</CardTitle>
            {system && <CardDescription>Ligado há {uptime(system.uptimeSec)}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {system ? (
              <>
                <Meter
                  label={`CPU · ${system.cpu.cores} núcleos`}
                  value={`${Math.round(system.cpu.percent)}%`}
                  percent={system.cpu.percent}
                  detail={`carga média ${system.cpu.load.map((l) => l.toLocaleString('pt-BR')).join(' · ')} (1, 5 e 15 min)`}
                />
                <Meter
                  label="Memória"
                  value={`${bytes(system.memory.used)} de ${bytes(system.memory.total)}`}
                  percent={(system.memory.used / system.memory.total) * 100}
                />
                {system.memory.swapTotal > 0 && (
                  <Meter
                    label="Swap"
                    value={`${bytes(system.memory.swapUsed)} de ${bytes(system.memory.swapTotal)}`}
                    percent={(system.memory.swapUsed / system.memory.swapTotal) * 100}
                  />
                )}
                <Row
                  label="Processos do Claude Code"
                  value={`${system.claude.processes} · ${bytes(system.claude.rss)}`}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Lendo o PC…</p>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Uso do Claude</CardTitle>
            <CardDescription>
              {usage?.plan?.subscription
                ? `Plano ${usage.plan.subscription.charAt(0).toUpperCase()}${usage.plan.subscription.slice(1)}`
                : 'Limites do plano'}
              {usage?.planAt ? ` · atualizado ${relativeTime(usage.planAt)}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usage?.plan?.available ? (
              <>
                <WindowMeter label="Sessão (janela de 5 h)" window={usage.plan.fiveHour} />
                <WindowMeter label="Semana (todos os modelos)" window={usage.plan.sevenDay} />
                {usage.plan.models.map((m) => (
                  <WindowMeter key={m.name} label={`Semana · ${m.name}`} window={m} />
                ))}
                {usage.plan.extraUsage && (
                  <WindowMeter label="Uso extra (mensal)" window={{ utilization: usage.plan.extraUsage.utilization, resetsAt: null }} />
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {usage?.plan && !usage.plan.available
                  ? 'Esta conta não tem limites de plano (chave de API).'
                  : usage?.planError
                    ? `Indisponível: ${usage.planError}`
                    : 'Consultando…'}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Mesmo dado do /usage do Claude Code (recurso experimental do SDK), atualizado a cada 90 s.
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Sessões</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label="Abertas no PC" value={`${counts.pc} (${counts.pcBusy} trabalhando, ${counts.pcWaiting} aguardando)`} />
            <Row label="Abertas no painel" value={counts.panel} />
            <Row label="Conversas salvas" value={counts.saved} />
          </CardContent>
        </Card>

        <PushSettings />

        <Card size="sm">
          <CardHeader>
            <CardTitle>Aparência</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={theme ?? 'system'} onValueChange={setTheme}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Seguir o sistema</SelectItem>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Segurança</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>O painel só responde pela sua rede Tailscale e apenas para a conta dona do PC.</p>
            <p>As credenciais do Claude Code ficam no PC.</p>
            <p className="pt-2 text-xs">Versão {__BUILD_TIME__}</p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
