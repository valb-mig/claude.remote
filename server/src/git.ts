import { execFile } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { HttpError } from './errors.ts';

const exec = promisify(execFile);

const MAX_DIFF = 512 * 1024;

export type GitFile = {
  path: string;
  /** Caminho anterior, em renomeações. */
  from?: string;
  /** Códigos do `git status`: staged (índice) e não staged (árvore de trabalho). */
  index: string;
  worktree: string;
  untracked: boolean;
  additions: number | null;
  deletions: number | null;
};

export type GitStatus = {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
  /** Página do repositório no navegador (ex.: https://github.com/dono/repo), pelo remoto do upstream ou o origin. */
  remote: string | null;
};

function git(cwd: string, args: string[]) {
  return exec('git', args, { cwd, timeout: 10_000, maxBuffer: 32 * 1024 * 1024 });
}

/**
 * Endereço do remoto como página web: "git@github.com:dono/repo.git", "ssh://git@host:22/dono/repo"
 * e "https://usuario:token@host/dono/repo.git" viram "https://host/dono/repo", sem credenciais.
 * Remoto em pasta local não tem página: `null`.
 */
export function remoteWebUrl(remote: string): string | null {
  const m = /^(?:[\w+.-]+:\/\/)?(?:[^@/]+@)?([^/:@]+)(?::\d+)?[:/]([^/].*?)(?:\.git)?\/?$/.exec(remote.trim());
  return m ? `https://${m[1]}/${m[2]}` : null;
}

/** `git diff --numstat -z`: "a\td\tcaminho\0" ou, em renomeação, "a\td\t\0antigo\0novo\0". */
function parseNumstat(out: string, into: Map<string, { add: number | null; del: number | null }>): void {
  const tokens = out.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const [a, d, path] = tokens[i]!.split('\t');
    if (a === undefined || d === undefined) continue;
    const target = path ? path : tokens[(i += 2)];
    if (!target) continue;
    const n = (v: string) => (v === '-' ? null : Number(v)); // "-" = binário
    const prev = into.get(target);
    const add = n(a);
    const del = n(d);
    into.set(target, {
      add: prev ? (prev.add === null || add === null ? null : prev.add + add) : add,
      del: prev ? (prev.del === null || del === null ? null : prev.del + del) : del,
    });
  }
}

/** Estado do repositório; `null` se o projeto não usa git. */
export async function gitStatus(cwd: string): Promise<GitStatus | null> {
  let out: string;
  try {
    ({ stdout: out } = await git(cwd, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
  } catch {
    return null;
  }

  const status: GitStatus = { branch: null, upstream: null, ahead: 0, behind: 0, files: [], remote: null };
  const tokens = out.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const line = tokens[i]!;
    if (line.startsWith('# branch.head ')) {
      const head = line.slice(14);
      status.branch = head === '(detached)' ? null : head;
    } else if (line.startsWith('# branch.upstream ')) {
      status.upstream = line.slice(18);
    } else if (line.startsWith('# branch.ab ')) {
      const [, ahead, behind] = /\+(\d+) -(\d+)/.exec(line) ?? [];
      status.ahead = Number(ahead ?? 0);
      status.behind = Number(behind ?? 0);
    } else if (line.startsWith('1 ') || line.startsWith('u ')) {
      const parts = line.split(' ');
      const xy = parts[1]!;
      status.files.push({ path: parts.slice(line.startsWith('1 ') ? 8 : 10).join(' '), index: xy[0]!, worktree: xy[1]!, untracked: false, additions: null, deletions: null });
    } else if (line.startsWith('2 ')) {
      // Renomeação: o caminho antigo vem no token seguinte.
      const parts = line.split(' ');
      const xy = parts[1]!;
      status.files.push({ path: parts.slice(9).join(' '), from: tokens[++i], index: xy[0]!, worktree: xy[1]!, untracked: false, additions: null, deletions: null });
    } else if (line.startsWith('? ')) {
      status.files.push({ path: line.slice(2), index: '?', worktree: '?', untracked: true, additions: null, deletions: null });
    }
  }

  // Linhas alteradas: staged + não staged somados por arquivo.
  const counts = new Map<string, { add: number | null; del: number | null }>();
  const [unstaged, staged, remote] = await Promise.all([
    git(cwd, ['diff', '--numstat', '-z']).catch(() => ({ stdout: '' })),
    git(cwd, ['diff', '--numstat', '-z', '--cached']).catch(() => ({ stdout: '' })),
    git(cwd, ['remote', 'get-url', status.upstream?.split('/')[0] || 'origin']).catch(() => ({ stdout: '' })),
  ]);
  status.remote = remoteWebUrl(remote.stdout);
  parseNumstat(unstaged.stdout, counts);
  parseNumstat(staged.stdout, counts);
  for (const f of status.files) {
    const c = counts.get(f.path);
    if (c) {
      f.additions = c.add;
      f.deletions = c.del;
    }
  }
  return status;
}

/** Diff de um arquivo contra o último commit (staged + não staged); novo arquivo = diff contra vazio. */
export async function gitDiff(cwd: string, path: string): Promise<string> {
  if (!path || isAbsolute(path) || path.split('/').includes('..')) throw new HttpError(400, 'invalid_path');
  const status = await gitStatus(cwd);
  if (!status) throw new HttpError(404, 'not_a_repository');
  const file = status.files.find((f) => f.path === path);

  let out: string;
  if (file?.untracked) {
    // Sem histórico: compara com /dev/null (o git sai com código 1 quando há diferença).
    out = await git(cwd, ['diff', '--no-index', '--', '/dev/null', path]).then(
      (r) => r.stdout,
      (err: { stdout?: string }) => err.stdout ?? '',
    );
  } else {
    out = await git(cwd, ['diff', 'HEAD', '--', path]).then(
      (r) => r.stdout,
      // Repositório sem commits: junta staged e não staged.
      async () => {
        const [a, b] = await Promise.all([git(cwd, ['diff', '--cached', '--', path]), git(cwd, ['diff', '--', path])]);
        return a.stdout + b.stdout;
      },
    );
  }
  return out.length > MAX_DIFF ? `${out.slice(0, MAX_DIFF)}\n… diff cortado (${Math.round(out.length / 1024)} KB)` : out;
}
