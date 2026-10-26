import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { CLAUDE_HOME } from './config.ts';

// IDs viram nomes de arquivo: nada de `..` nem `/`.
export const SAFE_ID = /^[\w-]{1,64}$/;

/** ~/.claude/projects/<projeto>/<sessão>.jsonl, procurado em todos os projetos. */
export async function transcriptPath(sessionId: string): Promise<string | null> {
  if (!SAFE_ID.test(sessionId)) return null;
  const root = join(CLAUDE_HOME, 'projects');
  for (const project of await readdir(root).catch(() => [])) {
    const path = join(root, project, `${sessionId}.jsonl`);
    if (await stat(path).then((s) => s.isFile(), () => false)) return path;
  }
  return null;
}

/** Só os encontrados: a pasta de uma conversa não muda depois da primeira mensagem. */
const cwds = new Map<string, string>();

/**
 * Pasta da conversa lida do próprio transcript. O SDK só procura o `cwd` nos primeiros 64 KiB
 * do arquivo; quando a primeira mensagem traz uma imagem, ele fica além disso e a conversa
 * aparece sem projeto (e não reabre no painel).
 */
export async function transcriptCwd(sessionId: string): Promise<string | undefined> {
  const known = cwds.get(sessionId);
  if (known) return known;
  const path = await transcriptPath(sessionId);
  const cwd = path ? await firstCwd(path) : undefined;
  if (cwd) cwds.set(sessionId, cwd);
  return cwd;
}

async function firstCwd(path: string): Promise<string | undefined> {
  const input = createReadStream(path);
  try {
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (!line.includes('"cwd"')) continue;
      try {
        const { cwd } = JSON.parse(line) as { cwd?: unknown };
        if (typeof cwd === 'string' && cwd) return cwd;
      } catch {
        // Linha cortada (o Claude Code ainda está gravando): segue para a próxima.
      }
    }
    return undefined;
  } finally {
    input.destroy();
  }
}
