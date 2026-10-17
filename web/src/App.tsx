import { useEffect } from 'react'
import { Redirect, Route, Switch, useLocation } from 'wouter'
import { BottomNav, ConnectionBanner } from '@/components/layout'
import { startOutbox } from '@/lib/outbox'
import { syncPush } from '@/lib/push'
import { connect } from '@/lib/store'
import { ChatPage } from '@/pages/chat'
import { ComputerPage } from '@/pages/computer'
import { NewChatPage } from '@/pages/new-chat'
import { ProjectsPage } from '@/pages/projects'
import { SessionsPage } from '@/pages/sessions'

export default function App() {
  const [, navigate] = useLocation()

  useEffect(() => {
    connect()
    startOutbox()
    void syncPush().catch(() => {})
  }, [])

  // Toque numa notificação com o app já aberto: o service worker pede a troca de tela.
  useEffect(() => {
    const onMessage = (e: MessageEvent<{ type?: string; url?: string }>) => {
      if (e.data?.type === 'navigate' && e.data.url) navigate(e.data.url)
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [navigate])

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col bg-background">
      <ConnectionBanner />
      <Switch>
        <Route path="/s/:id">{(params) => <ChatPage key={params.id} id={params.id} />}</Route>
        <Route path="/nova">
          <NewChatPage />
        </Route>
        <Route>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Switch>
              <Route path="/">
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
          </main>
          <BottomNav />
        </Route>
      </Switch>
    </div>
  )
}
