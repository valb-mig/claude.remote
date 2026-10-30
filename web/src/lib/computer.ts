import { create } from 'zustand'

/**
 * O painel Computador (sistema, limites, notificações, sons, tema) abre por cima da tela em que você
 * está, em vez de ser uma página: dá para conferir o PC ou mudar um ajuste sem sair da conversa.
 */
export const useComputer = create<{ open: boolean }>(() => ({ open: false }))

export function setComputerOpen(open: boolean): void {
  useComputer.setState({ open })
}
