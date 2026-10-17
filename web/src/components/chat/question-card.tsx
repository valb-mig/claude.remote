import { MessageCircleQuestion } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { api, errorMessage } from '@/lib/api'
import type { Question } from '@/lib/types'
import type { Item } from './items'

type Props = Extract<Item, { type: 'question' }> & { sessionId: string; actionable: boolean }

function OptionText({ label, description }: { label: string; description: string }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium">{label}</div>
      {description && description !== label && <div className="text-xs text-muted-foreground">{description}</div>}
    </div>
  )
}

const optionClass =
  'flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5'

export function QuestionCard({ sessionId, req, resolution, actionable }: Props) {
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  if (resolution) {
    return (
      <div className="space-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {resolution.decision === 'answered' && resolution.answers ? (
          Object.entries(resolution.answers).map(([q, a]) => (
            <div key={q}>
              {q} <span className="font-medium text-foreground">→ {a}</span>
            </div>
          ))
        ) : (
          <div>{resolution.decision === 'declined' ? 'Você preferiu não responder.' : 'Pergunta cancelada.'}</div>
        )}
      </div>
    )
  }

  const answerFor = (q: Question) => other[q.question]?.trim() || (picked[q.question] ?? []).join(', ')
  const complete = req.questions.every((q) => answerFor(q))

  async function submit(decline: boolean) {
    setBusy(true)
    try {
      const answers = Object.fromEntries(req.questions.map((q) => [q.question, answerFor(q)]))
      await api.answer(sessionId, req.requestId, decline ? { decline: true } : { answers })
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(false)
    }
  }

  const toggle = (q: string, label: string, on: boolean) =>
    setPicked((p) => {
      const current = p[q] ?? []
      return { ...p, [q]: on ? [...current, label] : current.filter((l) => l !== label) }
    })

  return (
    <Card size="sm" className="border-amber-500/50 ring-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircleQuestion className="size-4 text-amber-600 dark:text-amber-400" />
          {req.questions.length > 1 ? 'O Claude tem perguntas' : 'O Claude tem uma pergunta'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {req.questions.map((q, qi) => (
          <fieldset key={q.question} className="space-y-2" disabled={!actionable || busy}>
            <div className="space-y-1">
              {q.header && <Badge variant="secondary">{q.header}</Badge>}
              <p className="text-sm font-medium">{q.question}</p>
              {q.multiSelect && <p className="text-xs text-muted-foreground">Pode escolher mais de uma.</p>}
            </div>
            {q.multiSelect ? (
              <div className="space-y-2">
                {q.options.map((o, oi) => (
                  <label key={o.label} htmlFor={`q${qi}-o${oi}`} className={optionClass}>
                    <Checkbox
                      id={`q${qi}-o${oi}`}
                      checked={(picked[q.question] ?? []).includes(o.label)}
                      onCheckedChange={(on) => toggle(q.question, o.label, on === true)}
                    />
                    <OptionText {...o} />
                  </label>
                ))}
              </div>
            ) : (
              <RadioGroup
                value={picked[q.question]?.[0] ?? ''}
                onValueChange={(v) => setPicked((p) => ({ ...p, [q.question]: [v] }))}
                className="gap-2"
              >
                {q.options.map((o, oi) => (
                  <label key={o.label} htmlFor={`q${qi}-o${oi}`} className={optionClass}>
                    <RadioGroupItem id={`q${qi}-o${oi}`} value={o.label} />
                    <OptionText {...o} />
                  </label>
                ))}
              </RadioGroup>
            )}
            {q.options
              .filter((o) => o.preview && (picked[q.question] ?? []).includes(o.label))
              .map((o) => (
                <pre key={o.label} className="overflow-x-auto rounded border bg-muted/40 p-2 font-mono text-[11px]">
                  {o.preview}
                </pre>
              ))}
            <Input
              placeholder="Outra resposta…"
              value={other[q.question] ?? ''}
              onChange={(e) => setOther((o) => ({ ...o, [q.question]: e.target.value }))}
            />
          </fieldset>
        ))}
      </CardContent>
      <CardFooter className="flex gap-2">
        {actionable ? (
          <>
            <Button size="lg" className="flex-1" disabled={!complete || busy} onClick={() => submit(false)}>
              Responder
            </Button>
            <Button size="lg" variant="ghost" disabled={busy} onClick={() => submit(true)}>
              Não responder
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Sem resposta: a sessão não está mais aberta no painel.</p>
        )}
      </CardFooter>
    </Card>
  )
}
