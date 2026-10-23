import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { playSound, setSound, useSounds, type Sound } from '@/lib/sounds'

const OPTIONS: { key: Sound; label: string; description: string }[] = [
  { key: 'attention', label: 'Quando perguntar ou pedir aprovação', description: 'Duas notas subindo.' },
  {
    key: 'done',
    label: 'Quando terminar',
    description: 'Três notas descendo. Das sessões abertas no PC, só depois de algo que levou mais de 1 min.',
  },
]

const optionClass =
  'flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5'

/** Liga e desliga os sons do app e deixa ouvir cada um antes. */
export function SoundSettings() {
  const prefs = useSounds()
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Sons</CardTitle>
        <CardDescription>
          Tocam com o app aberto, de qualquer conversa. Em segundo plano, com as notificações ligadas, quem avisa é a notificação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {OPTIONS.map((o) => (
          <div key={o.key} className="flex items-stretch gap-2">
            <label htmlFor={`sound-${o.key}`} className={optionClass}>
              <Checkbox id={`sound-${o.key}`} checked={prefs[o.key]} onCheckedChange={(on) => setSound(o.key, on === true)} />
              <div className="min-w-0">
                <div className="text-sm font-medium">{o.label}</div>
                <div className="text-xs text-muted-foreground">{o.description}</div>
              </div>
            </label>
            <Button variant="outline" className="h-auto shrink-0" onClick={() => playSound(o.key, true)} aria-label={`Ouvir o som: ${o.label}`}>
              <Play className="fill-current" /> Ouvir
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
