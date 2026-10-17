/** Imagem em base64 vinda de um bloco de conteúdo (resultado de ferramenta ou anexo). */
export type StoredImage = { mediaType: string; data: string };

/** Recebe uma imagem encontrada ao normalizar uma mensagem e devolve a chave para buscá-la depois. */
export type ImageSink = (image: StoredImage) => string;

const MAX_BYTES = 200 * 1024 * 1024;

/**
 * Cache em memória das imagens do chat (prints de ferramentas, imagens lidas, anexos).
 * Os eventos levam só a chave; o celular baixa a imagem sob demanda. Descarta as mais antigas
 * quando passa de ~200 MB; uma imagem descartada volta ao recarregar o histórico.
 */
export class ImageStore {
  private readonly images = new Map<string, StoredImage>();
  private bytes = 0;

  /** Coletor para uma mensagem: chaves "<id da mensagem>-<n>", estáveis entre recargas do histórico. */
  sink(sessionId: string, messageId: string): ImageSink {
    let n = 0;
    return (image) => {
      const key = `${messageId}-${n++}`;
      this.put(`${sessionId}/${key}`, image);
      return key;
    };
  }

  get(sessionId: string, key: string): StoredImage | undefined {
    const full = `${sessionId}/${key}`;
    const image = this.images.get(full);
    if (image) {
      // Reinsere para marcar como recém-usada.
      this.images.delete(full);
      this.images.set(full, image);
    }
    return image;
  }

  private put(full: string, image: StoredImage): void {
    const old = this.images.get(full);
    if (old) {
      this.bytes -= old.data.length;
      this.images.delete(full);
    }
    this.images.set(full, image);
    this.bytes += image.data.length;
    for (const [k, v] of this.images) {
      if (this.bytes <= MAX_BYTES) break;
      this.images.delete(k);
      this.bytes -= v.data.length;
    }
  }
}

/** Cache único do processo: as sessões do painel e o histórico usam o mesmo. */
export const imageStore = new ImageStore();
