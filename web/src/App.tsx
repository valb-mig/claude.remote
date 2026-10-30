import { useEffect } from 'react'
import { Redirect, Route, Switch, useLocation } from 'wouter'
import { BottomNav, ConnectionBanner } from '@/components/layout'
import { SidebarRail } from '@/components/sidebar-rail'
import { useWide } from '@/lib/hooks'
import { loadMachines } from '@/lib/machines'
import { useSidebar } from '@/lib/sidebar'
import { useZen } from '@/lib/zen'
import { useSplit } from '@/lib/split'
import { startOutbox } from '@/lib/outbox'
import { startSounds } from '@/lib/sounds'
import { startTitle } from '@/lib/title'
import { syncPush } from '@/lib/push'
import { connect } from '@/lib/store'
import { watchUpdates } from '@/lib/update'
import { rememberTab } from '@/lib/tabs'
import { cn } from '@/lib/utils'
import { ComputerPage } from '@/pages/computer'
import { HomePage } from '@/pages/home'
import { NewChatPage } from '@/pages/new-chat'
import { OfficePage } from '@/pages/office'
import { ProjectsPage } from '@/pages/projects'
import { SessionsPage } from '@/pages/sessions'
import { SharePage } from '@/pages/share'
import { ChatSplit } from '@/pages/split'

export default function App() {
  const [location, navigate] = useLocation()
  const wide = useWide()
  // Modo zen: só na conversa, que é a única tela que faz sentido ficar sozinha (ver lib/zen.ts).
  const zen = useZen((s) => s.on) && location.startsWith('/s/')

  useEffect(() => {
    // Outras máquinas suas com o Claude Remote (ver lib/machines.ts); a lista guardada vale até a resposta.
    const refresh = () => void loadMachines().catch(() => {})
    refresh()
    const machines = setInterval(refresh, 60_000)
    connect()
    startOutbox()
    startSounds()
    startTitle()
    watchUpdates()
    void syncPush().catch(() => {})
    return () => clearInterval(machines)
  }, [])

  // Toque numa notificação com o app já aberto: o service worker pede a troca de tela.
  useEffect(() => {
    const onMessage = (e: MessageEvent<{ type?: string; url?: string }>) => {
      if (e.data?.type === 'navigate' && e.data.url) navigate(e.data.url)
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [navigate])

  // A salinha fica sozinha na tela, sem a lista nem as abas: é para deixar de fundo.
  if (location === '/salinha') {
    return (
      <div className="flex h-dvh flex-col bg-background pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <ConnectionBanner />
        <OfficePage />
      </div>
    )
  }

  return (
    // Na horizontal, o entalhe da câmera fica num dos lados.
    <div className="flex h-dvh bg-background pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      {wide && !zen && <Sidebar />}
      <div className={cn('flex min-w-0 flex-1 flex-col', !wide && 'mx-auto max-w-2xl compact:max-w-none')}>
        <ConnectionBanner />
        <Switch>
          <Route path="/s/:id">
            <ChatSplit />
          </Route>
          <Route path="/nova">
            <NewChatPage />
          </Route>
          <Route path="/compartilhar">
            <SharePage />
          </Route>
          <Route path="/">{wide ? <WideHome /> : <TabPages wide={false} />}</Route>
          <Route>
            <TabPages wide={wide} />
          </Route>
        </Switch>
      </div>
    </div>
  )
}

/**
 * PC e tablet deitado: a alça (abas e métricas) fica sempre à esquerda e, ao lado dela, a lista de
 * conversas, que recolhe pelo botão do topo da alça.
 */
function Sidebar() {
  // Com conversas lado a lado, a lista fica mais estreita para sobrar espaço para elas.
  const split = useSplit().ids.length > 1
  const collapsed = useSidebar((s) => s.collapsed)
  return (
    <>
      <SidebarRail />
      {!collapsed && (
        <aside className={cn('flex w-80 shrink-0 flex-col border-r', !split && 'xl:w-96')}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SessionsPage sidebar />
          </div>
        </aside>
      )}
    </>
  )
}

/** Início, Conversas, Projetos e Computador; no celular deitado, as abas viram uma coluna na lateral. */
function TabPages({ wide }: { wide: boolean }) {
  const [location] = useLocation()
  // O "voltar" de uma conversa leva de volta à aba de onde ela foi aberta.
  useEffect(() => rememberTab(location), [location])
  return (
    <div className="flex min-h-0 flex-1 flex-col compact:flex-row-reverse">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl">
          <Switch>
            <Route path="/">
              <HomePage />
            </Route>
            <Route path="/conversas">
              <SessionsPage />
            </Route>
            <Route path="/projetos">
              <ProjectsPage />
            </Route>
            <Route path="/computador">
              <ComputerPage />
            </Route>
            <Route>
              <Redirect to="/" />
            </Route>
          </Switch>
        </div>
      </main>
      {!wide && <BottomNav />}
    </div>
  )
}

/** Tela larga sem conversa aberta: a home, com a lista de conversas ao lado (ou recolhida na alça). */
function WideHome() {
  useEffect(() => rememberTab('/'), [])
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <HomePage />
    </main>
  )
}
