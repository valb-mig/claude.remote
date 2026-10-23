import { FileText, Folder, Slash } from 'lucide-react'
import { useEffect, useImperativeHandle, useRef, useState, type ComponentProps, type Ref } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { useMachine } from '@/lib/machines'
import type { CommandInfo } from '@/lib/types'
import { cn } from '@/lib/utils'

type Token = { kind: '/' | '@'; query: string; start: number; end: number }
type Suggestion = ({ kind: 'command' } & CommandInfo) | { kind: 'file'; path: string }

/** Palavra sob o cursor que dispara sugestões: "/comando" no início da mensagem ou "@caminho" em qualquer lugar. */
function activeToken(text: string, caret: number): Token | null {
  const m = /(^|\s)([@/])([^\s]*)$/.exec(text.slice(0, caret))
  if (!m) return null
  const kind = m[2] as Token['kind']
  const start = caret - 1 - m[3].length
  if (kind === '/' && (start !== 0 || m[3].includes('/'))) return null
  const rest = /^[^\s]*/.exec(text.slice(caret))![0]
  return { kind, query: m[3], start, end: caret + rest.length }
}

const commandCache = new Map<string, Promise<CommandInfo[]>>()

/** Carrega (uma vez por projeto em cada máquina) a lista de comandos e skills. */
export function loadCommands(machine: string, cwd: string): Promise<CommandInfo[]> {
  const key = `${machine}\n${cwd}`
  let list = commandCache.get(key)
  if (!list) {
    list = api.commands(machine, cwd)
    commandCache.set(key, list)
    list.catch(() => commandCache.delete(key))
  }
  return list
}

function useSuggestions(cwd: string | undefined, token: Token | null): Suggestion[] {
  const machine = useMachine()
  const [items, setItems] = useState<Suggestion[]>([])
  const kind = token?.kind
  const query = token?.query ?? ''

  useEffect(() => {
    if (!cwd || !kind) {
      setItems([])
      return
    }
    let alive = true
    const q = query.toLowerCase()
    if (kind === '/') {
      loadCommands(machine, cwd).then(
        (list) => {
          if (!alive) return
          const matches = list.filter((c) => c.name.toLowerCase().includes(q))
          matches.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
          setItems(matches.slice(0, 50).map((c) => ({ kind: 'command', ...c })))
        },
        () => alive && setItems([]),
      )
      return () => {
        alive = false
      }
    }
    const timer = setTimeout(() => {
      api.files(machine, cwd, query).then(
        (paths) => alive && setItems(paths.map((path) => ({ kind: 'file', path }))),
        () => alive && setItems([]),
      )
    }, 120)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [machine, cwd, kind, query])

  return items
}

function SuggestionRow({ s }: { s: Suggestion }) {
  if (s.kind === 'command') {
    return (
      <>
        <Slash className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="font-mono text-sm">
            {s.name}
            {s.argumentHint && <span className="ml-1.5 text-muted-foreground">{s.argumentHint}</span>}
          </div>
          {s.description && <div className="line-clamp-2 text-xs text-muted-foreground">{s.description}</div>}
        </div>
      </>
    )
  }
  const dir = s.path.endsWith('/')
  const Icon = dir ? Folder : FileText
  const name = s.path.replace(/\/$/, '').split('/').pop()
  const parent = s.path.replace(/\/$/, '').split('/').slice(0, -1).join('/')
  return (
    <>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="truncate font-mono text-sm">
          {name}
          {dir && '/'}
        </div>
        {parent && <div className="truncate font-mono text-xs text-muted-foreground">{parent}</div>}
      </div>
    </>
  )
}

/** Ações dos botões da barra: inserir "@" ou "/" e abrir as sugestões. */
export type PromptInputHandle = {
  /** Insere no cursor (com espaço antes, se colado a uma palavra) ou no início da mensagem. */
  insert: (text: string, opts?: { atStart?: boolean }) => void
  focus: () => void
  /** Início e fim da seleção (ou a posição do cursor), mesmo com o campo sem foco. */
  selection: () => [number, number]
}

type Props = Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange'> & {
  handleRef?: Ref<PromptInputHandle>
  /** Projeto da sessão: de onde vêm os comandos e os arquivos sugeridos. */
  cwd?: string
  value: string
  onChange: (value: string) => void
  /** Arquivos colados (ex.: print no PC). */
  onPasteFiles?: (files: File[]) => void
  /** Ctrl/Cmd+Enter. */
  onSubmitShortcut?: () => void
  placement?: 'top' | 'bottom'
  /** false: a lista se posiciona pelo contêiner do chamador (ex.: largura toda da barra de envio). */
  anchored?: boolean
}

/** Campo de mensagem com sugestões de "/comando" e "@arquivo". */
export function PromptInput({
  cwd,
  value,
  onChange,
  onPasteFiles,
  onSubmitShortcut,
  placement = 'top',
  anchored = true,
  handleRef,
  className,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [token, setToken] = useState<Token | null>(null)
  const [highlight, setHighlight] = useState(0)
  const suggestions = useSuggestions(cwd, token)
  const open = token !== null && suggestions.length > 0
  const machine = useMachine()

  useEffect(() => {
    if (cwd) void loadCommands(machine, cwd).catch(() => {})
  }, [machine, cwd])

  useEffect(() => setHighlight(0), [token?.kind, token?.query])

  const syncToken = (el: HTMLTextAreaElement) => setToken(activeToken(el.value, el.selectionStart))

  useImperativeHandle(
    handleRef,
    () => ({
      focus: () => ref.current?.focus(),
      selection: () => [ref.current?.selectionStart ?? value.length, ref.current?.selectionEnd ?? value.length],
      insert: (text, { atStart = false } = {}) => {
        const el = ref.current
        if (!el) return
        const start = atStart ? 0 : el.selectionStart
        const end = atStart ? 0 : el.selectionEnd
        const before = value.slice(0, start)
        const insert = (!atStart && before && !/\s$/.test(before) ? ' ' : '') + text
        const next = before + insert + value.slice(end)
        const caret = start + insert.length
        onChange(next)
        requestAnimationFrame(() => {
          el.focus()
          el.setSelectionRange(caret, caret)
          setToken(activeToken(next, caret))
        })
      },
    }),
    [value, onChange],
  )

  function pick(s: Suggestion) {
    const el = ref.current
    if (!el || !token) return
    // Diretório: mantém a sugestão aberta para descer na árvore.
    const insert = s.kind === 'command' ? `/${s.name} ` : s.path.endsWith('/') ? `@${s.path}` : `@${s.path} `
    const next = value.slice(0, token.start) + insert + value.slice(token.end)
    const caret = token.start + insert.length
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
      setToken(activeToken(next, caret))
    })
  }

  return (
    <div className={cn('min-w-0 flex-1', anchored && 'relative')}>
      {open && (
        <div
          className={cn(
            'absolute right-0 left-0 z-30 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg',
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.kind === 'command' ? s.name : s.path}
              type="button"
              // Não tirar o foco do campo (o teclado do celular fecharia).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              className={cn('flex w-full items-start gap-2 rounded-md px-2 py-2 text-left', i === highlight && 'bg-muted')}
            >
              <SuggestionRow s={s} />
            </button>
          ))}
        </div>
      )}
      <Textarea
        {...rest}
        ref={ref}
        value={value}
        className={className}
        onChange={(e) => {
          onChange(e.target.value)
          syncToken(e.target)
        }}
        onSelect={(e) => syncToken(e.currentTarget)}
        onBlur={() => setTimeout(() => setToken(null), 150)}
        onPaste={(e) => {
          const files = [...e.clipboardData.files]
          if (files.length && onPasteFiles) {
            e.preventDefault()
            onPasteFiles(files)
          }
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const step = e.key === 'ArrowDown' ? 1 : -1
              setHighlight((h) => (h + step + suggestions.length) % suggestions.length)
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              pick(suggestions[highlight]!)
              return
            }
            if (e.key === 'Escape') {
              setToken(null)
              return
            }
          }
          // Enter quebra linha (ditado/Gboard); Ctrl/Cmd+Enter envia no PC.
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmitShortcut) {
            e.preventDefault()
            onSubmitShortcut()
          }
        }}
      />
    </div>
  )
}
