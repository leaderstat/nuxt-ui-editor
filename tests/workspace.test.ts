import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, link } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import iconv from 'iconv-lite'
import { Workspace, decode, digest } from '../server/utils/workspace.ts'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'local-review-test-'))
  await mkdir(join(root, 'review'))
  await writeFile(join(root, 'source.txt'), 'hello!\nAB\nПривет\n')
  await writeFile(join(root, 'review/a.txt'), 'BA\nhello?\nAB\nnew')
  return { root, w: new Workspace(root, ':memory:'), cleanup: async () => { await rm(root, { recursive: true, force: true }) } }
}
test('UTF-8 BOM, UTF-16 LE/BE, Windows Cyrillic, override and CRLF decoding', () => {
  for (const enc of ['utf-8', 'utf-16le', 'utf-16be', 'windows-1251']) {
    const bytes = iconv.encode('Привет\r\n\r\n', enc, { addBOM: enc.startsWith('utf') })
    assert.equal(decode(bytes).text, 'Привет\n\n')
  }
  assert.equal(decode(iconv.encode('café', 'windows-1252'), 'windows-1252').text, 'café')
})
test('SQLite indexing, candidate collision checks, cached/reindexed documents, filters and versions', async () => {
  const { root, w, cleanup } = await fixture()
  try {
    const first = await w.load('source.txt', 'source')
    assert.equal(first.cached, false)
    assert.equal((await w.load('source.txt', 'source')).cached, true)
    const review = await w.load('review/a.txt', 'review')
    const result = await w.analyze('source.txt', 'review/a.txt', review.text, [])
    assert.deepEqual(result.lines.map(l => l.status), ['red', 'yellow', 'green', 'red'])
    assert.equal(w.progress(), 1)
    w.setFilters({ words: [{ word: 'new', mode: 'word', enabled: true, caseSensitive: false }], rules: [], repeats: false })
    assert.equal(w.filters().repeats, false)
    assert.equal((await w.analyze('source.txt', 'review/a.txt', review.text, w.filters().words)).lines[3]!.words[0], 'new')
    const saved = await w.save('review/a.txt', 'new\n😀', review.diskDigest)
    assert.equal(await readFile(join(root, 'review/a.txt'), 'utf-8'), 'new\n😀')
    assert.ok(saved.version)
    assert.equal((w.db.prepare('SELECT COUNT(*) AS n FROM document_versions').get() as { n: number }).n, 1)
    await writeFile(join(root, 'source.txt'), 'changed')
    assert.equal((await w.load('source.txt', 'source')).cached, false)
    assert.equal(first.text, 'hello!\nAB\nПривет\n')
  } finally { w.close(); await cleanup() }
})
test('file traversal, symlinks, source writes, hard links and concurrent disk edits are denied', async () => {
  const { root, w, cleanup } = await fixture()
  try {
    await w.load('source.txt', 'source')
    const review = await w.load('review/a.txt', 'review')
    await assert.rejects(w.path('../source.txt'), /traversal/)
    await assert.rejects(w.path('/etc/passwd'), /traversal/)
    await symlink(join(root, 'source.txt'), join(root, 'review/link.txt'))
    await assert.rejects(w.path('review/link.txt'), /Symbolic/)
    await assert.rejects(w.save('source.txt', 'oops', digest('hello!\nAB\nПривет\n')), /read only/)
    await writeFile(join(root, 'review/a.txt'), 'external edit')
    await assert.rejects(w.save('review/a.txt', 'overwrite', review.diskDigest), /changed on disk/)
    await link(join(root, 'source.txt'), join(root, 'review/hard.txt'))
    const hard = await w.load('review/hard.txt', 'review')
    await assert.rejects(w.save('review/hard.txt', 'oops', hard.diskDigest), /Hard-linked/)
    assert.equal(await readFile(join(root, 'source.txt'), 'utf-8'), 'hello!\nAB\nПривет\n')
    assert.ok(!(await w.tree()).some(n => n.label === '.data'))
  } finally { w.close(); await cleanup() }
})

test('bounded batched SQLite analysis can be canceled without committing a partial result', async () => {
  const { root, w, cleanup } = await fixture()
  try {
    const text = Array.from({ length: 1500 }, (_, i) => `строка ${i}`).join('\n')
    await writeFile(join(root, 'source.txt'), text)
    await writeFile(join(root, 'review/a.txt'), text)
    await assert.rejects(w.analyze('source.txt', 'review/a.txt', text, [], 0, () => true), /canceled/)
    assert.equal(w.progress(), 0)
    const result = await w.analyze('source.txt', 'review/a.txt', text, [])
    assert.equal(result.counts.green, 1500)
    assert.equal(w.progress(), 1)
  } finally { w.close(); await cleanup() }
})
