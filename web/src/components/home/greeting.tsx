import { useSyncExternalStore } from 'react'
import { HOME } from '@/lib/machines'
import { useStore } from '@/lib/store'

/** Como a home chama você. */
const NAME = 'Dev'

const minute = () => Math.floor(Date.now() / 60_000) * 60_000
const everyMinute = (onChange: () => void) => {
  const timer = setInterval(onChange, 15_000)
  return () => clearInterval(timer)
}

/** "Bom dia" das 5h ao meio-dia, "Boa tarde" até as 18h, "Boa noite" no resto (madrugada incluída). */
function salutation(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Saudação e, numa linha, o que está acontecendo: quem trabalha, quem espera você, o limite. */
export function Greeting() {
  const now = useSyncExternalStore(everyMinute, minute)
  const catalog = useStore((s) => s.catalog)
  const plan = useStore((s) => s.usages[HOME]?.plan)

  const working = catalog.filter((c) => c.state === 'running' || (c.state === 'idle' && (c.agents || c.tasks?.length))).length
  const waiting = catalog.filter((c) => c.state === 'waiting').length
  const fiveHour = plan?.available ? plan.fiveHour?.utilization : null
  const summary = [
    waiting > 0 && `${plural(waiting, 'conversa pede', 'conversas pedem')} você`,
    working > 0 && plural(working, 'conversa trabalhando', 'conversas trabalhando'),
    fiveHour != null && `${Math.round(fiveHour)}% do limite de 5 h`,
  ].filter(Boolean)

  const date = new Date(now).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground first-letter:uppercase">{date}</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {salutation(new Date(now).getHours())}, {NAME}
      </h1>
      <p className="text-sm text-muted-foreground">{summary.length ? summary.join(' · ') : 'Nada rodando agora.'}</p>
    </div>
  )
}
