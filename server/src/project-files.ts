import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const CACHE_MS = 30_000;
const MAX_FILES = 50_000;
// A pasta pessoal não é repositório: a varredura não desce além disto.
const MAX_DEPTH = 5;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.next', '.venv', '__pycache__']);

const cache = new Map<string, { at: number; paths: string[] }>();

// Fora de repositório git: varredura em largura, limitada, pulando diretórios pesados.
async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  const queue: [string, number][] = [[root, 0]];
  while (queue.length && out.length < MAX_FILES) {
    const [dir, depth] = queue.shift()!;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.claude') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && depth < MAX_DEPTH) queue.push([full, depth + 1]);
      } else {
        out.push(relative(root, full));
      }
    }
  }
  return out;
}

/** Arquivos e diretórios do projeto (caminhos relativos; diretórios terminam em '/'). */
async function projectPaths(cwd: string): Promise<string[]> {
  const hit = cache.get(cwd);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.paths;

  let files: string[];
  try {
    // Respeita o .gitignore e inclui arquivos ainda não versionados.
    const { stdout } = await exec('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd,
      timeout: 5_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    files = stdout.split('\n').filter(Boolean).slice(0, MAX_FILES);
  } catch {
    files = await walk(cwd);
  }

  const dirs = new Set<string>();
  for (const f of files) {
    for (let i = f.indexOf('/'); i !== -1; i = f.indexOf('/', i + 1)) dirs.add(f.slice(0, i + 1));
  }
  const paths = [...dirs, ...files];
  cache.set(cwd, { at: Date.now(), paths });
  return paths;
}

function score(path: string, q: string): number | null {
  const lower = path.toLowerCase();
  const name = lower.replace(/\/$/, '').split('/').pop() ?? lower;
  if (name.startsWith(q)) return 0;
  if (name.includes(q)) return 1;
  if (lower.includes(q)) return 2;
  // Subsequência (ex.: "pnlses" → "panel-session.ts").
  let i = 0;
  for (const ch of lower) if (ch === q[i]) i++;
  return i === q.length ? 3 : null;
}

/** Busca para a menção @: sem termo, mostra o primeiro nível do projeto. */
export async function searchProjectFiles(cwd: string, query: string, limit = 40): Promise<string[]> {
  const paths = await projectPaths(cwd);
  const q = query.trim().toLowerCase();
  if (!q) {
    return paths
      .filter((p) => !p.replace(/\/$/, '').includes('/'))
      .sort((a, b) => Number(b.endsWith('/')) - Number(a.endsWith('/')) || a.localeCompare(b))
      .slice(0, limit);
  }
  const ranked: { p: string; s: number }[] = [];
  for (const p of paths) {
    const s = score(p, q);
    if (s !== null) ranked.push({ p, s });
  }
  return ranked
    .sort((a, b) => a.s - b.s || a.p.length - b.p.length || a.p.localeCompare(b.p))
    .slice(0, limit)
    .map((r) => r.p);
}
