import type { AgentStatus, AgentTree } from '@/components/agents/model'
import { AGENT_TOOLS, type ActivityEntry, type Item } from '@/components/chat/items'
import type { ToolEntry } from '@/components/chat/turn'
import { duration, toolSummary } from '@/lib/format'

/**
 * Mapa mental da conversa: ela no centro, cada mensagem sua é um galho, e dele saem os passos
 * do Claude (o que ele disse que ia fazer, as perguntas, a resposta) com o que cada passo tocou
 * (arquivos, comandos, buscas, sites, subagentes) nas pontas.
 */

export type MindKind =
  | 'root'
  | 'turn'
  | 'step'
  | 'answer'
  | 'approval'
  | 'question'
  | 'agent'
  | 'file'
  | 'command'
  | 'search'
  | 'web'
  | 'tool'
  | 'notice'
  | 'more'

export type MindStatus = AgentStatus

export type MindNode = {
  id: string
  kind: MindKind
  label: string
  /** Segunda linha: "editou +12 −3", "4 passos · 1min 2s". */
  meta?: string
  /** Ferramenta que deu origem (para o ícone). */
  tool?: string
  status: MindStatus
  /** Galho (turno) a que pertence; dá a cor. O centro é -1. */
  branch: number
  /** Item do chat para onde o toque leva. */
  itemKey?: string
  /** Subagente (abre a folha dele) ou pedido pendente (abre o cartão). */
  agentId?: string
  requestId?: string
  /** Turno recolhido: quantos passos estão escondidos. */
  folded?: number
  /** "+N ações" / "Mostrar menos": o nó cujas pontas o toque abre ou fecha. */
  toggles?: string
  children: MindNode[]
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Primeira frase de um texto em markdown, sem marcação; corta se for longa. */
export function firstSentence(text: string, max = 90): string {
  const line = text.split('\n').find((l) => l.replace(/[#>*_`\-\s|]/g, '').length > 0) ?? ''
  const plain = line.replace(/^[#>\-*\s]+|[*_`]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()
  const sentence = plain.match(/^.+?[.!?:](?=\s|$)/)?.[0] ?? plain
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence
}

const basename = (path: string) => path.replace(/\/+$/, '').split('/').pop() || path

function hostPath(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return url
  }
}

function toolStatus(e: ToolEntry, pending: Set<string>): MindStatus {
  if (pending.has(e.use.id)) return 'waiting'
  if (!e.result) return 'running'
  return e.result.isError ? 'failed' : 'done'
}

const READS = new Set(['Read'])
const WRITES = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
// Encanamento do próprio Claude Code: não diz nada sobre o caminho que ele seguiu.
const HIDDEN = new Set(['ToolSearch'])

function lineCount(text: unknown): number {
  return typeof text === 'string' && text ? text.split('\n').length : 0
}

/** Linhas colocadas e tiradas por uma edição (como no resumo do turno). */
function changed(use: ToolEntry['use']): { added: number; removed: number } {
  const input = use.input
  if (use.name === 'Edit') return { added: lineCount(input.new_string), removed: lineCount(input.old_string) }
  if (use.name === 'Write') return { added: lineCount(input.content), removed: 0 }
  if (use.name === 'NotebookEdit') return { added: lineCount(input.new_source), removed: 0 }
  if (use.name === 'MultiEdit' && Array.isArray(input.edits)) {
    return (input.edits as Record<string, unknown>[]).reduce<{ added: number; removed: number }>(
      (n, e) => ({ added: n.added + lineCount(e.new_string), removed: n.removed + lineCount(e.old_string) }),
      { added: 0, removed: 0 },
    )
  }
  return { added: 0, removed: 0 }
}

/** Junta estados de várias chamadas no mesmo nó: o que pede atenção vence. */
function worst(a: MindStatus, b: MindStatus): MindStatus {
  const rank: MindStatus[] = ['waiting', 'running', 'failed', 'stopped', 'done']
  return rank.indexOf(a) <= rank.indexOf(b) ? a : b
}

/** `scope`: o passo ou subagente dono das pontas (um arquivo aparece uma vez em cada). */
type Ctx = { branch: number; pending: Set<string>; agents: AgentTree; itemKey: string; scope: string }

/** As pontas de um passo: cada arquivo uma vez só (lido e editado juntos), o resto na ordem. */
function leaves(entries: ActivityEntry[], ctx: Ctx): MindNode[] {
  const out: MindNode[] = []
  const files = new Map<string, MindNode & { reads: number; writes: number; added: number; removed: number; created: boolean }>()

  for (const e of entries) {
    if (e.kind !== 'tool' || HIDDEN.has(e.use.name)) continue
    const { name, input } = e.use
    const base = { branch: ctx.branch, itemKey: ctx.itemKey, tool: name, status: toolStatus(e, ctx.pending), children: [] }

    if (AGENT_TOOLS.has(name)) {
      const agent = ctx.agents.byId.get(e.use.id)
      out.push({
        ...base,
        id: e.use.id,
        kind: 'agent',
        label: str(input.description) || str(input.subagent_type) || 'Subagente',
        meta: [agent?.type ?? (str(input.subagent_type) || undefined), agent?.background && 'segundo plano'].filter(Boolean).join(' · '),
        status: agent?.status ?? base.status,
        agentId: e.use.id,
        children: leaves(e.inner ?? [], { ...ctx, scope: e.use.id }),
      })
      continue
    }

    const path = str(input.file_path) || str(input.notebook_path)
    if (path && (READS.has(name) || WRITES.has(name))) {
      let file = files.get(path)
      if (!file) {
        file = { ...base, id: `${ctx.scope}:${path}`, kind: 'file', label: basename(path), reads: 0, writes: 0, added: 0, removed: 0, created: false }
        files.set(path, file)
        out.push(file)
      } else {
        file.status = worst(file.status, base.status)
      }
      if (WRITES.has(name)) {
        file.writes++
        file.tool = name
        if (name === 'Write') file.created = true
        if (base.status === 'done') {
          const { added, removed } = changed(e.use)
          file.added += added
          file.removed += removed
        }
      } else {
        file.reads++
      }
      continue
    }

    if (name === 'Bash') {
      out.push({ ...base, id: e.use.id, kind: 'command', label: str(input.description) || str(input.command).split('\n')[0] })
    } else if (name === 'Grep' || name === 'Glob') {
      out.push({ ...base, id: e.use.id, kind: 'search', label: str(input.pattern) })
    } else if (name === 'WebFetch') {
      out.push({ ...base, id: e.use.id, kind: 'web', label: hostPath(str(input.url)) })
    } else if (name === 'WebSearch') {
      out.push({ ...base, id: e.use.id, kind: 'web', label: str(input.query) })
    } else {
      const label = name.startsWith('mcp__') ? name.split('__').slice(1).join(' · ') : name
      const detail = toolSummary(name, input)
      out.push({ ...base, id: e.use.id, kind: 'tool', label: detail ? `${label}: ${detail}` : label })
    }
  }

  for (const f of files.values()) {
    // Ainda não aconteceu (ou foi negado): não dá para dizer "criou".
    if (f.status === 'waiting') f.meta = 'aguarda você'
    else if (f.status === 'running') f.meta = f.created ? 'criando' : f.writes ? 'editando' : 'lendo'
    else if (f.status === 'failed' && !f.added && !f.removed) f.meta = 'falhou'
    if (f.meta) continue
    const ops = [
      f.writes ? (f.created ? 'criou' : 'editou') : '',
      f.added || f.removed ? `+${f.added} −${f.removed}` : '',
      !f.writes ? (f.reads > 1 ? `leu ×${f.reads}` : 'leu') : '',
    ]
    f.meta = ops.filter(Boolean).join(' ')
  }
  return out
}

/** Título de um passo sem fala do Claude antes: o raciocínio, se veio, ou o que ele mais fez. */
function autoLabel(entries: ActivityEntry[]): string {
  const thought = entries.find((e) => e.kind === 'thinking')
  if (thought) return firstSentence(thought.text)
  const tools = entries.filter((e): e is ToolEntry => e.kind === 'tool')
  const count = (names: Set<string> | string[]) => tools.filter((t) => (Array.isArray(names) ? names.includes(t.use.name) : names.has(t.use.name))).length
  const n = (k: number, one: string, many: string) => (k === 1 ? one : many.replace('#', String(k)))
  const kinds: [number, string][] = [
    [count(WRITES), n(count(WRITES), 'Editando um arquivo', 'Editando # arquivos')],
    [count(AGENT_TOOLS), n(count(AGENT_TOOLS), 'Chamando um subagente', 'Chamando # subagentes')],
    [count(['Bash']), n(count(['Bash']), 'Rodando um comando', 'Rodando # comandos')],
    [count(READS), n(count(READS), 'Lendo um arquivo', 'Lendo # arquivos')],
    [count(['Grep', 'Glob']), 'Procurando no código'],
    [count(['WebFetch', 'WebSearch']), 'Pesquisando na web'],
  ]
  return kinds.find(([k]) => k > 0)?.[1] ?? 'Trabalhando'
}

const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`

type Turn = MindNode & { done?: boolean }

export function mindTree({
  items,
  title,
  rootMeta,
  working,
  streaming,
  agents,
}: {
  items: Item[]
  title: string
  rootMeta: string
  /** O processo do painel está no meio de um turno. */
  working: boolean
  /** Texto que o Claude está escrevendo agora. */
  streaming: string
  agents: AgentTree
}): MindNode {
  const pending = new Set(items.flatMap((i) => (i.type === 'approval' && !i.resolution && i.req.toolUseId ? [i.req.toolUseId] : [])))
  const turns: Turn[] = []
  let turn: Turn | null = null
  // Fala do Claude ainda sem destino: vira o título do próximo passo, ou a resposta se o turno acabar.
  let said: Extract<Item, { type: 'assistant' }> | null = null

  const ensureTurn = (key: string): Turn => {
    if (!turn) {
      turn = { id: `t:${key}`, kind: 'turn', label: 'Começo da conversa', status: 'done', branch: turns.length, children: [] }
      turns.push(turn)
    }
    return turn
  }
  const add = (node: Omit<MindNode, 'branch' | 'children'> & { children?: MindNode[] }, key: string) => {
    const t = ensureTurn(key)
    // Depois do fim do turno: o Claude voltou sozinho (uma tarefa em segundo plano terminou).
    t.done = false
    t.children.push({ ...node, branch: t.branch, children: node.children ?? [] })
  }
  const flushSaid = (kind: 'step' | 'answer') => {
    if (!said) return
    add({ id: said.key, kind, label: firstSentence(said.text), status: 'done', itemKey: said.key }, said.key)
    said = null
  }

  for (const item of items) {
    switch (item.type) {
      case 'user': {
        flushSaid('answer')
        const label = firstSentence(item.text, 80) || (item.images?.length ? plural(item.images.length, 'imagem', 'imagens') : '…')
        turn = { id: item.key, kind: 'turn', label, status: 'done', branch: turns.length, itemKey: item.key, children: [] }
        turns.push(turn)
        break
      }
      case 'assistant':
        // Duas falas seguidas: a primeira fica como um passo sem ações.
        flushSaid('step')
        said = item
        break
      case 'activity': {
        const t = ensureTurn(item.key)
        const ctx = { branch: t.branch, pending, agents, itemKey: said?.key ?? item.key, scope: item.key }
        const kids = leaves(item.entries, ctx)
        if (!kids.length && !said) break
        const status = kids.reduce<MindStatus>((s, k) => worst(s, k.status === 'failed' ? 'done' : k.status), 'done')
        add(
          {
            id: said?.key ?? item.key,
            kind: 'step',
            label: said ? firstSentence(said.text) : autoLabel(item.entries),
            meta: kids.length ? plural(kids.length, 'ação', 'ações') : undefined,
            status,
            itemKey: said?.key ?? item.key,
            children: kids,
          },
          item.key,
        )
        said = null
        break
      }
      case 'approval': {
        flushSaid('step')
        const open = !item.resolution
        add(
          {
            id: item.key,
            kind: 'approval',
            label: item.req.title || `${item.req.toolName}: ${toolSummary(item.req.toolName, item.req.input)}`,
            meta: open ? 'Pede aprovação' : item.resolution === 'allow' ? 'Aprovado' : item.resolution === 'deny' ? 'Negado' : 'Cancelado',
            tool: item.req.toolName,
            status: open ? 'waiting' : item.resolution === 'allow' ? 'done' : 'stopped',
            itemKey: item.key,
            requestId: open ? item.req.requestId : undefined,
          },
          item.key,
        )
        break
      }
      case 'question': {
        flushSaid('step')
        const open = !item.resolution
        add(
          {
            id: item.key,
            kind: 'question',
            label: item.req.questions.map((q) => q.question).join(' · '),
            meta: open ? 'Pergunta para você' : item.resolution?.decision === 'answered' ? 'Respondida' : 'Sem resposta',
            status: open ? 'waiting' : 'done',
            itemKey: item.key,
            requestId: open ? item.req.requestId : undefined,
          },
          item.key,
        )
        break
      }
      case 'result': {
        flushSaid('answer')
        const t = ensureTurn(item.key)
        const r = item.result
        t.done = true
        t.status = r.ok ? 'done' : r.subtype === 'error_during_execution' ? 'stopped' : 'failed'
        t.meta = r.ok ? duration(r.durationMs) : r.subtype === 'error_during_execution' ? 'Interrompido' : 'Terminou com erro'
        break
      }
      case 'compacting':
        add({ id: item.key, kind: 'notice', label: 'Compactou o contexto', status: 'done', itemKey: item.key }, item.key)
        break
    }
  }

  // O que sobrou: no turno em andamento é o que ele está pensando agora; num turno encerrado, a resposta.
  const last = turns.at(-1)
  const live = working && last && !last.done
  flushSaid(live ? 'step' : 'answer')
  if (streaming && live) {
    add({ id: 'streaming', kind: 'step', label: firstSentence(streaming) || 'Escrevendo…', status: 'running' }, 'streaming')
  }

  for (const t of turns) {
    const steps = t.children.filter((c) => c.kind !== 'notice').length
    if (t.children.some((c) => c.status === 'waiting')) t.status = 'waiting'
    else if (t === last && live) t.status = 'running'
    t.meta = [steps && plural(steps, 'passo', 'passos'), t.meta].filter(Boolean).join(' · ') || undefined
  }

  // No turno em andamento, o último passo é onde ele está agora (se nada mais estiver rodando).
  if (live && last && !hasActive(last)) {
    const now = last.children.at(-1)
    if (now) now.status = 'running'
  }

  return { id: 'root', kind: 'root', label: title, meta: rootMeta, status: working ? 'running' : 'done', branch: -1, children: turns }
}

function hasActive(node: MindNode): boolean {
  return node.children.some((c) => c.status === 'running' || c.status === 'waiting' || hasActive(c))
}

/** O nó a acompanhar ao vivo: um pedido esperando você, senão o mais fundo trabalhando, senão o último. */
export function focusOf(root: MindNode): MindNode {
  const flat: MindNode[] = []
  const walk = (n: MindNode) => {
    flat.push(n)
    n.children.forEach(walk)
  }
  walk(root)
  return flat.find((n) => n.status === 'waiting' && n.kind !== 'turn') ?? flat.findLast((n) => n.status === 'running' && n.kind !== 'root') ?? flat.at(-1)!
}

/** Pontas visíveis num passo fechado; as mais antigas viram "+N ações". */
const MAX_LEAVES = 6

/**
 * O que aparece na tela. Turnos antigos ficam recolhidos (abertos só o último, o que está em
 * andamento e os que esperam você); passos com muitas ações mostram as mais recentes, que é onde
 * ele está trabalhando. `open` guarda o que a pessoa abriu ou fechou à mão.
 */
export function fold(root: MindNode, open: ReadonlyMap<string, boolean>): MindNode {
  const last = root.children.at(-1)
  const turns = root.children.map((t) => {
    const shown = open.get(t.id) ?? (t === last || t.status === 'waiting' || t.status === 'running')
    return shown ? { ...t, children: t.children.map((c) => trim(c, open)) } : { ...t, children: [], folded: t.children.length }
  })
  return { ...root, children: turns }
}

function trim(n: MindNode, open: ReadonlyMap<string, boolean>): MindNode {
  const kids = n.children.map((c) => trim(c, open))
  if (kids.length <= MAX_LEAVES) return { ...n, children: kids }
  const toggle = (label: string): MindNode => ({ id: `${n.id}:more`, kind: 'more', label, status: 'done', branch: n.branch, toggles: n.id, children: [] })
  if (open.get(n.id)) return { ...n, children: [...kids, toggle('Mostrar menos')] }
  const hidden = kids.length - (MAX_LEAVES - 1)
  return { ...n, children: [toggle(`+${plural(hidden, 'ação', 'ações')}`), ...kids.slice(-(MAX_LEAVES - 1))] }
}
