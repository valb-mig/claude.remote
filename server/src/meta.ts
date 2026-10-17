import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Metadados só do painel; títulos ficam no próprio Claude Code (renameSession). */
type Meta = { pinned: string[] };

const FILE = process.env.META_FILE ?? join(homedir(), '.local', 'state', 'claude-remote', 'meta.json');

export class MetaStore {
  private meta: Meta = { pinned: [] };
  private writing = Promise.resolve();

  async load(): Promise<void> {
    try {
      const data = JSON.parse(await readFile(FILE, 'utf8')) as Partial<Meta>;
      this.meta = { pinned: Array.isArray(data.pinned) ? data.pinned.filter((p) => typeof p === 'string') : [] };
    } catch {
      // Primeiro uso ou arquivo ilegível: começa vazio.
    }
  }

  isPinned(sessionId: string): boolean {
    return this.meta.pinned.includes(sessionId);
  }

  async setPinned(sessionId: string, pinned: boolean): Promise<void> {
    const others = this.meta.pinned.filter((id) => id !== sessionId);
    this.meta = { ...this.meta, pinned: pinned ? [...others, sessionId] : others };
    await this.save();
  }

  // Gravação atômica e em fila: um arquivo temporário renomeado por cima do atual.
  private save(): Promise<void> {
    const snapshot = JSON.stringify(this.meta, null, 2);
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(FILE), { recursive: true });
      await writeFile(`${FILE}.tmp`, snapshot);
      await rename(`${FILE}.tmp`, FILE);
    });
    return this.writing;
  }
}
