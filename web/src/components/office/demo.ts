import { useEffect, useState } from 'react'
import type { OfficeActivity, OfficeRoom, OfficeWorker } from '@/lib/types'

/**
 * Escritório de mentira para ver a salinha cheia (`/salinha?demo`): salas fictícias cujos
 * claudinhos trocam de atividade a cada poucos segundos, com subagentes chegando e indo embora.
 */
const WORK: OfficeActivity[] = ['web', 'files', 'edit', 'command', 'plan', 'think']
const DETAIL: Record<OfficeActivity, string[]> = {
  web: ['WebSearch · claude code subagents', 'WebFetch · docs.anthropic.com'],
  files: ['Read · manager.ts', 'Grep · useSession', 'Glob · src/**/*.tsx'],
  edit: ['Edit · README.md', 'Write · office.ts', 'Edit · auth.ts'],
  command: ['Bash · pnpm test', 'Bash · git status', 'Bash · docker compose up'],
  plan: ['TodoWrite · 5 tarefas', 'Coordenando os subagentes'],
  think: ['Pensando'],
  ask: ['Pede aprovação: Bash · git push'],
  background: ['Algo rodando em segundo plano'],
  idle: ['Descansando'],
}
const AGENTS = [
  ['Mapear rotas de auth', 'Explore'],
  ['Ler a doc do NextAuth', 'general-purpose'],
  ['Procurar testes antigos', 'Explore'],
  ['Comparar bibliotecas', 'general-purpose'],
] as const

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]
const worker = (id: string, name: string, role: string, activity: OfficeActivity): OfficeWorker => ({ id, name, role, activity, detail: pick(DETAIL[activity]) })

function initial(): OfficeRoom[] {
  const room = (id: string, title: string, cwd: string, state: OfficeRoom['state'], workers: OfficeWorker[]): OfficeRoom => ({
    sessionId: `demo-${id}`,
    title,
    cwd: `/home/dev/${cwd}`,
    state,
    owner: 'panel',
    workers,
  })
  return [
    room('a', 'Refatorar o login', 'app', 'running', [
      worker('lead', 'Gestor', 'gestor', 'plan'),
      worker('a1', AGENTS[0][0], AGENTS[0][1], 'files'),
      worker('a2', AGENTS[1][0], AGENTS[1][1], 'web'),
    ]),
    room('b', 'Deploy da landing', 'site', 'waiting', [worker('lead', 'Gestor', 'gestor', 'ask')]),
    room('c', 'Monitorar o build', 'api', 'idle', [worker('lead', 'Gestor', 'gestor', 'background')]),
    room('d', 'Escrever o README', 'lib', 'running', [worker('lead', 'Gestor', 'gestor', 'edit')]),
    room('e', 'Pesquisa de mercado', 'notas', 'idle', [worker('lead', 'Gestor', 'gestor', 'idle')]),
  ]
}

function evolve(rooms: OfficeRoom[], tick: number): OfficeRoom[] {
  const next = rooms.map((r) => ({ ...r, workers: [...r.workers] }))
  // Uma conversa nova abre depois de um tempo: o escritório ganha uma sala.
  if (tick === 6) next.push({ sessionId: 'demo-f', title: 'Nova conversa', cwd: '/home/dev/app', state: 'running', owner: 'panel', workers: [worker('lead', 'Gestor', 'gestor', 'think')] })
  for (const r of next) {
    if (r.state === 'running') {
      // Cada um que trabalha tem uma chance de ir para outra estação.
      r.workers = r.workers.map((w) => (Math.random() < 0.3 ? worker(w.id, w.name, w.role, pick(WORK)) : w))
    }
    if (r.sessionId === 'demo-b' && tick % 4 === 0) {
      const asking = r.state === 'waiting'
      r.state = asking ? 'running' : 'waiting'
      r.workers = [worker('lead', 'Gestor', 'gestor', asking ? pick(WORK) : 'ask')]
    }
    if (r.sessionId === 'demo-e' && tick % 7 === 3) {
      const resting = r.state === 'idle'
      r.state = resting ? 'running' : 'idle'
      r.workers = [worker('lead', 'Gestor', 'gestor', resting ? 'think' : 'idle')]
    }
  }
  // Subagentes chegando e indo embora na sala da refatoração.
  const a = next[0]
  if (tick % 3 === 2) {
    const missing = AGENTS.filter((_, i) => !a.workers.some((w) => w.id === `a${i + 1}`))
    if (missing.length && Math.random() < 0.6) {
      const i = AGENTS.indexOf(pick(missing))
      a.workers.push(worker(`a${i + 1}`, AGENTS[i][0], AGENTS[i][1], pick(WORK)))
    } else if (a.workers.length > 2) a.workers.splice(1 + Math.floor(Math.random() * (a.workers.length - 1)), 1)
  }
  return next
}

/** As salas de mentira, mudando a cada 4 s (dá tempo de chegar e trabalhar um pouco). */
export function useDemoOffice(enabled: boolean): OfficeRoom[] {
  const [rooms, setRooms] = useState(initial)
  useEffect(() => {
    if (!enabled) return
    let tick = 0
    const timer = setInterval(() => setRooms((r) => evolve(r, ++tick)), 4_000)
    return () => clearInterval(timer)
  }, [enabled])
  return rooms
}
