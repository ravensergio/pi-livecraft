import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filePathLinks,
  remarkDownloadableFilePaths,
} from '../src/features/conversation/markdown-file-paths.ts'

const link = (path: string) => ({
  type: 'link',
  url: `/api/files/raw?path=${encodeURIComponent(path)}`,
  title: null,
  children: [{ type: 'text', value: path }],
})

test('turns an absolute Windows path in prose into a download link', () => {
  assert.deepEqual(filePathLinks('Saved to C:\\Users\\Raven\\models.json now'), [
    { type: 'text', value: 'Saved to ' },
    link('C:\\Users\\Raven\\models.json'),
    { type: 'text', value: ' now' },
  ])
})

test('keeps trailing sentence punctuation out of the link', () => {
  assert.deepEqual(filePathLinks('Wrote E:\\work\\notes.md.'), [
    { type: 'text', value: 'Wrote ' },
    link('E:\\work\\notes.md'),
    { type: 'text', value: '.' },
  ])
})

test('links a UNC path and leaves relative paths as text', () => {
  assert.deepEqual(filePathLinks('See \\\\server\\share\\a.txt vs src/a.ts'), [
    { type: 'text', value: 'See ' },
    link('\\\\server\\share\\a.txt'),
    { type: 'text', value: ' vs src/a.ts' },
  ])
})

test('leaves URLs and plain filenames untouched', () => {
  assert.equal(filePathLinks('Read config.json at https://example.com/a:b'), null)
})

test('links the real path when Markdown ate its backslash before a dot', () => {
  const source = 'Saved to C:\\Users\\Raven\\.pi\\agent\\models.json'
  // What Markdown hands the renderer: the "." lost its escaping backslash.
  const parsed = 'Saved to C:\\Users\\Raven.pi\\agent\\models.json'
  const text = {
    type: 'text',
    value: parsed,
    position: { start: { offset: 0 }, end: { offset: source.length } },
  }
  const paragraph = { type: 'paragraph', children: [text] }
  const tree = { type: 'root', children: [paragraph] }

  remarkDownloadableFilePaths()(tree, { value: source })

  assert.deepEqual(paragraph.children, [
    { type: 'text', value: 'Saved to ' },
    link('C:\\Users\\Raven\\.pi\\agent\\models.json'),
  ])
})

const spaced = 'E:\\z_Working_PI\\00-LLM Strata Ninfer\\2026-11-11-pi-work-sync\\pi-sync.ps1'

test('a path in backticks keeps its spaces and downloads', () => {
  const paragraph = { type: 'paragraph', children: [{ type: 'inlineCode', value: spaced }] }
  const tree = { type: 'root', children: [paragraph] }

  remarkDownloadableFilePaths()(tree, { value: '' })

  assert.deepEqual(paragraph.children, [{
    type: 'link',
    url: `/api/files/raw?path=${encodeURIComponent(spaced)}`,
    title: null,
    children: [{ type: 'inlineCode', value: spaced }],
  }])
})

test('a code block holding only one path downloads too', () => {
  const tree: { type: string; children: Array<Record<string, unknown>> } = {
    type: 'root',
    children: [{ type: 'code', value: `${spaced}  ` }],
  }

  remarkDownloadableFilePaths()(tree, { value: '' })

  assert.equal(tree.children[0]?.type, 'paragraph')
  assert.deepEqual((tree.children[0] as { children?: unknown[] }).children, [{
    type: 'link',
    url: `/api/files/raw?path=${encodeURIComponent(spaced)}`,
    title: null,
    children: [{ type: 'inlineCode', value: spaced }],
  }])
})

test('a code block with more than a path stays literal code', () => {
  const tree = { type: 'root', children: [{ type: 'code', value: `powershell -File ${spaced}` }] }

  remarkDownloadableFilePaths()(tree, { value: '' })

  assert.equal(tree.children[0]?.type, 'code')
})

test('a fenced command containing a linkable path stays a fenced command', () => {
  // Regression: a real reply carried this exact shape; the plugin spliced the path
  // out of the block's raw source and the ``` fences showed up as literal text.
  const source = '```\nhf download repo/pack.basalt --local-dir "E:\\models\\jesdga-iq3xxs"\n```'
  const code = {
    type: 'code',
    lang: null,
    meta: null,
    value: 'hf download repo/pack.basalt --local-dir "E:\\models\\jesdga-iq3xxs"',
    position: { start: { offset: 0 }, end: { offset: source.length } },
  }
  const tree = { type: 'root', children: [code] }

  remarkDownloadableFilePaths()(tree, { value: source })

  assert.equal(tree.children[0]?.type, 'code')
})

test('an inline code span carrying a command stays a code span', () => {
  const source = 'run `copy E:\\work\\a.ps1 D:\\b.ps1` to fix it'
  const open = source.indexOf('`')
  const span = {
    type: 'inlineCode',
    value: 'copy E:\\work\\a.ps1 D:\\b.ps1',
    position: { start: { offset: open }, end: { offset: source.indexOf('`', open + 1) + 1 } },
  }
  const paragraph = { type: 'paragraph', children: [span] }
  const tree = { type: 'root', children: [paragraph] }

  remarkDownloadableFilePaths()(tree, { value: source })

  assert.deepEqual(paragraph.children, [span])
})

test('a quoted path keeps its quote marks and loses none of its spaces', () => {
  assert.deepEqual(filePathLinks(`Path: "${spaced}" ready`), [
    { type: 'text', value: 'Path: "' },
    link(spaced),
    { type: 'text', value: '" ready' },
  ])
})

test('a prose path that a space cuts short stays plain text', () => {
  // "…\00-LLM" would be a link to something that does not exist, so nothing is linked.
  assert.equal(filePathLinks(`Here it is plain: ${spaced}`), null)
})
