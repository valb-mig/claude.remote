import type { Attachment } from './attachments'
import { kvDel, kvGet, kvSet } from './db'

/** Rascunho de um campo de mensagem: o que já foi digitado (ou ditado) e anexado. */
export type Draft = { text: string; attachments: Attachment[] }

/**
 * Em memória, para trocar de conversa sem esperar o banco; no banco, para sobreviver a recarregar
 * a tela (Atualizar, Android fechando o app em segundo plano). Texto e anexos em chaves separadas:
 * digitar não regrava megas de anexos a cada letra.
 */
const memory = new Map<string, Draft>()
/** Última versão gravada no banco, para só regravar o que mudou. */
const stored = new Map<string, Draft>()
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>()
const textKey = (id: string) => `draft:${id}:text`
const filesKey = (id: string) => `draft:${id}:files`
const EMPTY: Draft = { text: '', attachments: [] }

/** Rascunho já em memória (síncrono), ou nada se precisa vir do banco. */
export const cachedDraft = (id: string) => memory.get(id)

export async function loadDraft(id: string): Promise<Draft | undefined> {
  const cached = memory.get(id)
  if (cached) return cached
  const [text, attachments] = await Promise.all([
    kvGet<string>(textKey(id)).catch(() => undefined),
    kvGet<Attachment[]>(filesKey(id)).catch(() => undefined),
  ])
  const draft = { text: text ?? '', attachments: attachments ?? [] }
  stored.set(id, draft)
  if (!draft.text && !draft.attachments.length) return undefined
  memory.set(id, draft)
  return draft
}

function write(id: string, draft: Draft): Promise<unknown> {
  const before = stored.get(id) ?? EMPTY
  stored.set(id, draft)
  const jobs: Promise<unknown>[] = []
  if (draft.text !== before.text) jobs.push(draft.text ? kvSet(textKey(id), draft.text) : kvDel(textKey(id)))
  if (draft.attachments !== before.attachments) {
    jobs.push(draft.attachments.length ? kvSet(filesKey(id), draft.attachments) : kvDel(filesKey(id)))
  }
  return Promise.all(jobs).catch(() => {})
}

/** Guarda na memória na hora e no banco com uma folga, para não gravar a cada letra. */
export function saveDraft(id: string, draft: Draft): void {
  if (draft.text || draft.attachments.length) memory.set(id, draft)
  else memory.delete(id)
  clearTimeout(pending.get(id)?.timer)
  const run = () => {
    pending.delete(id)
    void write(id, draft)
  }
  pending.set(id, { timer: setTimeout(run, 400), run })
}

/** Grava já no banco (ex.: antes de abrir a conversa que vai mostrar o rascunho). */
export async function putDraft(id: string, draft: Draft): Promise<void> {
  clearTimeout(pending.get(id)?.timer)
  pending.delete(id)
  memory.set(id, draft)
  await write(id, draft)
}

// Indo para segundo plano, o Android pode fechar o app a qualquer momento: grava o que falta já.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return
  for (const { timer, run } of [...pending.values()]) {
    clearTimeout(timer)
    run()
  }
})
