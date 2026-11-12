import { visit } from 'unist-util-visit'

/** Backend route that streams a file to the browser as a download. */
export const fileDownloadUrl = '/api/files/raw?path='

/** Absolute Windows (drive-letter or UNC) path, stopping at the first space: in
 *  prose nothing marks where the path ends, so a space ends it. */
const prosePathPattern = /(?<![\w.-])(?:[A-Za-z]:[\\/]|\\\\)[^\s`<>"'|?*]*/g

/** Quoted absolute path: the quote marks mark the ends, so spaces belong to it. */
const quotedPathPattern = /["'‘’“”]((?:[A-Za-z]:[\\/]|\\\\)[^"'‘’“”\n]*)["'‘’“”]/g

/** A code span or code block that is nothing but one path. The delimiters mark the
 *  ends, so spaces are part of the path — folder names like "00-LLM Strata Ninfer"
 *  are exactly why this case exists. */
const wholePathPattern = /^(?:[A-Za-z]:[\\/]|\\\\)[^"'`|?*<>\n]*[^\s"'`|?*<>,.;:!)]$/

type MarkdownText = { type: 'text'; value: string }
type MarkdownCode = { type: 'inlineCode'; value: string }
type MarkdownChild = MarkdownText | MarkdownCode
type MarkdownLink = { type: 'link'; url: string; title: null; children: MarkdownChild[] }
type Span = { start: number; end: number; path: string }

/** Sentence punctuation and closing brackets are not part of the path. */
function trimPathTail(path: string): string {
  return path.replace(/[.,;:!?)\]}»””']+$/, '')
}

/** Only a file can be downloaded, and only a file's name carries a dot. A prose
 *  path that stops before a space in a folder name ("…\00-LLM Strata Ninfer\…")
 *  is a truncated guess, so it is left as text rather than linked. */
function looksLikeFile(path: string): boolean {
  const name = path.slice(Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1)
  return name.includes('.') && !name.endsWith('.')
}

function downloadLink(path: string, child: MarkdownChild): MarkdownLink {
  return {
    type: 'link',
    url: `${fileDownloadUrl}${encodeURIComponent(path)}`,
    title: null,
    children: [child],
  }
}

/** Absolute paths sitting between quote marks; the quotes stay outside the link. */
function quotedPathSpans(value: string): Span[] {
  const spans: Span[] = []
  for (const match of value.matchAll(quotedPathPattern)) {
    const quoted = match[1]
    const path = quoted.trim()
    if (!wholePathPattern.test(path)) continue
    const start = (match.index ?? 0) + 1 + (quoted.length - quoted.trimStart().length)
    spans.push({ start, end: start + path.length, path })
  }
  return spans
}

/** Splits a text run around file paths, turning each into a download link. */
export function filePathLinks(value: string): Array<MarkdownText | MarkdownLink> | null {
  const spans = quotedPathSpans(value)
  for (const match of value.matchAll(prosePathPattern)) {
    const path = trimPathTail(match[0])
    const start = match.index ?? 0
    if (!path || !looksLikeFile(path)) continue
    if (spans.some((span) => start < span.end && span.start < start + path.length)) continue
    spans.push({ start, end: start + path.length, path })
  }
  if (spans.length === 0) return null

  const parts: Array<MarkdownText | MarkdownLink> = []
  let next = 0
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    if (span.start < next) continue
    if (span.start > next) parts.push({ type: 'text', value: value.slice(next, span.start) })
    parts.push(downloadLink(span.path, { type: 'text', value: span.path }))
    next = span.end
  }
  if (next < value.length) parts.push({ type: 'text', value: value.slice(next) })
  return parts
}

/** The path when a code span or code block holds nothing else, otherwise null. */
function singlePathCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.includes('\n') || !wholePathPattern.test(text) ? null : text
}

/** Makes file paths the model prints clickable. Paths in prose are linked only when
 *  they end on a file name; paths in backticks, in a single-path code block, or
 *  between quote marks are linked whole, spaces and all, because their delimiters
 *  mark the ends. Anything else stays literal text or code. */
export function remarkDownloadableFilePaths() {
  return (tree: { type: string }, file: { value?: unknown }) => {
    visit(
      tree as never,
      ['text', 'inlineCode', 'code'],
      (
        node: {
          type: string
          value: unknown
          position?: { start: { offset?: number }; end: { offset?: number } }
        },
        index: number | undefined,
        parent: { children: unknown[]; type?: string } | null,
      ) => {
        if (!parent || typeof index !== 'number' || parent.type === 'link') return

        const codePath = singlePathCode(node.value)
        if (codePath) {
          // A run that is only a path (bare, or in code) is exact, so it is linked
          // whole; code keeps its chip look, prose keeps the plain link look.
          const child: MarkdownChild = node.type === 'text'
            ? { type: 'text', value: codePath }
            : { type: 'inlineCode', value: codePath }
          const link = downloadLink(codePath, child)
          // A code block is block-level, so its link needs a paragraph to sit in.
          parent.children.splice(
            index,
            1,
            node.type === 'code' ? { type: 'paragraph', children: [link] } : link,
          )
          return ['skip', index] as const
        }
        // Code that is more than one path stays code: the prose branch below reads raw
        // source, so linkifying it would splice the path out of a code span or fence
        // and leave the backticks visible (hf-download command regression).
        if (node.type !== 'text') return

        // Markdown escapes eat the backslash before punctuation, so "\.pi" already
        // lost it by the time the text node exists; read the run's source span.
        // shortcut: plain text around a path is taken raw too, so a Markdown escape
        // elsewhere in the same run would show its backslash — upgrade to re-parse
        // the pieces if that ever shows up.
        const start = node.position?.start.offset
        const end = node.position?.end.offset
        const source = typeof file.value === 'string' ? file.value : ''
        const run = start === undefined || end === undefined || !source
          ? String(node.value)
          : source.slice(start, end)
        const children = filePathLinks(run)
        if (!children) return
        parent.children.splice(index, 1, ...children)
        return ['skip', index + children.length - 1] as const
      },
    )
  }
}
