import { useEffect, useRef, useState } from 'react'

/** O que o TypeScript não declara do reconhecedor de voz (no Chrome ele ainda é `webkitSpeechRecognition`). */
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

const speech = window as unknown as {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}
const Recognizer = speech.SpeechRecognition ?? speech.webkitSpeechRecognition

/** Navegador com ditado (Chrome e Safari; o Firefox não tem). */
export const dictationSupported = Boolean(Recognizer)

// "no-speech" (silêncio) e "aborted" (cancelado por nós) não merecem aviso.
const ERRORS: Partial<Record<SpeechRecognitionErrorCode, string>> = {
  'not-allowed': 'Libere o microfone para o app nas configurações do navegador.',
  'service-not-allowed': 'Libere o microfone para o app nas configurações do navegador.',
  'audio-capture': 'Nenhum microfone encontrado.',
  network: 'Sem internet: o ditado precisa de conexão.',
  'language-not-supported': 'Este navegador não faz ditado em português.',
}

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b)

/** Encaixa o ditado entre o texto de antes e o de depois, com espaços e maiúscula no começo de frase. */
export function spliceSpoken(before: string, spoken: string, after: string): string {
  if (!spoken) return before + after
  const sentence = /(^|[.!?\n])\s*$/.test(before)
  const text = sentence ? spoken.charAt(0).toUpperCase() + spoken.slice(1) : spoken
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const trail = after && !/^\s/.test(after) ? ' ' : ''
  return before + lead + text + trail + after
}

type Handlers = {
  /** Tudo o que foi ouvido desde que o microfone ligou; vai sendo corrigido enquanto a pessoa fala. */
  onText: (spoken: string) => void
  /** Fim do ditado: parado pela pessoa, pelo silêncio ou por erro. */
  onEnd: () => void
  onError: (message: string) => void
}

/**
 * Ditado pelo reconhecimento de voz do navegador; no Android é o mesmo do Google que o Gboard usa.
 * Ouve uma frase por rodada e religa sozinho enquanto a pessoa fala: no modo contínuo o Chrome do
 * Android manda cada trecho novo com tudo o que já tinha sido dito, e o texto sai repetido.
 */
export function useDictation(handlers: Handlers) {
  const [listening, setListening] = useState(false)
  const current = useRef<Recognition | null>(null)
  // Frases fechadas nas rodadas anteriores e se a pessoa ainda quer o microfone ligado.
  const said = useRef('')
  const wanted = useRef(false)
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  // Sair da tela não deixa o microfone ligado.
  useEffect(
    () => () => {
      wanted.current = false
      current.current?.abort()
    },
    [],
  )

  function finish() {
    current.current = null
    wanted.current = false
    setListening(false)
    latest.current.onEnd()
  }

  /** Abre uma rodada; false se o navegador não deixou ligar o microfone. */
  function listen(): boolean {
    if (!Recognizer) return false
    const rec = new Recognizer()
    rec.lang = 'pt-BR'
    rec.continuous = false
    rec.interimResults = true
    let phrase = ''
    rec.onresult = (e) => {
      // O último resultado é a versão mais nova da frase, mesmo quando o Android repete os anteriores.
      phrase = e.results.item(e.results.length - 1).item(0).transcript.trim()
      latest.current.onText(join(said.current, phrase))
    }
    rec.onerror = (e) => {
      wanted.current = false
      const message = ERRORS[e.error]
      if (message) latest.current.onError(message)
    }
    rec.onend = () => {
      said.current = join(said.current, phrase)
      // Rodada sem fala (silêncio) encerra o ditado; com fala, religa para a próxima frase.
      if (wanted.current && phrase && listen()) return
      finish()
    }
    try {
      rec.start()
    } catch {
      return false
    }
    current.current = rec
    return true
  }

  function start() {
    if (current.current) return
    said.current = ''
    wanted.current = true
    if (listen()) return setListening(true)
    latest.current.onError('Não deu para ligar o microfone.')
    finish()
  }

  return {
    listening,
    /** Liga o microfone ou, se já estiver ouvindo, termina e mantém o que foi ouvido. */
    toggle: () => {
      if (!current.current) return start()
      wanted.current = false
      current.current.stop()
    },
    /** Desliga na hora, sem esperar o fim da frase (ex.: a pessoa começou a digitar). */
    cancel: () => {
      wanted.current = false
      current.current?.abort()
    },
  }
}
