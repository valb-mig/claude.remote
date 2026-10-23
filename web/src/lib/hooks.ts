import { useEffect, useState, useSyncExternalStore } from 'react'
import { api } from './api'
import type { GitStatus } from './types'

/** Se a media query vale agora, acompanhando mudanças (girar o celular, redimensionar a janela). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => matchMedia(query).matches,
  )
}

/** Tela larga (PC, tablet deitado): a lista de conversas fica fixa ao lado. Mesmo limite do `lg:` do Tailwind. */
export const useWide = () => useMediaQuery('(min-width: 64rem)')

/** Largura da janela, acompanhando o redimensionamento. */
export function useWindowWidth(): number {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('resize', onChange)
      return () => window.removeEventListener('resize', onChange)
    },
    () => window.innerWidth,
  )
}

const homeRequests = new Map<string, Promise<string>>()

/** Pasta pessoal na máquina (uma consulta por máquina por carregamento do app). */
export function useHome(machine: string): string | undefined {
  const [home, setHome] = useState<string>()
  useEffect(() => {
    let request = homeRequests.get(machine)
    if (!request) homeRequests.set(machine, (request = api.health(machine).then((h) => h.home)))
    request.then(setHome, () => homeRequests.delete(machine))
  }, [machine])
  return home
}

/** Estado do git do projeto; relido quando `refresh` muda (ex.: a cada turno concluído). */
export function useGitStatus(
  machine: string,
  cwd: string | undefined,
  refresh: unknown,
): { status: GitStatus | null; reload: () => void } {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!cwd) return setStatus(null)
    let alive = true
    api.git(machine, cwd).then(
      (s) => alive && setStatus(s),
      () => alive && setStatus(null),
    )
    return () => {
      alive = false
    }
  }, [machine, cwd, refresh, tick])
  return { status, reload: () => setTick((t) => t + 1) }
}
