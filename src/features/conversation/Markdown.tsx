import { lazy, memo, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { CopyablePre } from './CodeBlock.tsx'
import { parseMarkdownFrontmatter } from './markdown-frontmatter.ts'

/** Converts single newlines in text into hard breaks (chat-style line layout).
 *  react-markdown has no `breaks` option, so this remark plugin provides it. */
function remarkSingleLineBreaks() {
  return (tree: { type: string }) => {
    visit(
      tree as never,
      'text',
      (
        node: { value: unknown },
        index: number | undefined,
        parent: { children: unknown[] } | null,
      ) => {
        if (!parent || typeof index !== 'number' || !String(node.value).includes('\n')) return
        const parts = String(node.value).split('\n')
        const children: Array<{ type: string; value?: string }> = []
        parts.forEach((part, i) => {
          if (i > 0) children.push({ type: 'break' })
          if (part) children.push({ type: 'text', value: part })
        })
        parent.children.splice(index, 1, ...children)
        return [index + children.length - 1, 'skip'] as const
      },
    )
  }
}

const LazyCodeHighlighter = lazy(() => import('./CodeHighlighter'))
const languageAliases: Record<string, string> = {
  cs: 'csharp',
  html: 'markup',
  js: 'javascript',
  md: 'markdown',
  sh: 'bash',
  shell: 'bash',
  ts: 'typescript',
  xml: 'markup',
  zsh: 'bash',
}
const highlightedLanguages = new Set([
  'bash',
  'csharp',
  'css',
  'javascript',
  'json',
  'markdown',
  'markup',
  'typescript',
])

/** Defers syntax highlighting until a fenced block approaches the viewport. */
function MarkdownCode({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const rawLanguage = /(?:^|\s)language-([^\s]+)/.exec(className ?? '')?.[1]?.toLowerCase()
  const language = rawLanguage ? languageAliases[rawLanguage] ?? rawLanguage : undefined
  const canHighlight = Boolean(language && highlightedLanguages.has(language))

  useEffect(() => {
    if (!canHighlight || isNearViewport) return
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setIsNearViewport(true)
      },
      { rootMargin: '800px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [canHighlight, isNearViewport])

  const plainCode = <code className={className} ref={ref}>{children}</code>
  if (!canHighlight || !isNearViewport) return plainCode
  return (
    <Suspense fallback={plainCode}>
      <LazyCodeHighlighter
        className={className}
        CodeTag='span'
        customStyle={{
          background: 'transparent',
          font: 'inherit',
          margin: 0,
          padding: 0,
          whiteSpace: 'inherit',
        }}
        language={language}
        PreTag='code'
        wrapLongLines
      >
        {String(children ?? '')}
      </LazyCodeHighlighter>
    </Suspense>
  )
}

/** Renders conversation Markdown and optionally exposes validated front matter as a table. */
export const Markdown = memo(function Markdown(
  {
    breaks = false,
    children,
    copyablePre = false,
    onError,
    renderFrontmatter = false,
  }: {
    /** Treat single newlines as hard breaks (user messages keep their line layout). */
    breaks?: boolean
    children: string
    copyablePre?: boolean
    onError?: (cause: unknown) => void
    renderFrontmatter?: boolean
  },
) {
  const frontmatter = renderFrontmatter ? parseMarkdownFrontmatter(children) : null
  const body = frontmatter?.body ?? children

  return (
    <>
      {frontmatter && frontmatter.entries.length > 0 && (
        <table className='tool-call-frontmatter'>
          <thead>
            <tr>
              <th>Property</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {frontmatter.entries.map(({ key, value }) => (
              <tr key={key}>
                <th scope='row'>{key}</th>
                <td>
                  <code className='tool-call-frontmatter-value'>{value}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ReactMarkdown
        components={{
          code: ({ children: code, className }) => (
            <MarkdownCode className={className}>{code}</MarkdownCode>
          ),
          pre: ({ children: code }) =>
            copyablePre
              ? <CopyablePre onError={onError}>{code}</CopyablePre>
              : <pre>{code}</pre>,
        }}
        remarkPlugins={breaks ? [remarkGfm, remarkSingleLineBreaks] : [remarkGfm]}
      >
        {body}
      </ReactMarkdown>
    </>
  )
})
