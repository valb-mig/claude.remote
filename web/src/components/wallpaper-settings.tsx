import { Check, TriangleAlert } from 'lucide-react'
import { Scene } from '@/components/wallpaper/wallpaper'
import { THEMES } from '@/components/wallpaper/themes'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAudio } from '@/lib/audio'
import { INTENSITIES, setWallpaper, useWallpaper, type ThemeId } from '@/lib/wallpaper'

const tileClass =
  'relative h-16 overflow-hidden rounded-md border text-left transition-colors aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary/40'

/** Nome do tema por cima da miniatura, numa tarja que o fundo animado não apaga. */
function Tag({ children, picked }: { children: React.ReactNode; picked: boolean }) {
  return (
    <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium backdrop-blur-sm">
      {picked && <Check className="size-3 text-primary" />}
      {children}
    </span>
  )
}

/** Escolhe o fundo animado da conversa; as miniaturas são a própria cena rodando. */
export function WallpaperSettings() {
  const { theme, intensity } = useWallpaper()
  const pick = (id: ThemeId) => setWallpaper({ theme: id })
  const current = THEMES.find((t) => t.id === theme)
  // O tema de som depende de o PC conseguir ouvir a própria saída; sem isso ele fica em repouso
  // para sempre, e sem um aviso ninguém descobre por quê.
  const audio = useAudio((s) => s.available)
  const noAudio = theme === 'som' && audio === false

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Fundo da conversa</CardTitle>
        <CardDescription>
          Desenho em ASCII atrás das mensagens, só nesta tela e só neste aparelho. Ele congela sozinho quando sai da tela ou o app vai para
          segundo plano.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={theme === 'none'} onClick={() => pick('none')} className={cn(tileClass, 'bg-muted')}>
            <Tag picked={theme === 'none'}>Nenhum</Tag>
          </button>
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={theme === t.id}
              aria-label={`${t.name}: ${t.hint}`}
              onClick={() => pick(t.id)}
              className={tileClass}
            >
              <Scene id={t.id} zoom={0.5} className="absolute inset-0" />
              <Tag picked={theme === t.id}>{t.name}</Tag>
            </button>
          ))}
        </div>

        {current && (
          <>
            <p className="text-xs text-muted-foreground">{current.hint}</p>
            {noAudio && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                O PC não conseguiu ouvir a própria saída. Falta o <code className="font-mono">parec</code> (pacote{' '}
                <code className="font-mono">libpulse</code>) ou o servidor de som não está rodando para o usuário do serviço.
              </p>
            )}
            <div className="flex gap-2">
              {INTENSITIES.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  aria-pressed={intensity === i.key}
                  onClick={() => setWallpaper({ intensity: i.key })}
                  className="flex-1 rounded-md border py-1.5 text-sm aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:font-medium"
                >
                  {i.label}
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
