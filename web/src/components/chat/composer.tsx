import { ArrowUp, Mic, Slash, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/api'
import { toPayload, type Attachment } from '@/lib/attachments'
import { dictationSupported, spliceSpoken, useDictation } from '@/lib/dictation'
import type { AttachmentPayload, ContextUsage, RunOptions, SessionSettings } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AttachmentTray, useAttachments } from './attachment-tray'
import { AddMenu, ContextRing, MODE_TONE, ModeMenu, ModelPill, findModel, footerButton, useModels } from './composer-controls'
import { PromptInput, type PromptInputHandle } from './prompt-input'

// Rascunho por sessão: alternar entre chats não perde o que já foi digitado ou anexado.
const drafts = new Map<string, { text: string; attachments: Attachment[] }>()

/**
 * Caixa de mensagem no formato da extensão do VSCode: texto em cima e, na mesma caixa,
 * a linha com + (anexar/contexto), / (comandos), contexto, modelo, modo e enviar/parar.
 */
export function Composer({
  sessionId,
  cwd,
  working,
  hint,
  settings,
  context,
  onChangeSettings,
  onCompact,
  onSend,
  onInterrupt,
}: {
  sessionId: string
  cwd?: string
  /** Claude trabalhando: com o campo vazio, o botão vira "parar"; com texto, a mensagem entra na fila. */
  working: boolean
  hint?: string
  settings: SessionSettings
  context: ContextUsage | null
  onChangeSettings: (patch: RunOptions) => Promise<void> | void
  onCompact?: () => Promise<void>
  onSend: (text: string, attachments: AttachmentPayload[]) => Promise<void> | void
  onInterrupt?: () => Promise<void>
}) {
  const draft = drafts.get(sessionId)
  const [text, setText] = useState(draft?.text ?? '')
  const files = useAttachments(draft?.attachments)
  const [sending, setSending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const input = useRef<PromptInputHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const models = useModels()

  // Ditado: o que é ouvido entra onde estava o cursor e vai sendo corrigido enquanto se fala.
  const spot = useRef<{ before: string; after: string } | null>(null)
  const dictation = useDictation({
    onText: (spoken) => {
      const at = spot.current
      if (at) setText(spliceSpoken(at.before, spoken, at.after))
    },
    onEnd: () => (spot.current = null),
    onError: (message) => toast.error(message),
  })

  function dictate() {
    if (!dictation.listening) {
      const [start, end] = input.current?.selection() ?? [text.length, text.length]
      spot.current = { before: text.slice(0, start), after: text.slice(end) }
    }
    dictation.toggle()
  }

  // Digitar ou enviar durante o ditado desliga o microfone e fica com o texto como está.
  function stopDictation() {
    spot.current = null
    dictation.cancel()
  }

  useEffect(() => {
    drafts.set(sessionId, { text, attachments: files.items })
  }, [sessionId, text, files.items])

  const empty = !text.trim() && files.items.length === 0
  const showStop = working && empty && Boolean(onInterrupt)
  const mode = settings.permissionMode ?? 'default'
  const tone = MODE_TONE[mode] ?? MODE_TONE.default!
  const efforts = findModel(models, settings.model)?.efforts ?? []

  async function submit() {
    if (empty || sending || files.reading) return
    stopDictation()
    setSending(true)
    try {
      await onSend(text.trim(), toPayload(files.items))
      setText('')
      files.clear()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  async function guard(action: () => Promise<void> | void) {
    try {
      await action()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function interrupt() {
    setStopping(true)
    await guard(() => onInterrupt?.())
    setStopping(false)
  }

  return (
    <div className="bg-background px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {hint && <p className="mb-1.5 px-2 text-xs text-muted-foreground">{hint}</p>}
      <div className={cn('relative rounded-xl border bg-card shadow-xs transition-colors', tone.focus)}>
        {files.items.length > 0 && (
          <div className="border-b px-1.5">
            <AttachmentTray items={files.items} onRemove={files.remove} />
          </div>
        )}
        <PromptInput
          handleRef={input}
          cwd={cwd}
          value={text}
          onChange={(value) => {
            stopDictation()
            setText(value)
          }}
          onPasteFiles={files.add}
          onSubmitShortcut={submit}
          anchored={false}
          rows={1}
          placeholder={dictation.listening ? 'Pode falar…' : working ? 'Enfileirar outra mensagem…' : 'Peça algo ao Claude…'}
          className="max-h-48 min-h-11 resize-none rounded-none border-0 bg-transparent px-3.5 py-2.5 text-base shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-sm dark:bg-transparent"
        />
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <AddMenu onAttach={() => fileInput.current?.click()} onMention={cwd ? () => input.current?.insert('@') : undefined} />
          <button
            type="button"
            className={cn(footerButton, 'px-0')}
            aria-label="Comandos"
            onClick={() => (text.startsWith('/') ? input.current?.focus() : input.current?.insert('/', { atStart: true }))}
          >
            <Slash className="size-4" />
          </button>
          {context && onCompact && <ContextRing context={context} disabled={working} onCompact={() => void guard(onCompact)} />}
          <ModelPill models={models} settings={settings} onChange={(patch) => void guard(() => onChangeSettings(patch))} />
          <div className="flex-1" />
          <ModeMenu settings={settings} efforts={efforts} onChange={(patch) => void guard(() => onChangeSettings(patch))} />
          {dictationSupported && (
            <button
              type="button"
              onClick={dictate}
              className={cn(footerButton, 'px-0', dictation.listening && 'bg-red-500/15 text-red-500 hover:bg-red-500/15 hover:text-red-500')}
              aria-label={dictation.listening ? 'Parar ditado' : 'Ditar'}
              aria-pressed={dictation.listening}
            >
              <Mic className={cn('size-4', dictation.listening && 'animate-pulse')} />
            </button>
          )}
          {showStop ? (
            <button
              type="button"
              onClick={interrupt}
              disabled={stopping}
              className={cn('ml-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg disabled:opacity-40', tone.send)}
              aria-label="Parar"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={empty || sending || files.reading}
              className={cn(
                'ml-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg transition-[filter] hover:brightness-110 disabled:opacity-40',
                tone.send,
              )}
              aria-label="Enviar"
            >
              <ArrowUp className="size-4.5" />
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void files.add(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
