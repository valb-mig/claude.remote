import { create } from 'zustand'

// Lista de conversas do PC recolhida na alça (ver components/sidebar-rail.tsx): a escolha fica salva.
const KEY = 'cr:sidebar-collapsed'

function saved(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const useSidebar = create<{ collapsed: boolean }>(() => ({ collapsed: saved() }))

export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? '1' : '0')
  } catch {
    // localStorage indisponível (modo privado): vale só nesta tela.
  }
  useSidebar.setState({ collapsed })
}
