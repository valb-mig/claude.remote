import { Pause, Play, X } from 'lucide-react'
import { Slider } from 'radix-ui'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { pauseSpeech, resumeSpeech, seekSpeech, stopSpeaking, useSpeech } from '@/lib/speech'

const STEPS = 1000

/**
 * Barra da leitura em voz alta, em cima da caixa de mensagem, como a do Spotify: pausar e continuar,
 * a frase que está sendo lida e até onde já leu. Tocar ou arrastar na barra pula para outra frase.
 */
export function SpeechPlayer() {
  const reading = useSpeech((s) => s.reading)
  // Enquanto arrasta, a barra segue o dedo; a leitura só pula ao soltar.
  const [dragging, setDragging] = useState<number | null>(null)
  if (!reading) return null
  const value = dragging ?? reading.progress
  return (
    <div className="flex shrink-0 items-center gap-3 border-t bg-card px-3 py-2">
      <Button
        size="icon"
        className="size-11 shrink-0 rounded-full"
        onClick={reading.playing ? pauseSpeech : resumeSpeech}
        aria-label={reading.playing ? 'Pausar a leitura' : 'Continuar a leitura'}
      >
        {reading.playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
      </Button>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="truncate text-xs text-muted-foreground">{reading.units[reading.index]?.text}</p>
        <Slider.Root
          value={[Math.round(value * STEPS)]}
          max={STEPS}
          onValueChange={([v]) => setDragging(v / STEPS)}
          onValueCommit={([v]) => {
            setDragging(null)
            seekSpeech(v / STEPS)
          }}
          className="relative flex h-5 touch-none items-center select-none"
        >
          <Slider.Track className="relative h-1 grow overflow-hidden rounded-full bg-muted">
            <Slider.Range className="absolute h-full bg-primary" />
          </Slider.Track>
          <Slider.Thumb
            aria-label="Até onde já leu"
            className="block size-3.5 rounded-full bg-primary shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Slider.Root>
      </div>
      <Button variant="ghost" size="icon" className="shrink-0" onClick={stopSpeaking} aria-label="Fechar a leitura">
        <X />
      </Button>
    </div>
  )
}
