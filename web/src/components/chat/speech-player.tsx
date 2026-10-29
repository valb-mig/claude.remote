import { Pause, Play, X } from 'lucide-react'
import { Slider } from 'radix-ui'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SPEEDS, pauseSpeech, resumeSpeech, seekSpeech, setSpeechRate, stopSpeaking, useSpeech } from '@/lib/speech'
import { cn } from '@/lib/utils'
import { useGlass } from '@/lib/wallpaper'

const STEPS = 1000

const speedLabel = (rate: number) => `${rate.toLocaleString('pt-BR')}x`

/**
 * Barra da leitura em voz alta, em cima da caixa de mensagem, como a do Spotify: pausar e continuar,
 * a frase que está sendo lida e até onde já leu. Tocar ou arrastar na barra pula para outra frase, e
 * o botão de velocidade passa por 1x, 1,5x, 2x e 3x.
 */
export function SpeechPlayer({ sessionId }: { sessionId: string }) {
  // Com conversas lado a lado, a barra aparece só na conversa que está sendo lida.
  const reading = useSpeech((s) => (s.reading?.key.startsWith(`${sessionId}:`) ? s.reading : null))
  // Enquanto arrasta, a barra segue o dedo; a leitura só pula ao soltar.
  const [dragging, setDragging] = useState<number | null>(null)
  const glass = useGlass()
  const rate = useSpeech((s) => s.rate)
  if (!reading) return null
  const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length]!
  const value = dragging ?? reading.progress
  return (
    <div className={cn('shrink-0 border-t px-3 py-2 compact:py-1', glass ? 'bg-card/70 backdrop-blur-md' : 'bg-card')}>
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
        <Button
          size="icon"
          className="size-11 shrink-0 rounded-full compact:size-9"
          onClick={reading.playing ? pauseSpeech : resumeSpeech}
          aria-label={reading.playing ? 'Pausar a leitura' : 'Continuar a leitura'}
        >
          {reading.playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
        </Button>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-xs text-muted-foreground compact:hidden">{reading.units[reading.index]?.text}</p>
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
        <Button
          variant={rate === 1 ? 'ghost' : 'secondary'}
          size="sm"
          // Largura fixa: trocar de 1x para 1,5x não empurra a barra.
          className={cn('w-12 shrink-0 px-0 tabular-nums', rate !== 1 && 'font-semibold')}
          onClick={() => setSpeechRate(next)}
          aria-label={`Velocidade ${speedLabel(rate)}: tocar para ${speedLabel(next)}`}
        >
          {speedLabel(rate)}
        </Button>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={stopSpeaking} aria-label="Fechar a leitura">
          <X />
        </Button>
      </div>
    </div>
  )
}
