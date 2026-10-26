import { open, readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { LiveSession } from './live.ts';
import { transcriptPath } from './transcript.ts';

/**
 * A salinha: cada conversa aberta é um setor e cada claudinho (a conversa e os subagentes dela)
 * vai até a estação do que está fazendo agora. Aqui sai o que cada um faz; o desenho é do celular.
 */

/** Estação da salinha: mesa com PC (web), gaveteiro (arquivos), bancada (edição), terminal, quadro, café, porta, sofá. */
export type OfficeActivity = 'web' | 'files' | 'edit' | 'command' | 'plan' | 'think' | 'ask' | 'background' | 'idle';

export type OfficeWorker = {
  id: string;
  name: string;
  /** "gestor" para a conversa; o tipo do subagente para os outros. */
  role: string;
  activity: OfficeActivity;
  /** "Read · manager.ts", "Pensando"… */
  detail?: string;
};

/** Ferramenta em uso: `scope` é a chamada do subagente que a usa (`null`: a própria conversa). */
export type OpenTool = { id: string; name: string; input: unknown; scope: string | null };

export const AGENT_TOOLS = new Set(['Agent', 'Task']);
const WEB = /^(WebFetch|WebSearch)$|^mcp__.*(browser|playwright|chrome|puppeteer|fetch|search)/i;
const FILES = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead']);
const EDIT = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const PLAN = new Set(['TodoWrite', 'ExitPlanMode', 'EnterPlanMode', 'Skill', 'Agent', 'Task']);

export function activityOf(tool: string): OfficeActivity {
  if (WEB.test(tool)) return 'web';
  if (FILES.has(tool)) return 'files';
  if (EDIT.has(tool)) return 'edit';
  if (PLAN.has(tool)) return 'plan';
  if (tool === 'AskUserQuestion') return 'ask';
  return 'command';
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** "Read · manager.ts", "Bash · Roda os testes", "WebSearch · claude code salinha". */
export function toolLine(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const label = name.startsWith('mcp__') ? name.split('__').slice(1).join(' · ') : name;
  let detail = '';
  if (name === 'Bash') detail = str(i.description) || str(i.command).split('\n')[0];
  else if (FILES.has(name) || EDIT.has(name)) detail = basename(str(i.file_path) || str(i.notebook_path) || str(i.path)) || str(i.pattern);
  else if (name === 'Grep' || name === 'Glob') detail = str(i.pattern);
  else if (name === 'WebFetch') detail = hostOf(str(i.url));
  else if (name === 'WebSearch') detail = str(i.query);
  else if (AGENT_TOOLS.has(name)) detail = str(i.description);
  if (FILES.has(name) && !detail) detail = str(i.pattern);
  const line = detail ? `${label} · ${detail}` : label;
  return line.length > 90 ? `${line.slice(0, 89)}…` : line;
}

type Agent = { id: string; name: string; type: string };

/**
 * Quem está na sala e o que faz, a partir das ferramentas em uso. Sem ferramenta rodando no
 * meio do turno, o claudinho está pensando (café); com subagentes trabalhando, coordena (quadro).
 */
export function workersFrom(o: {
  tools: OpenTool[];
  agents: Agent[];
  /** Turno em andamento. */
  busy: boolean;
  /** Esperando você (aprovação ou pergunta). */
  waiting: boolean;
  waitingFor?: string;
  /** Chamadas esperando aprovação: quem as fez vai até a porta. */
  asking: Set<string>;
  /** Algo em segundo plano vai trazer o Claude de volta. */
  background: boolean;
}): OfficeWorker[] {
  const of = (scope: string | null) => o.tools.filter((t) => t.scope === scope);
  const doing = (scope: string | null): Pick<OfficeWorker, 'activity' | 'detail'> | null => {
    const tools = of(scope);
    const asked = tools.find((t) => o.asking.has(t.id));
    if (asked) return { activity: 'ask', detail: `Pede aprovação: ${toolLine(asked.name, asked.input)}` };
    const own = tools.filter((t) => !AGENT_TOOLS.has(t.name)).at(-1);
    if (own) return { activity: activityOf(own.name), detail: toolLine(own.name, own.input) };
    if (tools.length) return { activity: 'plan', detail: 'Coordenando os subagentes' };
    return null;
  };

  let lead = doing(null);
  if (!lead && o.waiting) lead = { activity: 'ask', detail: o.waitingFor === 'input needed' ? 'Pergunta para você' : 'Pede você' };
  if (!lead && o.busy) lead = { activity: 'think', detail: 'Pensando' };
  if (!lead && o.agents.length) lead = { activity: 'plan', detail: 'Esperando os subagentes' };
  if (!lead) lead = o.background ? { activity: 'background', detail: 'Algo rodando em segundo plano' } : { activity: 'idle', detail: 'Descansando' };

  return [
    { id: 'lead', name: 'Gestor', role: 'gestor', ...lead },
    ...o.agents.map((a) => ({ id: a.id, name: a.name, role: a.type, ...(doing(a.id) ?? { activity: 'think' as const, detail: 'Pensando' }) })),
  ];
}

// ---------------------------------------------------------------------------
// Conversas abertas no PC: o que fazem sai do fim do transcript, que o Claude Code grava ao vivo.
// ---------------------------------------------------------------------------

const TAIL_BYTES = 256 * 1024;
// Subagente cujo transcript não muda há mais que isso terminou (ou está parado esperando).
const AGENT_FRESH_MS = 45_000;

type Block = { type?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string };
type Line = { type?: string; isSidechain?: boolean; message?: { content?: unknown } };

async function tail(path: string): Promise<string[]> {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    await file.read(buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    // A primeira linha do pedaço pode ter vindo cortada.
    return start > 0 ? lines.slice(1) : lines;
  } finally {
    await file.close();
  }
}

/** Ferramentas chamadas e ainda sem resultado, na ordem. */
async function openTools(path: string, scope: string | null, sidechain: boolean): Promise<OpenTool[]> {
  const open = new Map<string, OpenTool>();
  for (const raw of await tail(path).catch(() => [])) {
    if (!raw.includes('"tool_use"') && !raw.includes('"tool_result"')) continue;
    let e: Line;
    try {
      e = JSON.parse(raw) as Line;
    } catch {
      continue;
    }
    // Transcripts antigos guardavam os subagentes no arquivo da conversa, marcados como `isSidechain`.
    if (!sidechain && e.isSidechain) continue;
    const blocks = Array.isArray(e.message?.content) ? (e.message.content as Block[]) : [];
    for (const b of blocks) {
      if (e.type === 'assistant' && b.type === 'tool_use' && b.id && b.name) open.set(b.id, { id: b.id, name: b.name, input: b.input, scope });
      if (e.type === 'user' && b.type === 'tool_result' && b.tool_use_id) open.delete(b.tool_use_id);
    }
  }
  return [...open.values()];
}

type AgentFile = Agent & { path: string };

/** Subagentes com transcript mexido há pouco, com nome e tipo do `.meta.json` ao lado. */
async function freshAgents(sessionPath: string, sessionId: string): Promise<AgentFile[]> {
  const dir = join(dirname(sessionPath), sessionId, 'subagents');
  const out: AgentFile[] = [];
  for (const name of await readdir(dir).catch(() => [])) {
    const id = name.match(/^agent-(.+)\.jsonl$/)?.[1];
    if (!id) continue;
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (!info || Date.now() - info.mtimeMs > AGENT_FRESH_MS) continue;
    const meta = JSON.parse(await readFile(join(dir, `agent-${id}.meta.json`), 'utf8').catch(() => '{}')) as {
      agentType?: string;
      description?: string;
    };
    out.push({ id, path, name: meta.description || meta.agentType || 'Subagente', type: meta.agentType || 'subagente' });
  }
  return out;
}

export async function pcWorkers(sessionId: string, live: LiveSession): Promise<OfficeWorker[]> {
  const base = { asking: new Set<string>(), background: false, waitingFor: live.waitingFor };
  if (live.status === 'idle') return workersFrom({ ...base, tools: [], agents: [], busy: false, waiting: false });
  const path = await transcriptPath(sessionId);
  if (!path) return workersFrom({ ...base, tools: [], agents: [], busy: live.status === 'busy', waiting: live.status === 'waiting' });
  const agents = await freshAgents(path, sessionId);
  const tools = [
    ...(await openTools(path, null, false)),
    ...(await Promise.all(agents.map((a) => openTools(a.path, a.id, true)))).flat(),
  ];
  return workersFrom({ ...base, tools, agents, busy: live.status === 'busy', waiting: live.status === 'waiting' });
}
