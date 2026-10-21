import { ArrowLeft, ChevronDown, GitBranch, Menu, MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { Composer } from '@/components/chat/composer'
import { ExplorerSheet } from '@/components/explorer'
import { GitSheet } from '@/components/git-panel'
import { ProjectPicker } from '@/components/project-picker'
import { RepoLink } from '@/components/repo-link'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { projectName } from '@/lib/format'
import { useGitStatus, useHome } from '@/lib/hooks'
import type { RunOptions } from '@/lib/types'

/**
 * Conversa nova direto no formato de chat: a primeira mensagem (com modelo, modo, /, @ e anexos)
 * cria a sessão e leva ao chat dela.
 */
export function NewChatPage() {
  const cwd = new URLSearchParams(useSearch()).get('cwd') ?? undefined
  const home = useHome()
  const [, navigate] = useLocation()
  const [pending, setPending] = useState<RunOptions>({})
  const [picker, setPicker] = useState(false)
  const [explorer, setExplorer] = useState(false)
  const [gitOpen, setGitOpen] = useState(false)
  const git = useGitStatus(cwd, null)
  const label = cwd ? projectName(cwd) : 'Sem projeto (~)'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-1 border-b px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 compact:py-1">
        {/* No PC a lista de conversas já está ao lado. */}
        <Button variant="ghost" size="icon" asChild aria-label="Voltar" className="lg:hidden">
          <Link href="/">
            <ArrowLeft />
          </Link>
        </Button>
        {cwd && (
          <Button variant="ghost" size="icon" onClick={() => setExplorer(true)} aria-label="Arquivos do projeto">
            <Menu />
          </Button>
        )}
        <button type="button" onClick={() => setPicker(true)} className="min-w-0 flex-1 text-left">
          <div className="text-sm font-medium">Nova conversa</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="truncate">{label}</span>
            <ChevronDown className="size-3 shrink-0" />
          </div>
        </button>
        {cwd && git.status?.remote && <RepoLink url={git.status.remote} />}
        {cwd && git.status && (
          <Button variant="ghost" size="icon" onClick={() => (git.reload(), setGitOpen(true))} aria-label="Git">
            <GitBranch />
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <MessageSquarePlus className="size-8 text-muted-foreground" />
        <p className="text-sm">
          Nova conversa em <span className="font-medium">{label}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Escolha modelo e modo na caixa abaixo. Use / para comandos e skills, @ para arquivos e + para anexar.
        </p>
        <Button variant="outline" size="sm" onClick={() => setPicker(true)}>
          Trocar projeto
        </Button>
      </div>

      <Composer
        key={cwd ?? '~'}
        sessionId={`new:${cwd ?? '~'}`}
        cwd={cwd ?? home}
        branch={cwd ? git.status?.branch : undefined}
        working={false}
        settings={pending}
        context={null}
        onChangeSettings={(patch) => setPending((p) => ({ ...p, ...patch }))}
        onSend={async (text, attachments) => {
          const { sessionId } = await api.create({ cwd, prompt: text, attachments, ...pending })
          navigate(`/s/${sessionId}`, { replace: true })
        }}
      />

      <ProjectPicker
        open={picker}
        onOpenChange={setPicker}
        onPick={(dir) => navigate(dir ? `/nova?cwd=${encodeURIComponent(dir)}` : '/nova', { replace: true })}
      />
      {cwd && <ExplorerSheet cwd={cwd} open={explorer} onOpenChange={setExplorer} />}
      {cwd && git.status && <GitSheet cwd={cwd} status={git.status} open={gitOpen} onOpenChange={setGitOpen} onRefresh={git.reload} />}
    </div>
  )
}
