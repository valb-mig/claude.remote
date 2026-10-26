import { useEffect, useState } from 'react'
import { api } from './api'
import { useMachines } from './machines'
import type { OfficeRoom } from './types'

// A salinha fica de fundo por horas: leve o bastante para perguntar com frequência, e só com a tela à vista.
const POLL_MS = 2_500

/** Setores de todas as suas máquinas, atualizados enquanto a salinha está na tela; `null` até a primeira resposta. */
export function useOffice(): OfficeRoom[] | null {
  const ids = useMachines((s) => s.machines.map((m) => m.id).join('\n'))
  const [rooms, setRooms] = useState<OfficeRoom[] | null>(null)
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      clearTimeout(timer)
      if (document.visibilityState === 'visible') {
        const machines = ids.split('\n')
        const results = await Promise.allSettled(machines.map((m) => api.office(m)))
        if (!alive) return
        const ok = results.flatMap((r, i) => (r.status === 'fulfilled' ? r.value.map((room) => ({ ...room, machine: machines[i] })) : []))
        // Todas fora do ar: mantém o último desenho em vez de esvaziar a sala.
        if (ok.length || results.some((r) => r.status === 'fulfilled')) setRooms(ok)
      }
      if (alive) timer = setTimeout(load, POLL_MS)
    }
    void load()
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ids])
  return rooms
}
