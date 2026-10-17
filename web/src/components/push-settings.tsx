import { Bell, BellOff, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { errorMessage } from '@/lib/api'
import { disablePush, enablePush, loadPrefs, pushStatus, savePrefs, testPush, type PushStatus } from '@/lib/push'
import type { PushPrefs } from '@/lib/types'

const OPTIONS: { key: keyof PushPrefs; label: string; description: string }[] = [
  { key: 'done', label: 'Quando terminar', description: 'Com a última resposta do Claude.' },
  {
    key: 'pc',
    label: 'Sessões abertas no PC',
    description: 'Do terminal ou do VSCode: quando esperarem você ou terminarem algo que levou mais de 1 min.',
  },
]

const optionClass =
  'flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5'

/** Liga as notificações deste aparelho e escolhe o que avisa. */
export function PushSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const check = () => void pushStatus().then(setStatus)
    check()
    // Volta das configurações do Android, onde a permissão pode ter sido liberada.
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (key: keyof PushPrefs, on: boolean) =>
    run(async () => {
      const next = { ...prefs, [key]: on }
      await savePrefs(next)
      setPrefs(next)
    })

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Notificações</CardTitle>
        <CardDescription>Avisos neste celular, mesmo com o app fechado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === null && <p className="text-sm text-muted-foreground">Verificando…</p>}
        {status === 'unsupported' && (
          <p className="text-sm text-muted-foreground">
            Este navegador não recebe notificações. Instale o app pelo Chrome (no iPhone, adicione à Tela de Início pelo
            Safari) e abra por ele.
          </p>
        )}
        {status === 'denied' && (
          <p className="text-sm text-muted-foreground">
            As notificações estão bloqueadas. Libere nas configurações do Android (Apps → Claude Remote → Notificações) e
            volte aqui.
          </p>
        )}
        {status === 'off' && (
          <>
            <p className="text-sm text-muted-foreground">
              Perguntas, pedidos de aprovação e erros avisam sempre, com o texto do Claude. Tocar no aviso abre a conversa.
            </p>
            <Button className="w-full" disabled={busy} onClick={() => run(async () => setStatus(await enablePush()))}>
              <Bell /> Ativar notificações
            </Button>
          </>
        )}
        {status === 'on' && (
          <>
            <p className="text-sm text-muted-foreground">Perguntas, pedidos de aprovação e erros avisam sempre. Também:</p>
            {OPTIONS.map((o) => (
              <label key={o.key} htmlFor={`push-${o.key}`} className={optionClass}>
                <Checkbox
                  id={`push-${o.key}`}
                  checked={prefs[o.key]}
                  disabled={busy}
                  onCheckedChange={(on) => toggle(o.key, on === true)}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{o.label}</div>
                  <div className="text-xs text-muted-foreground">{o.description}</div>
                </div>
              </label>
            ))}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await testPush()
                    toast.success('Aviso enviado. Deve chegar em alguns segundos.')
                  })
                }
              >
                <Send /> Enviar teste
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await disablePush()
                    setStatus('off')
                  })
                }
              >
                <BellOff /> Desativar
              </Button>
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Os avisos passam pelo serviço de push do Google (da Apple, no iPhone), criptografados: ele entrega, mas não lê
          o texto.
        </p>
      </CardContent>
    </Card>
  )
}
