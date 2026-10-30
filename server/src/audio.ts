import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';

/**
 * O que sai pelas caixas do PC, virado em espectro para o fundo animado da conversa.
 *
 * A captura é o monitor do sink padrão do PipeWire/PulseAudio (`@DEFAULT_MONITOR@`), então ela
 * acompanha a saída que você escolher sem precisar configurar nada aqui. Só roda com alguém
 * olhando: o `parec` nasce quando o primeiro cliente pede e morre quando o último sai, como o
 * monitor do PC (ver system.ts).
 */

// 16 kHz mono: o que interessa de espectro cabe abaixo de 8 kHz, e é um sexto do dado de 48 kHz estéreo.
const RATE = 16_000;
// Janela de 512 amostras (32 ms): separa os graves sem atrasar a imagem.
const FFT = 512;
const BANDS = 20;
const WAVE = 40;
const FPS = 25;
// Faixa útil do espectro; abaixo disso é ronco de sala, acima quase não há energia na música.
const LOW_HZ = 40;
const HIGH_HZ = 7_000;
// Silêncio digital e teto, em dB: o que mapeia a magnitude para a altura da barra.
const FLOOR_DB = -72;
// Subida rápida e descida lenta, como ponteiro de VU: sem isso a barra treme e não se lê nada.
const ATTACK = 0.55;
const RELEASE = 0.12;
// Sem amostra por este tempo o `parec` morreu (ou o monitor sumiu): vale recomeçar.
const STALL_MS = 2_500;
// Abaixo disto a janela é silêncio: a onda vai reta em vez de o ganho virar o ruído de fundo em estática.
const SILENCE = 0.0015;
// Teto do ganho automático da onda, e quão devagar o pico de referência cai.
const MAX_GAIN = 45;
const PEAK_FALL = 0.985;

export type Spectrum = {
  /** Altura de cada banda, do grave ao agudo, em 0–255. */
  bands: number[];
  /** Forma de onda da janela, 0–255 com 128 no silêncio. */
  wave: number[];
  /** Volume geral da janela, 0–255. */
  level: number;
};

/** FFT radix-2 no lugar; `re` e `im` têm o mesmo tamanho, potência de dois. */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const ar = re[i + k]!;
        const ai = im[i + k]!;
        const br = re[i + k + half]!;
        const bi = im[i + k + half]!;
        const vr = br * cr - bi * ci;
        const vi = br * ci + bi * cr;
        re[i + k] = ar + vr;
        im[i + k] = ai + vi;
        re[i + k + half] = ar - vr;
        im[i + k + half] = ai - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Bordas das bandas em bins da FFT, espaçadas geometricamente (o ouvido ouve em oitavas). */
function bandEdges(): number[] {
  const perBin = RATE / FFT;
  const edges: number[] = [];
  for (let i = 0; i <= BANDS; i++) {
    const hz = LOW_HZ * (HIGH_HZ / LOW_HZ) ** (i / BANDS);
    edges.push(Math.min(FFT / 2 - 1, Math.max(1, Math.round(hz / perBin))));
  }
  return edges;
}

// Janela de Hann: tira o estalo das bordas do recorte, que viraria energia falsa espalhada.
const HANN = Float32Array.from({ length: FFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1)));

export class AudioMonitor extends EventEmitter {
  private clients = 0;
  private proc?: ChildProcessByStdio<null, Readable, Readable>;
  private timer?: NodeJS.Timeout;
  private pcm = Buffer.alloc(0);
  private lastData = 0;
  private readonly edges = bandEdges();
  private readonly smooth = new Float32Array(BANDS);
  private readonly re = new Float32Array(FFT);
  private readonly im = new Float32Array(FFT);
  /** Pico recente da onda, que desce devagar; é a referência do ganho automático. */
  private peak = 0;
  /** Falhou ao abrir a captura (sem `parec`, sem servidor de som): o cliente mostra o aviso. */
  available = true;

  addClient(): void {
    if (this.clients++ > 0) return;
    this.start();
  }

  removeClient(): void {
    if (--this.clients > 0) return;
    this.clients = 0;
    this.stop();
  }

  private start(): void {
    this.stop();
    try {
      this.proc = spawn(
        'parec',
        ['--device=@DEFAULT_MONITOR@', '--format=s16le', `--rate=${RATE}`, '--channels=1', '--raw', '--latency-msec=40'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch {
      this.available = false;
      return;
    }
    const proc = this.proc;
    this.lastData = Date.now();
    proc.on('error', () => {
      this.available = false;
      this.stop();
    });
    proc.stdout.on('data', (chunk: Buffer) => {
      this.lastData = Date.now();
      // Guarda umas poucas janelas; o resto já foi lido e não serve mais.
      this.pcm = Buffer.concat([this.pcm, chunk]).subarray(-FFT * 2 * 4);
    });
    // O stderr do parec é ruidoso em troca de dispositivo; não é erro para derrubar nada.
    proc.stderr.resume();
    this.timer = setInterval(() => this.tick(), Math.round(1000 / FPS));
  }

  private stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.proc?.kill();
    this.proc = undefined;
    this.pcm = Buffer.alloc(0);
    this.smooth.fill(0);
    this.peak = 0;
  }

  private tick(): void {
    if (Date.now() - this.lastData > STALL_MS && this.clients > 0) return this.start();
    if (this.pcm.length < FFT * 2) return;
    const start = this.pcm.length - FFT * 2;
    let sum = 0;
    let loudest = 0;
    for (let i = 0; i < FFT; i++) {
      const s = this.pcm.readInt16LE(start + i * 2) / 32768;
      sum += s * s;
      if (Math.abs(s) > loudest) loudest = Math.abs(s);
      this.re[i] = s * HANN[i]!;
      this.im[i] = 0;
    }
    const rms = Math.sqrt(sum / FFT);
    fft(this.re, this.im);

    const bands: number[] = [];
    for (let b = 0; b < BANDS; b++) {
      const from = this.edges[b]!;
      const to = Math.max(from + 1, this.edges[b + 1]!);
      let peak = 0;
      // Pico da faixa, não média: a média de uma faixa larga apaga a nota que está tocando nela.
      for (let i = from; i < to; i++) peak = Math.max(peak, Math.hypot(this.re[i]!, this.im[i]!) / (FFT / 4));
      const db = 20 * Math.log10(peak + 1e-9);
      const v = Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB));
      const prev = this.smooth[b]!;
      this.smooth[b] = v > prev ? prev + (v - prev) * ATTACK : prev + (v - prev) * RELEASE;
      bands.push(Math.round(this.smooth[b]! * 255));
    }

    // Ganho automático: música normal fica muito longe do fundo de escala, e sem isto a onda chega
    // ao navegador como um risco reto — o pico de referência desce devagar, para a altura não
    // pular de um quadro para o outro.
    this.peak = Math.max(loudest, this.peak * PEAK_FALL);
    const gain = rms < SILENCE ? 0 : Math.min(MAX_GAIN, 0.92 / Math.max(this.peak, 0.01));
    const wave: number[] = [];
    const step = Math.floor(FFT / WAVE);
    for (let i = 0; i < WAVE; i++) {
      const s = (this.pcm.readInt16LE(start + i * step * 2) / 32768) * gain;
      wave.push(Math.round(Math.min(255, Math.max(0, (s + 1) * 127.5))));
    }

    const level = Math.round(Math.min(1, rms * 3) * 255);
    this.emit('spectrum', { bands, wave, level } satisfies Spectrum);
  }
}
