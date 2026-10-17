import { execFile } from 'node:child_process';
import { open, readdir, realpath, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { HttpError } from './errors.ts';

const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_RAW_BYTES = 25 * 1024 * 1024;

export const MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
};

/** Caminho dentro do projeto, seguindo links: nada de "../" nem link que aponte para fora. */
export async function resolveInside(root: string, rel: string): Promise<string> {
  const realRoot = await realpath(root);
  const full = await realpath(resolve(realRoot, rel || '.')).catch(() => {
    throw new HttpError(404, 'not_found');
  });
  if (full !== realRoot && !full.startsWith(realRoot + sep)) throw new HttpError(403, 'outside_project');
  return full;
}

export type TreeEntry = { name: string; path: string; type: 'dir' | 'file'; size?: number; ignored?: boolean };

/** Um nível da árvore (carregado sob demanda): pastas primeiro; ignorados pelo git vêm marcados. */
export async function listDir(root: string, rel: string): Promise<TreeEntry[]> {
  const dir = await resolveInside(root, rel);
  const realRoot = await realpath(root);
  const dirents = await readdir(dir, { withFileTypes: true });
  const entries = await Promise.all(
    dirents
      .filter((d) => d.name !== '.git')
      .map(async (d): Promise<TreeEntry | null> => {
        const full = join(dir, d.name);
        const path = relative(realRoot, full);
        try {
          // Links: classifica pelo destino (o acesso depois passa por resolveInside).
          const info = d.isSymbolicLink() ? await stat(full) : null;
          const isDir = info ? info.isDirectory() : d.isDirectory();
          const size = isDir ? undefined : (info ?? (await stat(full))).size;
          return { name: d.name, path, type: isDir ? 'dir' : 'file', size };
        } catch {
          return null; // link quebrado
        }
      }),
  );
  const list = entries.filter((e): e is TreeEntry => e !== null);

  // Como no VSCode: o que o .gitignore cobre aparece esmaecido.
  const ignored = await gitIgnored(realRoot, list.map((e) => e.path));
  for (const e of list) if (ignored.has(e.path)) e.ignored = true;

  return list.sort(
    (a, b) => Number(b.type === 'dir') - Number(a.type === 'dir') || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }),
  );
}

async function gitIgnored(root: string, paths: string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  return new Promise((done) => {
    const child = execFile('git', ['check-ignore', '--stdin', '-z'], { cwd: root, timeout: 5_000 }, (_err, stdout) => {
      // Saída 1 = nada ignorado; fora de repositório também cai aqui com stdout vazio.
      done(new Set(String(stdout ?? '').split('\0').filter(Boolean)));
    });
    child.stdin?.end(paths.join('\0'));
  });
}

export type FileView =
  | { kind: 'text'; size: number; content: string; truncated: boolean }
  | { kind: 'image' | 'pdf' | 'binary' | 'large'; size: number };

/** Conteúdo para leitura no celular: texto até 1 MB; imagem/PDF são abertos pelo /raw. */
export async function readProjectFile(root: string, rel: string): Promise<FileView> {
  const full = await resolveInside(root, rel);
  const info = await stat(full);
  if (info.isDirectory()) throw new HttpError(400, 'is_a_directory');
  const media = MEDIA_TYPES[extname(full).toLowerCase()];
  if (media?.startsWith('image/')) return { kind: 'image', size: info.size };
  if (media === 'application/pdf') return { kind: 'pdf', size: info.size };

  const handle = await open(full, 'r');
  try {
    const length = Math.min(info.size, MAX_TEXT_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    // Byte nulo no começo = binário.
    if (buffer.subarray(0, 8_000).includes(0)) return { kind: 'binary', size: info.size };
    return { kind: 'text', size: info.size, content: buffer.toString('utf8'), truncated: info.size > MAX_TEXT_BYTES };
  } finally {
    await handle.close();
  }
}

/** Caminho validado e tipo do arquivo original (imagens, PDF), para servir como está. */
export async function rawProjectFile(root: string, rel: string): Promise<{ path: string; mediaType: string }> {
  const full = await resolveInside(root, rel);
  const info = await stat(full);
  if (!info.isFile()) throw new HttpError(400, 'not_a_file');
  if (info.size > MAX_RAW_BYTES) throw new HttpError(413, 'file_too_large');
  return { path: full, mediaType: MEDIA_TYPES[extname(full).toLowerCase()] ?? 'text/plain; charset=utf-8' };
}
