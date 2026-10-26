import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ALLOWED_LOGINS, EXTRA_ORIGINS, PORT } from './config.ts';

const exec = promisify(execFile);

export type AccessPolicy = {
  localHosts: Set<string>;
  tailnetHost?: string;
  origins: Set<string>;
  logins: Set<string>;
};

/** Monta a política; o lado Tailscale pode ficar vazio até `refreshTailnet` conseguir ler o nó. */
export async function loadAccessPolicy(): Promise<AccessPolicy> {
  const localHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
  const policy: AccessPolicy = {
    localHosts,
    origins: new Set([...localHosts].map((h) => `http://${h}`).concat(EXTRA_ORIGINS)),
    logins: new Set(ALLOWED_LOGINS),
  };
  await refreshTailnet(policy);
  return policy;
}

/**
 * Lê o nome MagicDNS e o login do dono deste nó. Retorna false enquanto o Tailscale
 * não responde (ex.: logo após o boot); até lá só o acesso local funciona.
 */
export async function refreshTailnet(policy: AccessPolicy): Promise<boolean> {
  try {
    const { stdout } = await exec('tailscale', ['status', '--json'], { timeout: 5_000 });
    const status = JSON.parse(stdout) as {
      Self?: { DNSName?: string; UserID?: number };
      User?: Record<string, { LoginName?: string }>;
    };
    const host = status.Self?.DNSName?.replace(/\.$/, '');
    const owner = status.User?.[String(status.Self?.UserID)]?.LoginName;
    if (!host || !owner) return false;
    policy.tailnetHost = host;
    policy.origins.add(`https://${host}`);
    if (ALLOWED_LOGINS.length === 0) policy.logins.add(owner);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sem login próprio: a identidade vem do Tailscale. Barra DNS rebinding (Host),
 * CSRF de outros sites no navegador do PC (Origin + JSON) e acessos do tailnet
 * que não sejam do dono.
 */
export function accessGuard(policy: AccessPolicy) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const host = req.headers.host ?? '';
    // Numa porta HTTPS extra do `tailscale serve` (ex.: uma instância de teste em :10000), o Host traz a porta.
    const name = host.replace(/:\d+$/, '');
    const viaTailnet =
      name === policy.tailnetHost || 'x-forwarded-for' in req.headers || 'tailscale-user-login' in req.headers;

    if (!policy.localHosts.has(host) && name !== policy.tailnetHost) {
      return reply.code(403).send({ error: 'host_not_allowed' });
    }
    if (viaTailnet) {
      const login = String(req.headers['tailscale-user-login'] ?? '');
      if (!policy.logins.has(login)) return reply.code(403).send({ error: 'tailnet_identity_required' });
    }

    const origin = req.headers.origin;
    if (origin && !policy.origins.has(origin)) {
      return reply.code(403).send({ error: 'origin_not_allowed' });
    }
    // App servido por outra máquina sua (ver machines.ts): o navegador só entrega a resposta com
    // este cabeçalho, e antes de um POST com JSON pergunta com um OPTIONS.
    if (origin) reply.header('access-control-allow-origin', origin).header('vary', 'Origin');
    if (origin && req.method === 'OPTIONS') {
      return reply
        .header('access-control-allow-methods', 'GET, POST')
        .header('access-control-allow-headers', 'content-type')
        .header('access-control-allow-private-network', 'true')
        .header('access-control-max-age', '600')
        .code(204)
        .send();
    }

    const unsafe = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    if (unsafe && !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
      return reply.code(415).send({ error: 'json_required' });
    }
  };
}
