import { create } from 'zustand'

/**
 * Modo zen: a conversa sozinha na tela, sem a alça, sem a lista e sem o cabeçalho — só as mensagens
 * e a caixa de escrever. Vale só na tela da conversa, e a escolha fica salva neste aparelho, como a
 * lista recolhida (ver lib/sidebar.ts).
 */
const KEY = 'cr:zen'

function saved(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const useZen = create<{ on: boolean }>(() => ({ on: saved() }))

export function setZen(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // localStorage indisponível (modo privado): vale só nesta tela.
  }
  useZen.setState({ on })
}
