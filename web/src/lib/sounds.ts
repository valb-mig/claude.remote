import { create } from 'zustand'
import { pushStatus } from './push'
import { useStore } from './store'

/**
 * Sons do app, feitos aqui com a Web Audio (sem arquivo de áudio): um quando o Claude pergunta algo
 * ou pede aprovação, outro quando termina. Tocam com o app aberto; em segundo plano, com as
 * notificações ligadas, quem avisa é a notificação, que fica muda com o app na tela (ver sw.ts).
 */
export type Sound = 'attention' | 'done'
export type SoundPrefs = Record<Sound, boolean>

const KEY = 'cr:sounds'
const DEFAULTS: SoundPrefs = { attention: true, done: true }

function load(): SoundPrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SoundPrefs>) }
  } catch {
    return DEFAULTS
  }
}

/** Que sons tocam neste aparelho; vale para todas as conversas e fica salvo. */
export const useSounds = create<SoundPrefs>(load)

export function setSound(sound: Sound, on: boolean): void {
  useSounds.setState({ [sound]: on })
  try {
    localStorage.setItem(KEY, JSON.stringify(useSounds.getState()))
  } catch {
    // localStorage indisponível (modo privado): vale só até fechar o app.
  }
}

// ---------------------------------------------------------------------------
// Síntese: notas de sino (a fundamental e dois parciais que somem antes, ataque curto e cauda longa)
// ---------------------------------------------------------------------------

type Note = { freq: number; at: number; level: number; decay: number }

const NOTES: Record<Sound, Note[]> = {
  // Duas notas subindo (sol → dó): soa como uma pergunta.
  attention: [
    { freq: 783.99, at: 0, level: 0.5, decay: 0.6 },
    { freq: 1046.5, at: 0.13, level: 0.6, decay: 0.9 },
  ],
  // Três notas descendo até a tônica (sol → mi → dó): soa como algo que se resolve.
  done: [
    { freq: 783.99, at: 0, level: 0.45, decay: 0.5 },
    { freq: 659.25, at: 0.11, level: 0.45, decay: 0.55 },
    { freq: 523.25, at: 0.22, level: 0.55, decay: 1.3 },
  ],
}

// Parciais do sino: [múltiplo da fundamental, volume]; os de cima somem proporcionalmente mais rápido.
const PARTIALS: [number, number][] = [
  [1, 1],
  [2, 0.3],
  [3.01, 0.12],
]

function bell(ac: BaseAudioContext, out: AudioNode, start: number, note: Note): void {
  for (const [ratio, volume] of PARTIALS) {
    const osc = ac.createOscillator()
    osc.frequency.value = note.freq * ratio
    const env = ac.createGain()
    const end = start + note.decay / ratio
    env.gain.setValueAtTime(0, start)
    env.gain.linearRampToValueAtTime(note.level * volume, start + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, end)
    osc.connect(env).connect(out)
    osc.start(start)
    osc.stop(end + 0.05)
  }
}

/** Agenda o som num contexto de áudio: o da tela ou um offline (para conferir o som sem tocar). */
export function renderSound(ac: BaseAudioContext, sound: Sound, start = ac.currentTime): void {
  const master = ac.createGain()
  master.gain.value = 0.35
  // Segura os picos quando as notas se sobrepõem.
  const limiter = ac.createDynamicsCompressor()
  master.connect(limiter).connect(ac.destination)
  for (const note of NOTES[sound]) bell(ac, master, start + note.at, note)
}

// ---------------------------------------------------------------------------
// Tocar
// ---------------------------------------------------------------------------

// O navegador só deixa tocar depois de um toque na página: o áudio nasce no primeiro.
let ctx: AudioContext | null = null
const unlock = () => {
  ctx ??= new AudioContext()
  if (ctx.state !== 'running') void ctx.resume().catch(() => {})
}
for (const event of ['pointerdown', 'keydown'] as const) document.addEventListener(event, unlock, { capture: true, passive: true })

const lastPlayed: Partial<Record<Sound, number>> = {}

/** Toca o som, se estiver ligado; `test` toca mesmo desligado (o botão de ouvir das configurações). */
export function playSound(sound: Sound, test = false): void {
  if (!test && !useSounds.getState()[sound]) return
  // Várias conversas mudando juntas: um som só.
  const now = Date.now()
  if (!test && now - (lastPlayed[sound] ?? 0) < 1_500) return
  lastPlayed[sound] = now
  const ac = ctx
  if (!ac) return
  if (ac.state === 'running') return renderSound(ac, sound)
  // Voltando do segundo plano o áudio pode estar suspenso; som atrasado não serve, então só se voltar logo.
  void ac.resume().then(
    () => Date.now() - now < 500 && renderSound(ac, sound),
    () => {},
  )
}

// Com o app em segundo plano e as notificações ligadas, a notificação já toca: não repete.
let pushOn = false
const checkPush = () => void pushStatus().then((s) => (pushOn = s === 'on'), () => {})
const audible = () => document.visibilityState === 'visible' || !pushOn

// No PC (terminal, VSCode) a pessoa costuma estar vendo: só turnos longos, como nas notificações.
const PC_DONE_MIN_MS = 60_000

let started = false

/**
 * Escuta a lista de conversas: uma que passa a esperar você toca o som de pergunta, e uma que sai de
 * "trabalhando" para "concluída", o de fim. A primeira lista de cada máquina só registra o estado.
 */
export function startSounds(): void {
  if (started) return
  started = true
  checkPush()
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && checkPush())
  // Desde quando cada conversa está trabalhando.
  const since = new Map<string, number>()

  useStore.subscribe((s, prev) => {
    if (s.catalog === prev.catalog) return
    const before = new Map(prev.catalog.map((c) => [c.sessionId, c.state]))
    const now = Date.now()
    let attention = false
    let done = false
    for (const c of s.catalog) {
      const was = before.get(c.sessionId)
      if (c.state === 'running' && was !== 'running') since.set(c.sessionId, now)
      if (!prev.catalogLoaded || was === undefined || was === c.state) continue
      if (c.state === 'waiting') attention = true
      // Com algo em segundo plano (monitor, comando), o Claude ainda vai voltar: não terminou.
      else if (was === 'running' && c.state === 'idle' && !c.tasks?.length) {
        const from = since.get(c.sessionId)
        if (c.owner !== 'pc' || (from !== undefined && now - from >= PC_DONE_MIN_MS)) done = true
      }
      if (c.state !== 'running') since.delete(c.sessionId)
    }
    if (!audible()) return
    // Pergunta e fim juntos: a pergunta pede mais atenção.
    if (attention) playSound('attention')
    else if (done) playSound('done')
  })
}
