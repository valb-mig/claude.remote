import type {
  AttachmentPayload,
  CatalogEntry,
  CommandInfo,
  ContextUsage,
  FileView,
  GitStatus,
  LoggedEvent,
  ModelOption,
  RunOptions,
  TreeEntry,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.error ?? `HTTP ${status}`))
    this.status = status
    this.code = String(body.error ?? 'http_error')
    this.details = body
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

const post = <T = { ok: true }>(path: string, body: unknown = {}, signal?: AbortSignal) => request<T>('POST', path, body, signal)
const sid = (id: string) => `/api/sessions/${encodeURIComponent(id)}`
const project = (cwd: string, path?: string) =>
  `cwd=${encodeURIComponent(cwd)}${path !== undefined ? `&path=${encodeURIComponent(path)}` : ''}`

/** Arquivo do projeto como está (imagens, PDF), para abrir no navegador. */
export const fileRawUrl = (cwd: string, path: string) => `/api/file/raw?${project(cwd, path)}`

export const api = {
  health: () => request<{ ok: boolean; tailnetHost: string | null; startedAt: number; home: string }>('GET', '/api/health'),
  sessions: () => request<CatalogEntry[]>('GET', '/api/sessions'),
  projects: () => request<string[]>('GET', '/api/projects'),
  commands: (cwd: string) => request<CommandInfo[]>('GET', `/api/commands?cwd=${encodeURIComponent(cwd)}`),
  files: (cwd: string, q: string) =>
    request<string[]>('GET', `/api/files?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(q)}`),
  history: (id: string, limit = 300) => request<LoggedEvent[]>('GET', `${sid(id)}/history?limit=${limit}`),

  create: (body: RunOptions & { cwd?: string; prompt: string; title?: string; attachments?: AttachmentPayload[] }) =>
    post<{ sessionId: string }>('/api/sessions', body),
  open: (id: string, body: RunOptions & { fork?: boolean } = {}) => post<{ sessionId: string }>(`${sid(id)}/open`, body),
  takeover: (id: string) => post<{ sessionId: string }>(`${sid(id)}/takeover`),
  release: (id: string) => post<{ resumeCommand: string }>(`${sid(id)}/release`),

  /** `clientId` identifica a mensagem da fila: reenviar a mesma não repete o turno. */
  send: (id: string, body: { text: string; attachments?: AttachmentPayload[]; clientId?: string }, signal?: AbortSignal) =>
    post(`${sid(id)}/messages`, body, signal),
  interrupt: (id: string) => post(`${sid(id)}/interrupt`),
  pin: (id: string, pinned: boolean) => post(`${sid(id)}/pin`, { pinned }),
  remove: (id: string) => post(`${sid(id)}/delete`),
  tree: (cwd: string, path: string) => request<TreeEntry[]>('GET', `/api/tree?${project(cwd, path)}`),
  file: (cwd: string, path: string) => request<FileView>('GET', `/api/file?${project(cwd, path)}`),
  git: (cwd: string) => request<GitStatus | null>('GET', `/api/git?${project(cwd)}`),
  gitDiff: (cwd: string, path: string) => request<{ diff: string }>('GET', `/api/git/diff?${project(cwd, path)}`),
  rename: (id: string, title: string) => post(`${sid(id)}/rename`, { title }),
  settings: (id: string, body: RunOptions) => post(`${sid(id)}/settings`, body),
  context: (id: string) => request<ContextUsage>('GET', `${sid(id)}/context`),
  models: () => request<ModelOption[]>('GET', '/api/models'),
  approve: (id: string, requestId: string, body: { allow: boolean; always?: boolean; message?: string }) =>
    post(`${sid(id)}/approvals/${requestId}`, body),
  answer: (id: string, requestId: string, body: { answers?: Record<string, string>; decline?: boolean }) =>
    post(`${sid(id)}/questions/${requestId}`, body),
}

/** Mensagens legíveis para os códigos de erro do backend. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return err instanceof Error ? err.message : String(err)
  const status = String(err.details.status ?? '')
  switch (err.code) {
    case 'busy_on_pc':
      return status === 'waiting'
        ? 'A sessão está esperando uma resposta no PC. Responda lá ou aguarde.'
        : 'A sessão está trabalhando no PC. Aguarde ficar ociosa para assumir.'
    case 'live_on_pc':
      return 'Esta sessão está aberta no PC. Use "Assumir" para trazê-la para cá.'
    case 'unsupported_entrypoint':
      return 'Sessões abertas no VSCode não podem ser assumidas. Feche-a no VSCode primeiro.'
    case 'session_busy':
      return 'A sessão ainda está trabalhando. Interrompa ou aguarde para liberar.'
    case 'cwd_outside_roots':
      return 'Esse diretório está fora das pastas de projetos permitidas.'
    case 'attachment_too_large':
      return `O anexo ${String(err.details.name ?? '')} passa de 25 MB.`
    case 'empty_message':
      return 'Escreva algo ou anexe um arquivo.'
    case 'session_exited':
    case 'not_open_in_panel':
      return 'A sessão não está mais aberta no painel.'
    case 'session_not_found':
      return 'A conversa não existe mais.'
    default:
      return err.code
  }
}

/** URL de uma imagem do chat: chave no cache do PC ou data URL já pronta. */
export function imageUrl(sessionId: string, key: string): string {
  return key.startsWith('data:') ? key : `${sid(sessionId)}/images/${encodeURIComponent(key)}`
}
