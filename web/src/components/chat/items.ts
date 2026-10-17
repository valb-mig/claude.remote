import type { PanelEvent } from '@/lib/types'

type Of<K extends PanelEvent['kind']> = Extract<PanelEvent, { kind: K }>
export type Keyed = PanelEvent & { key: string }

export type ActivityEntry =
  | { kind: 'tool'; key: string; use: Of<'tool_use'>; result?: Of<'tool_result'> }
  | { kind: 'thinking'; key: string; text: string }
  | { kind: 'subtext'; key: string; text: string }

/** Unidade de renderização do chat; ações consecutivas viram um bloco de atividade. */
export type Item =
  | { type: 'user'; key: string; text: string; images?: string[] }
  | { type: 'assistant'; key: string; text: string }
  | { type: 'notice'; key: string; text: string }
  | { type: 'activity'; key: string; entries: ActivityEntry[] }
  | { type: 'approval'; key: string; req: Of<'approval_request'>; resolution?: Of<'approval_resolved'>['decision'] }
  | { type: 'question'; key: string; req: Of<'question_request'>; resolution?: Of<'question_resolved'> }
  | { type: 'result'; key: string; result: Of<'result'> }
  | { type: 'exit'; key: string; error?: string }
  | { type: 'compacting'; key: string }

export function buildItems(events: Keyed[]): Item[] {
  const results = new Map<string, Of<'tool_result'>>()
  const approvals = new Map<string, Of<'approval_resolved'>['decision']>()
  const questions = new Map<string, Of<'question_resolved'>>()
  for (const e of events) {
    if (e.kind === 'tool_result') results.set(e.toolUseId, e)
    if (e.kind === 'approval_resolved') approvals.set(e.requestId, e.decision)
    if (e.kind === 'question_resolved') questions.set(e.requestId, e)
  }

  const items: Item[] = []
  let activity: Extract<Item, { type: 'activity' }> | null = null
  const addEntry = (entry: ActivityEntry, key: string) => {
    if (!activity) {
      activity = { type: 'activity', key, entries: [] }
      items.push(activity)
    }
    activity.entries.push(entry)
  }
  const push = (item: Item) => {
    activity = null
    items.push(item)
  }

  for (const e of events) {
    switch (e.kind) {
      case 'tool_use':
        addEntry({ kind: 'tool', key: e.key, use: e, result: results.get(e.id) }, e.key)
        break
      case 'thinking':
        addEntry({ kind: 'thinking', key: e.key, text: e.text }, e.key)
        break
      case 'assistant':
        if (e.parentToolUseId) addEntry({ kind: 'subtext', key: e.key, text: e.text }, e.key)
        else push({ type: 'assistant', key: e.key, text: e.text })
        break
      case 'user':
        push({ type: 'user', key: e.key, text: e.text, images: e.images })
        break
      case 'notice':
        push({ type: 'notice', key: e.key, text: e.text })
        break
      case 'approval_request':
        push({ type: 'approval', key: e.key, req: e, resolution: approvals.get(e.requestId) })
        break
      case 'question_request':
        push({ type: 'question', key: e.key, req: e, resolution: questions.get(e.requestId) })
        break
      case 'result':
        push({ type: 'result', key: e.key, result: e })
        break
      case 'exit':
        push({ type: 'exit', key: e.key, error: e.error })
        break
      case 'status':
        if (e.status === 'compacting') push({ type: 'compacting', key: e.key })
        break
    }
  }
  return items
}
