import { Plus } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Redirect, Route, Switch, useLocation } from 'wouter'
import { BottomNav, ConnectionBanner } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { useWide } from '@/lib/hooks'
import { useSplit } from '@/lib/split'
import { startOutbox } from '@/lib/outbox'
import { syncPush } from '@/lib/push'
import { connect } from '@/lib/store'
import { watchUpdates } from '@/lib/update'
import { cn } from '@/lib/utils'
import { ComputerPage } from '@/pages/computer'
import { NewChatPage } from '@/pages/new-chat'
import { ProjectsPage } from '@/pages/projects'
import { SessionsPage } from '@/pages/sessions'
import { SharePage } from '@/pages/share'
import { ChatSplit } from '@/pages/split'

export default function App() {
  const [, navigate] = useLocation()
  const wide = useWide()

  useEffect(() => {
    connect()
    startOutbox()
    watchUpdates()
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
    // Na horizontal, o entalhe da câmera fica num dos lados.
    <div className="flex h-dvh bg-background pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      {wide && <Sidebar />}
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
          <Route path="/">{wide ? <NoChatOpen /> : <TabPages wide={false} />}</Route>
          <Route>
            <TabPages wide={wide} />
          </Route>
        </Switch>
      </div>
    </div>
  )
}

/** PC e tablet deitado: a lista de conversas fica fixa ao lado, com as abas no pé dela. */
function Sidebar() {
  // Com conversas lado a lado, a lista fica mais estreita para sobrar espaço para elas.
  const split = useSplit().ids.length > 1
  return (
    <aside className={cn('flex w-80 shrink-0 flex-col border-r', !split && 'xl:w-96')}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SessionsPage />
      </div>
      <BottomNav />
    </aside>
  )
}

/** Sessões, Projetos e Computador; no celular deitado, as abas viram uma coluna na lateral. */
function TabPages({ wide }: { wide: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col compact:flex-row-reverse">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl">
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
        </div>
      </main>
      {!wide && <BottomNav />}
    </div>
  )
}

/** Tela larga sem conversa aberta: a lista já está ao lado. */
function NoChatOpen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <img src="/pwa-192.png" alt="" className="size-16 rounded-2xl" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Claude Remote</h1>
        <p className="text-sm text-muted-foreground">Escolha uma conversa ao lado ou comece uma nova.</p>
      </div>
      <Button asChild>
        <Link href="/nova">
          <Plus /> Nova conversa
        </Link>
      </Button>
    </div>
  )
}
