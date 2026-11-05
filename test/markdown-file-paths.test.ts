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
