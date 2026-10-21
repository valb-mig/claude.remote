import { FolderGit2, Loader2, MessagesSquare, Monitor } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/', label: 'Sessões', icon: MessagesSquare },
  { href: '/projetos', label: 'Projetos', icon: FolderGit2 },
  { href: '/computador', label: 'Computador', icon: Monitor },
]

/** Abas embaixo da tela; no celular deitado, uma coluna na lateral para sobrar altura. */
export function BottomNav() {
  const [location] = useLocation()
  const attention = useStore((s) => s.catalog.reduce((n, c) => n + (c.state === 'waiting' ? 1 : 0), 0))
  return (
    <nav className="grid shrink-0 grid-cols-3 border-t bg-background pb-[env(safe-area-inset-bottom)] compact:w-20 compact:grid-cols-1 compact:content-center compact:border-t-0 compact:border-r compact:pb-0">
      {TABS.map(({ href, label, icon: Icon }) => {
        // No PC, a lista de sessões fica ao lado da conversa aberta.
        const active = href === '/' ? location === '/' || location.startsWith('/s/') || location === '/nova' : location.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]',
              active ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-5" />
            {label}
            {href === '/' && attention > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] leading-4 font-semibold text-white">
                {attention}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

/** Faixa no topo quando o WebSocket cai; espera um instante para não piscar em reconexões rápidas. */
export function ConnectionBanner() {
  const connection = useStore((s) => s.connection)
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (connection === 'open') {
      setShow(false)
      return
    }
    const t = setTimeout(() => setShow(true), 1500)
    return () => clearTimeout(t)
  }, [connection])
  if (!show) return null
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 bg-amber-500/15 px-3 pt-[max(0.375rem,env(safe-area-inset-top))] pb-1.5 text-xs text-amber-800 dark:text-amber-300">
      <Loader2 className="size-3 animate-spin" />
      Sem conexão com o PC. Reconectando…
    </div>
  )
}

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-background/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur compact:py-2">
      <h1 className="text-lg font-semibold">{title}</h1>
      {action}
    </header>
  )
}
