import { useEffect } from 'react'
import { Redirect, Route, Switch } from 'wouter'
import { BottomNav, ConnectionBanner } from '@/components/layout'
import { connect } from '@/lib/store'
import { ChatPage } from '@/pages/chat'
import { ComputerPage } from '@/pages/computer'
import { NewChatPage } from '@/pages/new-chat'
import { ProjectsPage } from '@/pages/projects'
import { SessionsPage } from '@/pages/sessions'

export default function App() {
  useEffect(() => connect(), [])

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
