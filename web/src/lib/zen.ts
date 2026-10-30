import { create } from 'zustand'

/**
 * Modo zen: uma conversa sozinha na tela, sem a alça, a lista e o cabeçalho — só as mensagens e a caixa
 * de escrever. É da conversa em que ele foi ligado: com outras lado a lado, elas saem de vista (sem
 * fechar, nem perder o que estava escrito) até ele desligar. Fica salvo neste aparelho.
 */
const KEY = 'cr:zen-chat'

function saved(): string | null {
  try {
    return localStorage.getItem(KEY) || null
  } catch {
    return null
  }
}

/** `id`: a conversa em modo zen, ou nenhuma. */
export const useZen = create<{ id: string | null }>(() => ({ id: saved() }))

export function setZen(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    // localStorage indisponível (modo privado): vale só nesta tela.
  }
  useZen.setState({ id })
}
