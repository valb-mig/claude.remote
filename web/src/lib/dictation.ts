import { useEffect, useState } from 'react'

/** O que o TypeScript não declara do reconhecedor de voz (no Chrome ele ainda é `webkitSpeechRecognition`). */
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
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

// Só os erros que encerram o ditado; "no-speech" (silêncio) e "aborted" deixam a próxima rodada ouvir.
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

/** Silêncio que encerra o ditado sozinho, para o microfone não ficar ligado se a pessoa esquecer. */
const SILENCE_LIMIT_MS = 60_000
/** Rodada vazia mais curta que isso é o reconhecedor falhando, não silêncio. */
const BROKEN_ROUND_MS = 500

/**
 * Ciclo do microfone: uma frase por rodada, religando sozinho até a pessoa encerrar. No modo
 * contínuo o Chrome do Android manda cada trecho novo com tudo o que já tinha sido dito, e o texto
 * sai repetido; com rodadas, cada frase nova só substitui a versão anterior dela.
 */
function dictationEngine(initial: Handlers, setListening: (on: boolean) => void, setSpeaking: (on: boolean) => void) {
  let handlers = initial
  let current: Recognition | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  // Ditado em andamento: se a pessoa ainda quer ouvir, frases fechadas, última fala e falhas seguidas.
  let wanted = false
  let said = ''
  let heardAt = 0
  let failures = 0

  function finish() {
    clearTimeout(retry)
    current = null
    wanted = false
    setListening(false)
    setSpeaking(false)
    handlers.onEnd()
  }

  function giveUp() {
    handlers.onError('O microfone desligou. Toque nele para continuar.')
    finish()
  }

  /** Abre uma rodada; false se o navegador não deixou ligar o microfone. */
  function listen(): boolean {
    if (!Recognizer) return false
    const rec = new Recognizer()
    rec.lang = 'pt-BR'
    rec.continuous = false
    rec.interimResults = true
    const opened = performance.now()
    let phrase = ''
    rec.onresult = (e) => {
      heardAt = performance.now()
      // O último resultado é a versão mais nova da frase, mesmo quando o Android repete os anteriores.
      phrase = e.results.item(e.results.length - 1).item(0).transcript.trim()
      handlers.onText(join(said, phrase))
    }
    rec.onspeechstart = () => {
      heardAt = performance.now()
      setSpeaking(true)
    }
    rec.onspeechend = () => setSpeaking(false)
    rec.onerror = (e) => {
      // Silêncio e falhas passageiras não encerram: a rodada termina e a próxima continua ouvindo.
      const message = ERRORS[e.error]
      if (!message) return
      wanted = false
      handlers.onError(message)
    }
    rec.onend = () => {
      current = null
      said = join(said, phrase)
      setSpeaking(false)
      if (!wanted) return finish()
      const now = performance.now()
      if (now - heardAt >= SILENCE_LIMIT_MS) {
        if (!said) handlers.onError('Não ouvi nada. Toque no microfone e fale.')
        return finish()
      }
      // Pausa para pensar não desliga: a próxima rodada continua ouvindo. Rodada vazia e curtíssima
      // é o reconhecedor falhando (ex.: ainda ocupado com a anterior): tenta de novo com folga,
      // poucas vezes, para não virar um laço.
      const broken = !phrase && now - opened < BROKEN_ROUND_MS
      failures = broken ? failures + 1 : 0
      if (failures > 3) return giveUp()
      if (!broken) {
        if (!listen()) giveUp()
        return
      }
      retry = setTimeout(() => {
        if (wanted && !listen()) giveUp()
      }, 300 * failures)
    }
    try {
      rec.start()
    } catch {
      return false
    }
    current = rec
    return true
  }

  function start() {
    said = ''
    wanted = true
    heardAt = performance.now()
    failures = 0
    if (listen()) return setListening(true)
    handlers.onError('Não deu para ligar o microfone.')
    finish()
  }

  /** Encerra o ditado; `now` desliga sem esperar o fim da frase. */
  function end(now: boolean) {
    if (!wanted) return
    wanted = false
    // Entre uma rodada e outra não há reconhecedor para esperar.
    if (!current) return finish()
    if (now) current.abort()
    else current.stop()
  }

  return {
    /** Troca os handlers a cada render, para os callbacks verem o estado mais novo do componente. */
    handle: (next: Handlers) => {
      handlers = next
    },
    // Enquanto a última frase fecha (`current` sem `wanted`), outro toque espera.
    toggle: () => (wanted ? end(false) : !current && start()),
    stop: () => end(false),
    cancel: () => end(true),
  }
}

/** Ditado pelo reconhecimento de voz do navegador; no Android é o mesmo do Google que o Gboard usa. */
export function useDictation(handlers: Handlers) {
  const [listening, setListening] = useState(false)
  // O reconhecedor detectou fala agora (dá o ritmo das ondas quando elas não podem ler o microfone).
  const [speaking, setSpeaking] = useState(false)
  const [engine] = useState(() => dictationEngine(handlers, setListening, setSpeaking))
  useEffect(() => {
    engine.handle(handlers)
  })

  // Mandar o app para segundo plano ou sair da tela desliga o microfone.
  useEffect(() => {
    const hide = () => {
      if (document.hidden) engine.stop()
    }
    document.addEventListener('visibilitychange', hide)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      engine.cancel()
    }
  }, [engine])

  return {
    listening,
    speaking,
    /** Liga o microfone ou, se já estiver ouvindo, termina e mantém o que foi ouvido. */
    toggle: engine.toggle,
    /** Desliga na hora, sem esperar o fim da frase (ex.: a pessoa começou a digitar). */
    cancel: engine.cancel,
  }
}
