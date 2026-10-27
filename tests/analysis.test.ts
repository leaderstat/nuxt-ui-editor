import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyze, hash, half, replacements, wordHits, History, removeGreen } from '../shared/analysis.ts'

test('UTF-8 byte sums and Unicode code point midpoint', () => {
  assert.equal(hash('AB'), 131)
  assert.equal(hash('Я😀'), Buffer.from('Я😀').reduce((a, b) => a + b, 0))
  assert.equal(half('😀Яabc'), '😀Я')
})
test('full, half, unique, reordered, duplicates, empty and Cyrillic lines', () => {
  const result = analyze('hello!\nПривет\n\nAB\nAB', 'AB\nhello?\nunique\nПривет\n\nAB\nBA')
  assert.deepEqual(result.map(l => l.status), ['green', 'yellow', 'red', 'green', 'green', 'green', 'red'])
  assert.equal(removeGreen(result), 'hello?\nunique\nBA')
})
test('half checksum collision and unequal half lengths never match', () => {
  assert.equal(analyze('ABxy', 'BAzz')[0]!.status, 'red')
  assert.equal(analyze('abcd', 'abcXYZ')[0]!.status, 'red')
  assert.equal(analyze('a', 'b')[0]!.status, 'red')
})
test('literal replacements are ordered, switchable and Unicode repeats exclude dots/newlines', () => {
  assert.equal(replacements('аааабв\nприиивет...😀😀\n\n', [], true), 'абв\nпривет...😀\n\n')
  assert.equal(replacements('aa', [], false), 'aa')
  assert.equal(replacements('cat cat', [{ search: 'cat', replacement: 'dog', enabled: true }, { search: 'dog', replacement: 'fox', enabled: false }], false), 'dog dog')
})
test('word filters mark exact Unicode words or substrings without deleting', () => {
  const words = [{ word: 'мир', enabled: true, mode: 'word' as const, caseSensitive: false }]
  assert.deepEqual(wordHits('МИР мирный', words), ['мир'])
  assert.deepEqual(wordHits('мирный', words), [])
  assert.deepEqual(wordHits('мир', [{ ...words[0]!, enabled: false }]), [])
  assert.deepEqual(wordHits('мирный', [{ ...words[0]!, mode: 'substring' }]), ['мир'])
})
test('undo/redo deletion and new edit invalidates redo', () => {
  const h = new History('first\nsecond')
  h.set('second'); assert.equal(h.undo(), 'first\nsecond')
  assert.equal(h.redo(), 'second'); h.undo(); h.set('third')
  assert.equal(h.canRedo, false)
})
test('bounded 30,000 line comparison preserves order', () => {
  const source = Array.from({ length: 30000 }, (_, i) => `line ${i}`).join('\n')
  const result = analyze(source, source.split('\n').reverse().join('\n'))
  assert.equal(result.length, 30000)
  assert.ok(result.every(l => l.status === 'green'))
})
