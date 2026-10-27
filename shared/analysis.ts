export type Status = 'green' | 'yellow' | 'red'
export interface Line { text: string; status: Status; words: string[] }
export interface WordFilter { word: string; enabled: boolean; mode: 'word' | 'substring'; caseSensitive: boolean }
export interface Replacement { search: string; replacement: string; enabled: boolean }
export interface Filters { words: WordFilter[]; rules: Replacement[]; repeats: boolean }
export const defaultFilters = (): Filters => ({ words: [], rules: [], repeats: true })
export const normalize = (text: string) => text.replace(/\r\n?/g, '\n')
export const linesOf = (text: string) => normalize(text).split('\n')
export function hash(text: string): number {
  return new TextEncoder().encode(text).reduce((sum, byte) => sum + byte, 0)
}
export function half(text: string): string {
  const chars = Array.from(text)
  return chars.slice(0, Math.floor(chars.length / 2)).join('')
}
export function wordHits(text: string, words: WordFilter[]): string[] {
  return words.filter(f => {
    if (!f.enabled || !f.word) return false
    const content = f.caseSensitive ? text : text.toLocaleLowerCase()
    const word = f.caseSensitive ? f.word : f.word.toLocaleLowerCase()
    return f.mode === 'substring' ? content.includes(word) : Array.from(content.match(/[\p{L}\p{N}_]+/gu) || []).includes(word)
  }).map(f => f.word)
}
export function replacements(text: string, rules: Replacement[], repeats: boolean): string {
  for (const rule of rules) if (rule.enabled && rule.search) text = text.split(rule.search).join(rule.replacement)
  // Newlines are structure, not repeated characters to collapse.
  return repeats ? text.replace(/([^\.\r\n])\1+/gu, '$1') : text
}
export function sourceIndex(source: string) {
  const full = new Map<number, Set<string>>()
  const prefixes = new Map<string, Set<string>>()
  for (const text of linesOf(source)) {
    const sum = hash(text), prefix = half(text)
    if (!full.has(sum)) full.set(sum, new Set())
    full.get(sum)!.add(text)
    if (prefix) {
      const key = `${Array.from(prefix).length}:${hash(prefix)}`
      if (!prefixes.has(key)) prefixes.set(key, new Set())
      prefixes.get(key)!.add(prefix)
    }
  }
  return { full, prefixes }
}
export function classify(text: string, index: ReturnType<typeof sourceIndex>): Status {
  if (index.full.get(hash(text))?.has(text)) return 'green'
  const prefix = half(text)
  return prefix && index.prefixes.get(`${Array.from(prefix).length}:${hash(prefix)}`)?.has(prefix) ? 'yellow' : 'red'
}
export function analyze(source: string, review: string, words: WordFilter[] = []): Line[] {
  const index = sourceIndex(source)
  return linesOf(review).map(text => ({ text, status: classify(text, index), words: wordHits(text, words) }))
}
export const removeGreen = (lines: Line[]) => lines.filter(l => l.status !== 'green').map(l => l.text).join('\n')
export class History {
  entries: string[]
  position = 0
  constructor(text: string) { this.entries = [text] }
  get value() { return this.entries[this.position]! }
  get canUndo() { return this.position > 0 }
  get canRedo() { return this.position < this.entries.length - 1 }
  set(text: string) {
    if (text === this.value) return
    this.entries.splice(this.position + 1)
    this.entries.push(text)
    // Bound history memory for large documents (at most 32 MiB plus current text).
    while (this.entries.length > 1 && (this.entries.length > 100 || this.entries.reduce((n, s) => n + s.length * 2, 0) > 32 * 1024 * 1024)) this.entries.shift()
    this.position = this.entries.length - 1
  }
  undo() { if (this.canUndo) this.position--; return this.value }
  redo() { if (this.canRedo) this.position++; return this.value }
}
