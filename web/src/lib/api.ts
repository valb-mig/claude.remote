import { HOME, baseOf, machineOf } from './machines'
import type {
  Activity,
  AttachmentPayload,
  CommandInfo,
  ContextUsage,
  FileView,
  GitStatus,
  LoggedEvent,
  ModelOption,
  OfficeRoom,
  PushPrefs,
  RunOptions,
  SessionCost,
  TreeEntry,
  UpdateStatus,
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

async function request<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
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
// Cada conversa vai para a máquina dela; o resto, para a máquina pedida (ver machines.ts).
const sid = (id: string) => `${baseOf(machineOf(id))}/api/sessions/${encodeURIComponent(id)}`
const at = (machine: string) => `${baseOf(machine)}/api`
const project = (cwd: string, path?: string) =>
  `cwd=${encodeURIComponent(cwd)}${path !== undefined ? `&path=${encodeURIComponent(path)}` : ''}`

/** Arquivo do projeto como está (imagens, PDF), para abrir no navegador. */
export const fileRawUrl = (m: string, cwd: string, path: string) => `${at(m)}/file/raw?${project(cwd, path)}`

export const api = {
  health: (m: string) =>
    request<{ ok: boolean; name?: string; tailnetHost: string | null; startedAt: number; home: string }>('GET', `${at(m)}/health`),
  projects: (m: string) => request<string[]>('GET', `${at(m)}/projects`),
  /** A salinha: o que cada claudinho de cada conversa aberta faz agora. */
  office: (m: string) => request<OfficeRoom[]>('GET', `${at(m)}/office`),
  /** Uso por dia para a home (grid do ano, gráficos, projetos). */
  activity: (m: string) => request<Activity>('GET', `${at(m)}/activity`),
  commands: (m: string, cwd: string) => request<CommandInfo[]>('GET', `${at(m)}/commands?cwd=${encodeURIComponent(cwd)}`),
  files: (m: string, cwd: string, q: string) =>
    request<string[]>('GET', `${at(m)}/files?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(q)}`),
  history: (id: string, limit = 300) => request<LoggedEvent[]>('GET', `${sid(id)}/history?limit=${limit}`),
  /** Ditado pelo Whisper na máquina desta página (navegadores sem reconhecimento de voz). `audio`: WAV em base64. */
  transcribeStatus: () => request<{ available: boolean }>('GET', `${at(HOME)}/transcribe`),
  transcribe: (audio: string) => post<{ text: string }>(`${at(HOME)}/transcribe`, { audio }),
  /** O que um subagente fez, do transcript salvo no PC; `agentId`, se já se sabe, poupa a busca. */
  agent: (id: string, toolUseId: string, agentId?: string) =>
    request<LoggedEvent[]>('GET', `${sid(id)}/agents/${encodeURIComponent(toolUseId)}${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`),

  create: (m: string, body: RunOptions & { cwd?: string; prompt: string; title?: string; attachments?: AttachmentPayload[] }) =>
    post<{ sessionId: string }>(`${at(m)}/sessions`, body),
  open: (id: string, body: RunOptions & { fork?: boolean } = {}) => post<{ sessionId: string }>(`${sid(id)}/open`, body),
  takeover: (id: string) => post<{ sessionId: string }>(`${sid(id)}/takeover`),
  release: (id: string) => post<{ resumeCommand: string }>(`${sid(id)}/release`),

  /** `clientId` identifica a mensagem da fila: reenviar a mesma não repete o turno. */
  send: (id: string, body: { text: string; attachments?: AttachmentPayload[]; clientId?: string }, signal?: AbortSignal) =>
    post(`${sid(id)}/messages`, body, signal),
  interrupt: (id: string) => post(`${sid(id)}/interrupt`),
  pin: (id: string, pinned: boolean) => post(`${sid(id)}/pin`, { pinned }),
  remove: (id: string) => post(`${sid(id)}/delete`),
  tree: (m: string, cwd: string, path: string) => request<TreeEntry[]>('GET', `${at(m)}/tree?${project(cwd, path)}`),
  file: (m: string, cwd: string, path: string) => request<FileView>('GET', `${at(m)}/file?${project(cwd, path)}`),
  git: (m: string, cwd: string) => request<GitStatus | null>('GET', `${at(m)}/git?${project(cwd)}`),
  gitDiff: (m: string, cwd: string, path: string) => request<{ diff: string }>('GET', `${at(m)}/git/diff?${project(cwd, path)}`),
  update: (m: string) => request<UpdateStatus>('GET', `${at(m)}/update`),
  startUpdate: (m: string) => post<UpdateStatus>(`${at(m)}/update`),
  restartNow: (m: string) => post(`${at(m)}/update/restart`),
  rename: (id: string, title: string) => post(`${sid(id)}/rename`, { title }),
  settings: (id: string, body: RunOptions) => post(`${sid(id)}/settings`, body),
  context: (id: string) => request<ContextUsage>('GET', `${sid(id)}/context`),
  /** Tokens e custo estimado da conversa inteira, lidos do transcript salvo no PC. */
  cost: (id: string) => request<SessionCost>('GET', `${sid(id)}/cost`),
  models: (m: string) => request<ModelOption[]>('GET', `${at(m)}/models`),
  /** Tarefa em segundo plano (monitor, comando): o fim da saída e parar. */
  taskOutput: (id: string, taskId: string) =>
    request<{ output: string; totalBytes: number }>('GET', `${sid(id)}/tasks/${encodeURIComponent(taskId)}/output`),
  stopTask: (id: string, taskId: string) => post(`${sid(id)}/tasks/${encodeURIComponent(taskId)}/stop`),
  approve: (id: string, requestId: string, body: { allow: boolean; always?: boolean; message?: string }) =>
    post(`${sid(id)}/approvals/${requestId}`, body),
  answer: (id: string, requestId: string, body: { answers?: Record<string, string>; decline?: boolean }) =>
    post(`${sid(id)}/questions/${requestId}`, body),

  pushKey: () => request<{ publicKey: string }>('GET', '/api/push/key'),
  pushSubscribe: (subscription: PushSubscriptionJSON, prefs: PushPrefs) => post('/api/push/subscribe', { subscription, prefs }),
  pushUnsubscribe: (endpoint: string) => post('/api/push/unsubscribe', { endpoint }),
  pushTest: (endpoint: string) => post('/api/push/test', { endpoint }),
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
      return err.details.agents
        ? 'Ainda há subagentes trabalhando. Aguarde terminarem para liberar.'
        : 'A sessão ainda está trabalhando. Interrompa ou aguarde para liberar.'
    case 'task_not_found':
      return 'Essa tarefa não está mais rodando.'
    case 'task_output_unsupported':
      return 'Esta versão do Claude Code não mostra a saída da tarefa.'
    case 'whisper_unavailable':
      return 'O Whisper não está instalado no PC.'
    case 'transcribe_failed':
    case 'invalid_audio':
      return 'O Whisper não conseguiu transcrever o áudio.'
    case 'transcribe_timeout':
      return 'A transcrição demorou demais. Tente um trecho mais curto.'
    case 'audio_too_long':
      return 'Gravação longa demais: até 10 minutos.'
    case 'agent_not_found':
      return 'O registro deste subagente não está no PC.'
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
    case 'subscription_not_found':
      return 'O PC não conhece este aparelho. Desative e ative as notificações de novo.'
    case 'update_running':
      return 'Uma atualização já está em andamento.'
    case 'update_dirty':
      return 'O repositório no PC tem mudanças não commitadas. Resolva pelo terminal.'
    case 'update_diverged':
      return 'A main do PC tem commits que não estão no GitHub. Resolva pelo terminal.'
    case 'update_busy':
      return `Espere terminar: ${((err.details.sessions as string[] | undefined) ?? []).join(', ')}.`
    case 'update_up_to_date':
      return 'O PC já está na versão mais nova.'
    case 'update_fetch_failed':
      return 'Não deu para falar com o GitHub.'
    case 'update_no_service':
      return 'O servidor não roda como serviço. Reinicie pelo terminal.'
    case 'push_failed':
      return `O serviço de push recusou o aviso${err.details.status ? ` (HTTP ${String(err.details.status)})` : ''}.`
    default:
      return err.code
  }
}

/** URL de uma imagem do chat: chave no cache do PC ou data URL já pronta. */
export function imageUrl(sessionId: string, key: string): string {
  return key.startsWith('data:') ? key : `${sid(sessionId)}/images/${encodeURIComponent(key)}`
}

/** Versão reduzida para miniaturas (o PC gera, até 512 px); a ampliada usa `imageUrl`. */
export function thumbUrl(sessionId: string, key: string): string {
  return key.startsWith('data:') ? key : `${imageUrl(sessionId, key)}?thumb=1`
}
