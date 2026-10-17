import { useEffect, useState } from 'react'
import { api } from './api'
import type { GitStatus } from './types'

let homeRequest: Promise<string> | null = null

/** Pasta pessoal no PC (uma consulta por carregamento do app). */
export function useHome(): string | undefined {
  const [home, setHome] = useState<string>()
  useEffect(() => {
    homeRequest ??= api.health().then((h) => h.home)
    homeRequest.then(setHome, () => (homeRequest = null))
  }, [])
  return home
}

/** Estado do git do projeto; relido quando `refresh` muda (ex.: a cada turno concluído). */
export function useGitStatus(cwd: string | undefined, refresh: unknown): { status: GitStatus | null; reload: () => void } {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!cwd) return setStatus(null)
    let alive = true
    api.git(cwd).then(
      (s) => alive && setStatus(s),
      () => alive && setStatus(null),
    )
    return () => {
      alive = false
    }
  }, [cwd, refresh, tick])
  return { status, reload: () => setTick((t) => t + 1) }
}
