import { Check, Copy, ImageIcon } from 'lucide-react'
import { memo, useState, type ComponentProps } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ImageThumb } from '@/components/image-viewer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const COLLAPSE_AFTER_LINES = 14

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className={className}
      aria-label="Copiar"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const lines = code.split('\n').length
  const long = lines > COLLAPSE_AFTER_LINES
  const [expanded, setExpanded] = useState(!long)
  return (
    <div className="my-2 overflow-hidden rounded-md border bg-muted/40">
      <div className="flex items-center justify-between border-b px-2 py-1 text-xs text-muted-foreground">
        <span className="font-mono">
          {lang || 'código'} · {lines} {lines === 1 ? 'linha' : 'linhas'}
        </span>
        <div className="flex items-center gap-1">
          {long && (
            <Button variant="ghost" size="xs" onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Recolher' : 'Expandir'}
            </Button>
          )}
          <CopyButton text={code} />
        </div>
      </div>
      <pre className={cn('overflow-x-auto p-3 font-mono text-xs leading-relaxed', !expanded && 'max-h-48 overflow-y-hidden')}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = String(children).replace(/\n$/, '')
    const lang = /language-([\w+-]+)/.exec(className ?? '')?.[1]
    if (lang || text.includes('\n')) return <CodeBlock code={text} lang={lang} />
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] break-words">{children}</code>
  },
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  h1: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1.5 font-semibold">{children}</h4>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 break-all">
      {children}
    </a>
  ),
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 pl-3 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-4" />,
  // Imagem com URL abre em tela cheia; caminho local do PC não carrega no celular, vira etiqueta.
  img: ({ src, alt }) => {
    const url = typeof src === 'string' ? src : ''
    if (/^(https?:|data:)/.test(url)) return <ImageThumb src={url} alt={alt} from="Claude" className="max-h-64 w-auto" />
    return (
      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 font-mono text-xs">
        <ImageIcon className="size-3" />
        {alt || url}
      </span>
    )
  },
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b bg-muted/50 px-2 py-1.5 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b px-2 py-1.5 align-top">{children}</td>,
}

export const Markdown = memo(function Markdown({ text, className }: { text: string } & ComponentProps<'div'>) {
  return (
    <div className={cn('text-sm break-words', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
