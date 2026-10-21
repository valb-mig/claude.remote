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
