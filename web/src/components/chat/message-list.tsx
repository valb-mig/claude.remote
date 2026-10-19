import { CircleAlert, Clock, FileText, Folder, Info, Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import { ImageThumb } from '@/components/image-viewer'
import { Markdown } from '@/components/markdown'
import { imageUrl } from '@/lib/api'
import { duration } from '@/lib/format'
import { discard, retryItem, type OutboxItem } from '@/lib/outbox'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Activity } from './activity'
import { ApprovalCard } from './approval-card'
import { GalleryContext, galleryOf, useGallery } from './gallery'
import type { Item } from './items'
import { QuestionCard } from './question-card'

function Divider({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 text-xs text-muted-foreground', className)}>
      <div className="h-px flex-1 bg-border" />
      <span className="shrink-0">{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

// Menção a arquivo: "@" no início ou depois de espaço (não pega e-mails).
const MENTION = /(^|\s)(@[^\s]+)/g

function FileChip({ name, title, dir }: { name: string; title: string; dir?: boolean }) {
  const Icon = dir ? Folder : FileText
  return (
    <span title={title} className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded bg-primary-foreground/15 px-1.5 align-bottom font-mono text-[0.85em]">
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}

/** Texto do usuário com as menções @caminho viradas etiquetas com o nome do arquivo. */
function withMentions(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(MENTION)) {
    const at = m.index + m[1].length
    out.push(text.slice(last, at))
    const path = m[2].slice(1)
    const dir = path.endsWith('/')
    // Anexos ganham um prefixo de timestamp no PC; ele não interessa aqui.
    const name = path.replace(/\/$/, '').split('/').pop()!.replace(/^\d{13}-/, '')
    out.push(<FileChip key={at} name={name} title={path} dir={dir} />)
    last = at + m[2].length
  }
  out.push(text.slice(last))
  return out
}

/** `files`: anexos que ainda não viraram @caminho no PC (mensagem na fila). */
function UserBubble({ sessionId, text, images, files }: { sessionId: string; text: string; images?: string[]; files?: string[] }) {
  const { mine } = useGallery()
  return (
    <div className="flex flex-col items-end gap-1.5">
      {images && images.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {images.map((key) => (
            <ImageThumb key={key} src={imageUrl(sessionId, key)} gallery={mine} from="Você" className="h-28 max-w-40" />
          ))}
        </div>
      )}
      {(text || files?.length) && (
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap break-words text-primary-foreground">
          {withMentions(text)}
          {text && files?.length ? '\n\n' : null}
          {files?.map((name, i) => <FileChip key={i} name={name} title={name} />)}
        </div>
      )}
    </div>
  )
}

/** Mensagem que ainda não chegou ao PC: relógio enquanto espera, e o motivo se não deu para enviar. */
function QueuedBubble({ item, sessionId }: { item: OutboxItem; sessionId: string }) {
  const connection = useStore((s) => s.connection)
  const images = item.attachments.flatMap((a) => (a.thumb ? [a.thumb] : []))
  const files = item.attachments.flatMap((a) => (a.thumb ? [] : [a.name]))
  const action = 'font-medium text-foreground underline-offset-2 hover:underline'
  return (
    <div className="space-y-1">
      <UserBubble sessionId={sessionId} text={item.text} images={images} files={files} />
      {item.status === 'failed' ? (
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
          <span className="flex min-w-0 items-center gap-1 text-red-600 dark:text-red-400">
            <CircleAlert className="size-3.5 shrink-0" />
            Não enviada: {item.error}
          </span>
          <button type="button" className={action} onClick={() => retryItem(item.id)}>
            Tentar de novo
          </button>
          <button type="button" className={action} onClick={() => discard(item.id)}>
            Descartar
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          {item.status === 'sending' || connection === 'open' ? 'Enviando…' : 'Aguardando conexão'}
          {item.status === 'queued' && (
            <button type="button" className={cn(action, 'ml-2')} onClick={() => discard(item.id)}>
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function resultLabel(result: Extract<Item, { type: 'result' }>['result']): string {
  if (result.ok) return `Concluído em ${duration(result.durationMs)}`
  if (result.subtype === 'error_during_execution') return 'Interrompido'
  if (result.subtype === 'error_max_turns') return 'Parou no limite de turnos'
  return 'Terminou com erro'
}

function ItemView({ item, sessionId, actionable }: { item: Item; sessionId: string; actionable: boolean }) {
  switch (item.type) {
    case 'user':
      return <UserBubble sessionId={sessionId} text={item.text} images={item.images} />
    case 'assistant':
      return <Markdown text={item.text} />
    case 'notice':
      return (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span className="line-clamp-4 whitespace-pre-wrap">{item.text}</span>
        </div>
      )
    case 'activity':
      return <Activity sessionId={sessionId} entries={item.entries} />
    case 'approval':
      return <ApprovalCard {...item} sessionId={sessionId} actionable={actionable} />
    case 'question':
      return <QuestionCard {...item} sessionId={sessionId} actionable={actionable} />
    case 'result':
      return <Divider className={cn(!item.result.ok && 'text-amber-700 dark:text-amber-400')}>{resultLabel(item.result)}</Divider>
    case 'exit':
      return (
        <div className="space-y-1">
          <Divider>Processo do painel encerrado</Divider>
          {item.error && <p className="text-xs whitespace-pre-wrap text-red-600 dark:text-red-400">{item.error}</p>}
        </div>
      )
    case 'compacting':
      return <Divider>Compactando o contexto…</Divider>
  }
}

export function MessageList({
  items,
  queued,
  sessionId,
  actionable,
  streaming,
  working,
}: {
  items: Item[]
  /** Mensagens na fila do celular, ainda não entregues ao PC. */
  queued: OutboxItem[]
  sessionId: string
  /** Aprovações e perguntas só podem ser respondidas com a sessão aberta no painel. */
  actionable: boolean
  streaming: string
  working: boolean
}) {
  const gallery = useMemo(() => galleryOf(items, sessionId), [items, sessionId])
  return (
    // Tocar numa imagem abre a tela cheia passando pelas outras do mesmo lado da conversa.
    <GalleryContext value={gallery}>
      <div className="space-y-4 px-4 py-4">
        {items.map((item) => (
          <ItemView key={item.key} item={item} sessionId={sessionId} actionable={actionable} />
        ))}
        {queued.map((item) => (
          <QueuedBubble key={item.id} item={item} sessionId={sessionId} />
        ))}
        {streaming && <Markdown text={streaming} className="opacity-90" />}
        {working && !streaming && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Trabalhando…
          </div>
        )}
      </div>
    </GalleryContext>
  )
}
