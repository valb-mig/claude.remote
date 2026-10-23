// Espelho dos tipos do backend (server/src/events.ts e manager.ts).

export type SessionState = 'starting' | 'running' | 'waiting' | 'idle' | 'exited';
export type CatalogState = 'running' | 'waiting' | 'idle' | 'stopped';
export type PendingKind = 'approval' | 'question';

export type Question = {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string; preview?: string }[];
};

export type PanelEvent =
  /** `images`: chaves das imagens no PC (GET /api/sessions/:id/images/:key); `clientId`: ID na fila do celular. */
  | { kind: 'user'; text: string; images?: string[]; clientId?: string }
  | { kind: 'notice'; text: string }
  | { kind: 'assistant'; text: string; parentToolUseId?: string | null }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: Record<string, unknown>; parentToolUseId?: string | null }
  | { kind: 'tool_result'; toolUseId: string; isError: boolean; text: string; images?: string[] }
  | { kind: 'settings'; model?: string; effort?: string | null; permissionMode?: string }
  | { kind: 'init'; model: string; permissionMode: string; cwd: string }
  | { kind: 'status'; status: string }
  | { kind: 'state'; state: SessionState; waitingFor?: string }
  | {
      kind: 'approval_request';
      requestId: string;
      toolName: string;
      input: Record<string, unknown>;
      title?: string;
      decisionReason?: string;
      blockedPath?: string;
      canAlwaysAllow: boolean;
    }
  | { kind: 'approval_resolved'; requestId: string; decision: 'allow' | 'deny' | 'cancelled' }
  | { kind: 'question_request'; requestId: string; questions: Question[] }
  | {
      kind: 'question_resolved';
      requestId: string;
      decision: 'answered' | 'declined' | 'cancelled';
      answers?: Record<string, string>;
    }
  | { kind: 'result'; ok: boolean; subtype: string; durationMs: number; costUsd?: number; turns: number }
  | { kind: 'exit'; error?: string };

export type LoggedEvent = PanelEvent & { seq: number; ts: number };

export type CatalogEntry = {
  sessionId: string;
  title: string;
  cwd?: string;
  gitBranch?: string;
  lastModified: number;
  owner: 'panel' | 'pc' | null;
  state: CatalogState;
  waitingFor?: string;
  pcKind?: 'interactive' | 'background';
  pending?: { requestId: string; kind: PendingKind }[];
  pinned?: boolean;
  /** Máquina da conversa, posta pelo app ao juntar as de todas (ver machines.ts); `''` é a desta página. */
  machine?: string;
};

export type RunOptions = {
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk';
};

export type CommandInfo = { name: string; description: string; argumentHint: string; builtin: boolean }

export type AttachmentPayload = { name: string; mediaType: string; data: string; thumb?: string }

export type SystemSnapshot = {
  at: number
  cpu: { percent: number; cores: number; load: [number, number, number] }
  memory: { total: number; used: number; swapTotal: number; swapUsed: number }
  claude: { processes: number; rss: number }
  uptimeSec: number
}

export type UsageWindow = { utilization: number | null; resetsAt: string | null }

export type UsageSnapshot = {
  plan: {
    subscription: string | null
    available: boolean
    fiveHour: UsageWindow | null
    sevenDay: UsageWindow | null
    models: (UsageWindow & { name: string })[]
    extraUsage: { utilization: number | null } | null
  } | null
  planError?: string
  planAt?: number
}

export type SessionSettings = { model?: string; effort?: string | null; permissionMode?: string }

export type ContextUsage = {
  model: string
  totalTokens: number
  maxTokens: number
  autoCompactThreshold: number | null
  autoCompactEnabled: boolean
}

export type ModelOption = { value: string; resolvedModel?: string; displayName: string; efforts: string[] }

export type TreeEntry = { name: string; path: string; type: 'dir' | 'file'; size?: number; ignored?: boolean }

export type FileView =
  | { kind: 'text'; size: number; content: string; truncated: boolean }
  | { kind: 'image' | 'pdf' | 'binary' | 'large'; size: number }

export type GitFile = {
  path: string
  from?: string
  index: string
  worktree: string
  untracked: boolean
  additions: number | null
  deletions: number | null
}

/** Atualizar o PC pelo celular (ver server/src/updater.ts). */
export type UpdateStep = 'fetch' | 'switch' | 'merge' | 'install' | 'build' | 'restart'
export type UpdateStatus = {
  branch: string | null
  target: string
  head: { sha: string; subject: string }
  incoming: { sha: string; subject: string }[]
  behind: number
  ahead: number
  dirty: boolean
  busy: string[]
  canRestart: boolean
  job: { step: UpdateStep; startedAt: number; error?: string; log?: string; done?: boolean } | null
  fetchError?: string
}

export type GitStatus = {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  files: GitFile[]
  /** Página do repositório no navegador (ex.: https://github.com/dono/repo). */
  remote: string | null
}


/** O que este aparelho quer receber além de perguntas, aprovações e erros, que sempre avisam. */
export type PushPrefs = { done: boolean; pc: boolean }

/** Aviso que o PC manda ao service worker (server/src/push.ts). */
export type PushPayload = { title: string; body: string; tag: string; url: string; ts: number }
