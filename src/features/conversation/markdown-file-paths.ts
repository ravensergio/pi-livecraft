import { visit } from 'unist-util-visit'

/** Backend route that streams a file to the browser as a download. */
export const fileDownloadUrl = '/api/files/raw?path='

/** Absolute Windows (drive-letter or UNC) file paths; relative and POSIX paths
 * stay plain text because they match too many things in ordinary prose. */
const absolutePathPattern = /(?<![\w.-])(?:[A-Za-z]:[\\/]|\\\\)[^\s`<>"'|?*]*/g

type MarkdownText = { type: 'text'; value: string }
type MarkdownLink = { type: 'link'; url: string; title: null; children: MarkdownText[] }

/** Sentence punctuation and closing brackets are not part of the path. */
function trimPathTail(path: string): string {
  return path.replace(/[.,;:!?)\]}»””']+$/, '')
}

/** Splits a text run around absolute file paths, turning each into a download link. */
export function filePathLinks(value: string): Array<MarkdownText | MarkdownLink> | null {
  const parts: Array<MarkdownText | MarkdownLink> = []
  let next = 0
  for (const match of value.matchAll(absolutePathPattern)) {
    const path = trimPathTail(match[0])
    if (!path) continue
    if (match.index > next) parts.push({ type: 'text', value: value.slice(next, match.index) })
    parts.push({
      type: 'link',
      url: `${fileDownloadUrl}${encodeURIComponent(path)}`,
      title: null,
      children: [{ type: 'text', value: path }],
    })
    next = match.index + path.length
  }
  if (parts.length === 0) return null
  if (next < value.length) parts.push({ type: 'text', value: value.slice(next) })
  return parts
}

/** Makes file paths the model prints clickable. Only text runs are visited, so
 * code blocks and inline code keep showing literal paths. */
export function remarkDownloadableFilePaths() {
  return (tree: { type: string }, file: { value?: unknown }) => {
    visit(
      tree as never,
      'text',
      (
        node: {
          value: unknown
          position?: { start: { offset?: number }; end: { offset?: number } }
        },
        index: number | undefined,
        parent: { children: unknown[]; type?: string } | null,
      ) => {
        if (!parent || typeof index !== 'number' || parent.type === 'link') return
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
