import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

const BAR = 3
const GAP = 2
/** Uma barra nova a cada intervalo: as ondas andam da direita para a esquerda. */
const STEP_MS = 60
// No celular o microfone vai para quem abriu por último: abrir outro aqui calaria o ditado.
const OWN_MIC = !/Android|iPhone|iPad/i.test(navigator.userAgent)

/**
 * Ondas da voz durante o ditado, como no áudio do WhatsApp: cada barra é um instante, da mais
 * antiga (esquerda) à mais nova (direita). No PC mostram o volume do microfone. No celular, ou se
 * o microfone não vier, seguem o ritmo do ditado: agitadas enquanto ele detecta fala (`speaking`)
 * e com um pico a cada trecho reconhecido (`activity`).
 */
export function VoiceWave({ activity, speaking, className }: { activity: string; speaking: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const mic = useRef({ live: false, since: 0, peak: 0, pulse: 0, speaking })
  const seen = useRef(activity)

  useEffect(() => {
    mic.current.speaking = speaking
  }, [speaking])

  useEffect(() => {
    if (seen.current === activity) return
    seen.current = activity
    const m = mic.current
    // O ditado ouviu fala, mas o microfone daqui só recebeu silêncio: o celular deu o som só ao ditado.
    if (m.live && performance.now() - m.since > 700 && m.peak < 0.005) m.live = false
    m.pulse = 1
  }, [activity])

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const m = mic.current
    const color = getComputedStyle(el).color
    const samples = new Uint8Array(512)
    let stopped = false
    let stream: MediaStream | undefined
    let audio: AudioContext | undefined
    let analyser: AnalyserNode | undefined

    const request = OWN_MIC ? navigator.mediaDevices?.getUserMedia({ audio: true }) : undefined
    request?.then(
      (media) => {
        if (stopped) return media.getTracks().forEach((t) => t.stop())
        stream = media
        audio = new AudioContext()
        analyser = audio.createAnalyser()
        analyser.fftSize = samples.length
        audio.createMediaStreamSource(media).connect(analyser)
        void audio.resume()
        Object.assign(m, { live: true, since: performance.now(), peak: 0 })
      },
      () => {},
    )

    function level(): number {
      if (m.live && analyser) {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const v of samples) sum += ((v - 128) / 128) ** 2
        const rms = Math.sqrt(sum / samples.length)
        m.peak = Math.max(m.peak, rms)
        // Raiz para a fala baixa aparecer; o desconto tira o ruído do ambiente.
        return Math.min(1, Math.max(0, (Math.sqrt(rms) - 0.08) * 2))
      }
      // Sem o som do microfone: agitação enquanto há fala e um pico a cada trecho, apagando aos poucos.
      m.pulse *= 0.85
      return Math.min(1, ((m.speaking ? 0.5 : 0) + m.pulse * 0.5) * (0.35 + Math.random() * 0.65))
    }

    const levels: number[] = []
    let last = 0
    let frame = requestAnimationFrame(function draw(now) {
      frame = requestAnimationFrame(draw)
      if (now - last < STEP_MS) return
      last = now

      const dpr = window.devicePixelRatio || 1
      const w = el.clientWidth
      const h = el.clientHeight
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr)
        el.height = Math.round(h * dpr)
      }
      const count = Math.max(1, Math.floor((w + GAP) / (BAR + GAP)))
      levels.push(level())
      // Começa com a linha toda em pontinhos (silêncio) e descarta o que saiu pela esquerda.
      while (levels.length < count) levels.unshift(0)
      levels.splice(0, levels.length - count)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color
      const left = w - count * (BAR + GAP) + GAP
      levels.forEach((v, i) => {
        const bar = Math.max(BAR, v * h)
        // Silêncio apagado, fala acesa.
        ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, v * 3)
        ctx.beginPath()
        ctx.roundRect(left + i * (BAR + GAP), (h - bar) / 2, BAR, bar, BAR / 2)
        ctx.fill()
      })
    })

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
      void audio?.close()
    }
  }, [])

  return <canvas ref={canvas} aria-hidden className={cn('block', className)} />
}
