import { createReadStream, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { LogController } from 'fastify';
import type { WebSocket } from 'ws';
import { mkdir } from 'node:fs/promises';
import type { Attachment } from './attachments.ts';
import { HOST, PORT, UPLOADS_DIR, WEB_DIST } from './config.ts';
import { HttpError } from './errors.ts';
import { listDir, rawProjectFile, readProjectFile } from './explorer.ts';
import { gitDiff, gitStatus } from './git.ts';
import type { LoggedEvent } from './events.ts';
import { accessGuard, loadAccessPolicy, refreshTailnet } from './guard.ts';
import { LiveRegistry } from './live.ts';
import { Manager } from './manager.ts';
import { MetaStore } from './meta.ts';
import { Notifier } from './notifier.ts';
import { PushService, type PushPrefs, type PushSubscriptionInput } from './push.ts';
import { SystemMonitor } from './system.ts';

await mkdir(UPLOADS_DIR, { recursive: true });
const live = new LiveRegistry();
const meta = new MetaStore();
await meta.load();
const manager = new Manager(live, meta);
const monitor = new SystemMonitor(() => manager.planUsage());
monitor.on('error', (err) => app.log.warn({ err }, 'falha ao amostrar o sistema'));
const policy = await loadAccessPolicy();
const push = new PushService();
await push.load();
push.on('error', (err) => app.log.warn({ err }, 'falha ao enviar notificação'));
new Notifier(manager, live, push);

const app = Fastify({ logger: { level: 'info' }, logController: new LogController({ disableRequestLogging: true }) });
await app.register(websocket);
app.addHook('onRequest', accessGuard(policy));

app.setErrorHandler((err: unknown, _req, reply) => {
  if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, ...err.details });
  const e = err as { validation?: unknown; statusCode?: number; message?: string };
  if (e.validation) return reply.code(400).send({ error: 'invalid_request', message: e.message });
  app.log.error(err);
  return reply.code(e.statusCode ?? 500).send({ error: 'internal', message: e.message });
});

// ---- REST: comandos ----

const runOptions = {
  model: { type: 'string' },
  effort: { type: 'string', enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
  permissionMode: { type: 'string', enum: ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk'] },
} as const;

// Anexos chegam em base64 dentro do JSON: imagens já reduzidas no celular, arquivos até 25 MB.
const ATTACHMENT_BODY_LIMIT = 40 * 1024 * 1024;
const attachmentsSchema = {
  type: 'array',
  maxItems: 10,
  items: {
    type: 'object',
    required: ['name', 'mediaType', 'data'],
    properties: {
      name: { type: 'string', maxLength: 255 },
      mediaType: { type: 'string', maxLength: 255 },
      data: { type: 'string' },
      thumb: { type: 'string', maxLength: 300_000 },
    },
  },
} as const;

type RunBody = { model?: string; effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk' };
type IdParams = { id: string };

const startedAt = Date.now();
app.get('/api/health', async () => ({ ok: true, tailnetHost: policy.tailnetHost ?? null, startedAt, home: homedir() }));

app.get('/api/sessions', async () => manager.catalog());

app.get('/api/system', async () => ({ system: monitor.system, usage: monitor.usage }));

app.get('/api/projects', async () => manager.projects());

app.get<{ Params: IdParams; Querystring: { limit?: number } }>(
  '/api/sessions/:id/history',
  { schema: { querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 2000 } } } } },
  async (req) => manager.history(req.params.id, req.query.limit),
);

app.post<{ Body: RunBody & { cwd?: string; prompt: string; title?: string; attachments?: Attachment[] } }>(
  '/api/sessions',
  {
    bodyLimit: ATTACHMENT_BODY_LIMIT,
    schema: {
      body: {
        type: 'object',
        required: ['prompt'],
        properties: {
          cwd: { type: 'string' },
          prompt: { type: 'string' },
          title: { type: 'string' },
          attachments: attachmentsSchema,
          ...runOptions,
        },
      },
    },
  },
  async (req) => ({ sessionId: (await manager.create(req.body)).id }),
);

app.post<{ Params: IdParams; Body: RunBody & { fork?: boolean } }>(
  '/api/sessions/:id/open',
  { schema: { body: { type: 'object', properties: { fork: { type: 'boolean' }, ...runOptions } } } },
  async (req) => ({ sessionId: (await manager.open(req.params.id, req.body)).id }),
);

app.post<{ Params: IdParams; Body: RunBody }>(
  '/api/sessions/:id/takeover',
  { schema: { body: { type: 'object', properties: runOptions } } },
  async (req) => ({ sessionId: (await manager.takeOver(req.params.id, req.body)).id }),
);

app.post<{ Params: IdParams }>('/api/sessions/:id/release', async (req) => manager.release(req.params.id));

app.post<{ Params: IdParams; Body: { text: string; attachments?: Attachment[]; clientId?: string } }>(
  '/api/sessions/:id/messages',
  {
    bodyLimit: ATTACHMENT_BODY_LIMIT,
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string' }, attachments: attachmentsSchema, clientId: { type: 'string', maxLength: 64 } },
      },
    },
  },
  async (req) => {
    await manager.send(req.params.id, req.body.text, req.body.attachments, req.body.clientId);
    return { ok: true };
  },
);

app.post<{ Params: IdParams; Body: { pinned: boolean } }>(
  '/api/sessions/:id/pin',
  { schema: { body: { type: 'object', required: ['pinned'], properties: { pinned: { type: 'boolean' } } } } },
  async (req) => {
    await manager.setPinned(req.params.id, req.body.pinned);
    return { ok: true };
  },
);

app.post<{ Params: IdParams; Body: { title: string } }>(
  '/api/sessions/:id/rename',
  {
    schema: {
      body: { type: 'object', required: ['title'], properties: { title: { type: 'string', minLength: 1, maxLength: 200 } } },
    },
  },
  async (req) => {
    await manager.rename(req.params.id, req.body.title);
    return { ok: true };
  },
);

app.post<{ Params: IdParams; Body: RunBody }>(
  '/api/sessions/:id/settings',
  { schema: { body: { type: 'object', properties: runOptions } } },
  async (req) => {
    await manager.updateSettings(req.params.id, req.body);
    return { ok: true };
  },
);

app.get<{ Params: IdParams }>('/api/sessions/:id/context', async (req) => manager.get(req.params.id).contextUsage());

app.get('/api/models', async () => manager.models());

app.get<{ Params: IdParams & { key: string } }>('/api/sessions/:id/images/:key', async (req, reply) => {
  const image = await manager.image(req.params.id, req.params.key);
  return reply
    .header('content-type', image.mediaType)
    .header('cache-control', 'private, max-age=86400')
    .send(Buffer.from(image.data, 'base64'));
});

app.post<{ Params: IdParams }>('/api/sessions/:id/delete', async (req) => {
  await manager.delete(req.params.id);
  return { ok: true };
});

// ---- explorador (só leitura) e git do projeto ----

type ProjectQuery = { Querystring: { cwd: string; path?: string } };
const projectQuery = {
  schema: {
    querystring: { type: 'object', required: ['cwd'], properties: { cwd: { type: 'string' }, path: { type: 'string' } } },
  },
};

app.get<ProjectQuery>('/api/tree', projectQuery, async (req) =>
  listDir(await manager.knownCwd(req.query.cwd), req.query.path ?? ''),
);

app.get<ProjectQuery>('/api/file', projectQuery, async (req) =>
  readProjectFile(await manager.knownCwd(req.query.cwd), req.query.path ?? ''),
);

app.get<ProjectQuery>('/api/file/raw', projectQuery, async (req, reply) => {
  const file = await rawProjectFile(await manager.knownCwd(req.query.cwd), req.query.path ?? '');
  return reply
    .header('content-type', file.mediaType)
    .header('cache-control', 'private, no-cache')
    .header('content-security-policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'")
    .send(createReadStream(file.path));
});

app.get<ProjectQuery>('/api/git', projectQuery, async (req) => gitStatus(await manager.knownCwd(req.query.cwd)));

app.get<ProjectQuery>('/api/git/diff', projectQuery, async (req) => ({
  diff: await gitDiff(await manager.knownCwd(req.query.cwd), req.query.path ?? ''),
}));

app.get<{ Querystring: { cwd: string } }>(
  '/api/commands',
  { schema: { querystring: { type: 'object', required: ['cwd'], properties: { cwd: { type: 'string' } } } } },
  async (req) => manager.commands(req.query.cwd),
);

app.get<{ Querystring: { cwd: string; q?: string } }>(
  '/api/files',
  {
    schema: {
      querystring: { type: 'object', required: ['cwd'], properties: { cwd: { type: 'string' }, q: { type: 'string' } } },
    },
  },
  async (req) => manager.files(req.query.cwd, req.query.q ?? ''),
);

app.post<{ Params: IdParams }>('/api/sessions/:id/interrupt', async (req) => {
  await manager.get(req.params.id).interrupt();
  return { ok: true };
});

app.post<{ Params: IdParams & { requestId: string }; Body: { allow: boolean; message?: string; always?: boolean } }>(
  '/api/sessions/:id/approvals/:requestId',
  {
    schema: {
      body: {
        type: 'object',
        required: ['allow'],
        properties: { allow: { type: 'boolean' }, message: { type: 'string' }, always: { type: 'boolean' } },
      },
    },
  },
  async (req) => {
    manager.get(req.params.id).answer(req.params.requestId, req.body);
    return { ok: true };
  },
);

app.post<{ Params: IdParams & { requestId: string }; Body: { answers?: Record<string, string>; decline?: boolean } }>(
  '/api/sessions/:id/questions/:requestId',
  {
    schema: {
      body: {
        type: 'object',
        properties: {
          answers: { type: 'object', additionalProperties: { type: 'string', minLength: 1 } },
          decline: { type: 'boolean' },
        },
      },
    },
  },
  async (req) => {
    manager.get(req.params.id).answerQuestion(req.params.requestId, req.body);
    return { ok: true };
  },
);

// ---- notificações (Web Push) ----

const endpointSchema = { type: 'string', pattern: '^https://', maxLength: 2048 } as const;

app.get('/api/push/key', async () => ({ publicKey: push.publicKey }));

app.post<{ Body: { subscription: PushSubscriptionInput; prefs: PushPrefs } }>(
  '/api/push/subscribe',
  {
    schema: {
      body: {
        type: 'object',
        required: ['subscription', 'prefs'],
        properties: {
          subscription: {
            type: 'object',
            required: ['endpoint', 'keys'],
            properties: {
              endpoint: endpointSchema,
              keys: {
                type: 'object',
                required: ['p256dh', 'auth'],
                properties: { p256dh: { type: 'string', maxLength: 256 }, auth: { type: 'string', maxLength: 256 } },
              },
            },
          },
          prefs: {
            type: 'object',
            required: ['done', 'pc'],
            properties: { done: { type: 'boolean' }, pc: { type: 'boolean' } },
          },
        },
      },
    },
  },
  async (req) => {
    const { endpoint, keys } = req.body.subscription;
    await push.subscribe({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, {
      done: req.body.prefs.done,
      pc: req.body.prefs.pc,
    });
    return { ok: true };
  },
);

const endpointBody = {
  schema: { body: { type: 'object', required: ['endpoint'], properties: { endpoint: endpointSchema } } },
};

app.post<{ Body: { endpoint: string } }>('/api/push/unsubscribe', endpointBody, async (req) => {
  await push.unsubscribe(req.body.endpoint);
  return { ok: true };
});

app.post<{ Body: { endpoint: string } }>('/api/push/test', endpointBody, async (req) => {
  await push.test(req.body.endpoint);
  return { ok: true };
});

// ---- WebSocket: catálogo e eventos em tempo real ----

type ClientMsg =
  | { type: 'subscribe'; sessionId: string; sinceSeq?: number; runId?: string }
  | { type: 'unsubscribe'; sessionId: string };

const clients = new Map<WebSocket, Set<string>>();

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function subscribe(socket: WebSocket, sessionId: string, sinceSeq: number, runId?: string): void {
  clients.get(socket)?.add(sessionId);
  const session = manager.find(sessionId);
  if (!session) return send(socket, { type: 'not_open', sessionId });
  // Outro processo da mesma conversa: o seq que o cliente conhece não vale mais.
  const sameRun = runId === session.runId;
  const { reset, events } = session.eventsSince(sameRun ? sinceSeq : 0);
  send(socket, {
    type: 'snapshot',
    sessionId,
    runId: session.runId,
    state: session.state,
    waitingFor: session.waitingFor,
    reset: reset || !sameRun,
    events,
  });
}

app.get('/ws', { websocket: true }, (socket) => {
  clients.set(socket, new Set());
  let alive = true;
  socket.on('pong', () => (alive = true));
  const heartbeat = setInterval(() => {
    if (!alive) return socket.terminate();
    alive = false;
    socket.ping();
    // O navegador não enxerga pings de protocolo; o tick deixa o cliente detectar conexão morta.
    send(socket, { type: 'tick' });
  }, 25_000);

  socket.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw)) as ClientMsg;
    } catch {
      return send(socket, { type: 'error', error: 'invalid_json' });
    }
    if (msg.type === 'subscribe') subscribe(socket, msg.sessionId, msg.sinceSeq ?? 0, msg.runId);
    else if (msg.type === 'unsubscribe') clients.get(socket)?.delete(msg.sessionId);
  });
  socket.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(socket);
    monitor.removeClient();
  });

  send(socket, { type: 'hello', serverTime: Date.now() });
  // Monitor do PC só roda com alguém olhando; o último valor conhecido vai na hora.
  monitor.addClient();
  if (monitor.system) send(socket, { type: 'system', system: monitor.system });
  send(socket, { type: 'usage', usage: monitor.usage });
  void manager.catalog().then((sessions) => send(socket, { type: 'catalog', sessions }));
});

function broadcast(sessionId: string, payload: unknown): void {
  for (const [socket, subs] of clients) if (subs.has(sessionId)) send(socket, payload);
}

manager.on('event', (sessionId: string, event: LoggedEvent, runId: string) =>
  broadcast(sessionId, { type: 'event', sessionId, runId, event }),
);
manager.on('delta', (sessionId: string, text: string) => broadcast(sessionId, { type: 'delta', sessionId, text }));
manager.on('rekey', (from: string, to: string) => {
  for (const [socket, subs] of clients) {
    if (subs.delete(from)) {
      subs.add(to);
      send(socket, { type: 'rekey', from, to });
    }
  }
});

function broadcastAll(payload: unknown): void {
  for (const socket of clients.keys()) send(socket, payload);
}
monitor.on('system', (system) => broadcastAll({ type: 'system', system }));
monitor.on('usage', (usage) => broadcastAll({ type: 'usage', usage }));

let catalogTimer: NodeJS.Timeout | undefined;
manager.on('catalog', () => {
  clearTimeout(catalogTimer);
  catalogTimer = setTimeout(async () => {
    const sessions = await manager.catalog().catch(() => null);
    if (sessions) for (const socket of clients.keys()) send(socket, { type: 'catalog', sessions });
  }, 300);
});

// ---- frontend (PWA) na mesma origem da API ----

if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    setHeaders: (res, path) => {
      // Arquivos com hash no nome nunca mudam; o resto precisa revalidar para a PWA atualizar.
      const immutable = path.includes('/assets/');
      res.header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });
  // Rotas do SPA (/s/:id, /projetos…) caem no index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/') && req.url !== '/ws') {
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });
}

// ---- ciclo de vida ----

await live.start();
await app.listen({ host: HOST, port: PORT });
app.log.info({ tailnetHost: policy.tailnetHost, logins: [...policy.logins] }, 'claude-remote pronto');

// No boot o serviço pode subir antes do tailscaled; insiste até conseguir ler o nó.
if (!policy.tailnetHost) {
  app.log.warn('Tailscale indisponível; só acesso local por enquanto');
  const retry = setInterval(async () => {
    if (!(await refreshTailnet(policy))) return;
    clearInterval(retry);
    app.log.info({ tailnetHost: policy.tailnetHost, logins: [...policy.logins] }, 'Tailscale detectado');
  }, 15_000);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info('encerrando sessões do painel…');
    live.stop();
    await manager.shutdown();
    await app.close();
    process.exit(0);
  });
}
