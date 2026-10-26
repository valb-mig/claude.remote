import { useEffect, useState, useSyncExternalStore } from 'react'
import { api } from './api'
import { useMachines } from './machines'
import type { Activity, ActivityDay, ActivityProject } from './types'

/** Junta o uso de várias máquinas: mesmo dia soma, mesmo projeto (mesma pasta) também. */
function merge(list: Activity[]): Activity {
  const days = new Map<string, ActivityDay>()
  const projects = new Map<string, ActivityProject>()
  const hours = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const a of list) {
    for (const d of a.days) {
      const into = days.get(d.date)
      days.set(
        d.date,
        into
          ? {
              ...into,
              sessions: into.sessions + d.sessions,
              remote: into.remote + d.remote,
              prompts: into.prompts + d.prompts,
              costUsd: into.costUsd + d.costUsd,
              tokens: into.tokens + d.tokens,
            }
          : d,
      )
    }
    for (const p of a.projects) {
      const into = projects.get(p.cwd)
      projects.set(p.cwd, into ? { ...into, sessions: into.sessions + p.sessions, prompts: into.prompts + p.prompts, costUsd: into.costUsd + p.costUsd, tokens: into.tokens + p.tokens } : p)
    }
    a.hours.forEach((row, w) => row.forEach((n, h) => (hours[w][h] += n)))
  }
  return {
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    hours,
    projects: [...projects.values()].sort((a, b) => b.costUsd - a.costUsd),
  }
}

// Releitura de tempos em tempos e ao voltar para o app: a home fica aberta por horas.
const REFRESH_MS = 5 * 60_000

/** Uso por dia de todas as suas máquinas; `null` enquanto carrega, máquinas fora do ar ficam de fora. */
export function useActivity(): Activity | null {
  const ids = useMachines((s) => s.machines.map((m) => m.id).join('\n'))
  const [activity, setActivity] = useState<Activity | null>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const results = await Promise.allSettled(ids.split('\n').map((m) => api.activity(m)))
      const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      if (alive && ok.length) setActivity(merge(ok))
    }
    void load()
    const timer = setInterval(load, REFRESH_MS)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ids])
  return activity
}

/** AAAA-MM-DD na hora local, a mesma chave dos dias do servidor. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const todayKey = () => dayKey(new Date())
const everyMinute = (onChange: () => void) => {
  const timer = setInterval(onChange, 60_000)
  return () => clearInterval(timer)
}

/** Hoje (AAAA-MM-DD), trocando sozinho à meia-noite com a home aberta. */
export function useToday(): string {
  return useSyncExternalStore(everyMinute, todayKey)
}

/** Meio-dia do dia: somar e tirar dias não tropeça no horário de verão. */
export const noon = (key: string) => new Date(`${key}T12:00:00`)
