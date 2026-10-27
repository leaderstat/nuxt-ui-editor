import { createHash, randomUUID } from 'node:crypto'
import { realpath, readdir, readFile, stat, lstat, open, rename, unlink, mkdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join, basename, dirname, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import iconv from 'iconv-lite'
import { half, hash, normalize, wordHits, type Filters, type Line } from '../../shared/analysis'

export const digest = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')
export const MAX_BYTES = 20 * 1024 * 1024
const tick = () => new Promise<void>(r => setImmediate(r))
export function decode(bytes: Buffer, override?: string) {
  let encoding = override
  if (!encoding) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le'
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be'
    else {
      try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); encoding = 'utf-8' }
      catch { encoding = 'windows-1251' }
    }
  }
  if (!['utf-8', 'utf-16le', 'utf-16be', 'windows-1251', 'windows-1252'].includes(encoding)) throw new Error('Unsupported encoding')
  return { text: normalize(iconv.decode(bytes, encoding).replace(/^\uFEFF/, '')), encoding }
}
export interface FileNode { label: string; path: string; children?: FileNode[] }
export class Workspace {
  root: string
  db: DatabaseSync
  source = ''
  encodings = new Map<string, string>()
  constructor(root: string, dbFile: string) {
    this.root = root
    this.db = new DatabaseSync(dbFile)
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY,file_path TEXT UNIQUE,file_name TEXT,document_type TEXT,encoding TEXT,file_size INTEGER,content_digest TEXT,modified_at TEXT,indexed_at TEXT);
      CREATE TABLE IF NOT EXISTS document_lines(id INTEGER PRIMARY KEY,document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,line_number INTEGER,content TEXT,hash_full INTEGER,hash_half INTEGER,half_length INTEGER,content_digest TEXT,match_status TEXT);
      CREATE TABLE IF NOT EXISTS review_results(id INTEGER PRIMARY KEY,source_document_id INTEGER,review_document_id INTEGER,total_lines INTEGER,green_lines INTEGER,yellow_lines INTEGER,red_lines INTEGER,removed_lines INTEGER,analyzed_at TEXT);
      CREATE TABLE IF NOT EXISTS word_filters(id INTEGER PRIMARY KEY,word TEXT,enabled INTEGER,match_mode TEXT,case_sensitive INTEGER,created_at TEXT);
      CREATE TABLE IF NOT EXISTS replacement_filters(id INTEGER PRIMARY KEY,search_value TEXT,replace_value TEXT,enabled INTEGER,filter_type TEXT,created_at TEXT);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE IF NOT EXISTS document_versions(id TEXT PRIMARY KEY,document_id INTEGER,content_digest TEXT,file_name TEXT,file_size INTEGER,modified_at TEXT,saved_at TEXT);
      CREATE INDEX IF NOT EXISTS lines_document ON document_lines(document_id);
      CREATE INDEX IF NOT EXISTS lines_hash ON document_lines(hash_full);
      CREATE INDEX IF NOT EXISTS lines_half ON document_lines(hash_half);
      CREATE INDEX IF NOT EXISTS lines_document_hash ON document_lines(document_id,hash_full);
      CREATE INDEX IF NOT EXISTS lines_document_half ON document_lines(document_id,hash_half);`)
  }
  async path(input: string) {
    if (isAbsolute(input) || input.includes('\0') || input.split(/[\\/]/).includes('..')) throw new Error('Path traversal denied')
    const target = resolve(this.root, input)
    const rel = relative(this.root, target)
    if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Path outside workspace')
    let current = this.root
    for (const part of rel.split(sep)) {
      current = join(current, part)
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are not allowed')
    }
    const actual = await realpath(target)
    if (actual !== target) throw new Error('Path changed or symbolic link')
    if (!(await stat(actual)).isFile()) throw new Error('Select a regular text file')
    return actual
  }
  async tree() {
    let count = 0
    const visit = async (dir: string): Promise<FileNode[]> => {
      const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      const nodes: FileNode[] = []
      for (const item of entries) {
        if (item.isSymbolicLink() || item.name.startsWith('.') || item.name === 'node_modules') continue
        if (++count > 20000) throw new Error('Workspace exceeds 20,000 entries; select a smaller directory')
        const path = relative(this.root, join(dir, item.name)).split(sep).join('/')
        if (item.isDirectory()) nodes.push({ label: item.name, path, children: await visit(join(dir, item.name)) })
        else if (item.isFile() && /\.(txt|md|csv|log|text|json)$/i.test(item.name)) nodes.push({ label: item.name, path })
      }
      return nodes
    }
    return visit(this.root)
  }
  async load(path: string, role: 'source' | 'review', encoding?: string, force = false) {
    const actual = await this.path(path)
    if (role === 'review' && !path.startsWith('review/')) throw new Error('Review files must be in review/')
    if (role === 'source' && path.startsWith('review/')) throw new Error('Choose a source outside review/')
    const info = await stat(actual)
    if (info.size > MAX_BYTES) throw new Error('File exceeds the 20 MiB limit')
    const bytes = await readFile(actual)
    if (bytes.length > MAX_BYTES) throw new Error('File exceeds the 20 MiB limit')
    const decoded = decode(bytes, encoding || this.encodings.get(path))
    this.encodings.set(path, decoded.encoding)
    if (decoded.text.includes('\0')) throw new Error('Binary file or incorrect encoding; choose a supported text encoding')
    const contentDigest = digest(decoded.text)
    const existing = this.db.prepare('SELECT * FROM documents WHERE file_path=?').get(path) as { id: number; content_digest: string; encoding: string } | undefined
    const cached = !force && existing?.content_digest === contentDigest && existing?.encoding === decoded.encoding
    if (!cached) {
      this.db.exec('BEGIN IMMEDIATE')
      try {
        this.db.prepare(`INSERT INTO documents(file_path,file_name,document_type,encoding,file_size,content_digest,modified_at,indexed_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(file_path) DO UPDATE SET encoding=excluded.encoding,file_size=excluded.file_size,content_digest=excluded.content_digest,modified_at=excluded.modified_at,indexed_at=excluded.indexed_at`).run(path, basename(path), role, decoded.encoding, bytes.length, contentDigest, info.mtime.toISOString(), new Date().toISOString())
        const row = this.db.prepare('SELECT id FROM documents WHERE file_path=?').get(path) as { id: number }
        this.db.prepare('DELETE FROM document_lines WHERE document_id=?').run(row.id)
        const insert = this.db.prepare('INSERT INTO document_lines(document_id,line_number,content,hash_full,hash_half,half_length,content_digest,match_status) VALUES(?,?,?,?,?,?,?,?)')
        const lines = decoded.text.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const text = lines[i]!, prefix = half(text)
          insert.run(row.id, i + 1, text, hash(text), hash(prefix), Array.from(prefix).length, digest(text), null)
          if (i % 1000 === 999) await tick()
        }
        this.db.exec('COMMIT')
      } catch (e) { this.db.exec('ROLLBACK'); throw e }
    }
    if (role === 'source') this.source = path
    const document = this.db.prepare('SELECT id,indexed_at FROM documents WHERE file_path=?').get(path) as { id: number; indexed_at: string }
    return { ...decoded, path, fullPath: actual, id: document.id, indexedAt: document.indexed_at, cached, diskDigest: digest(bytes), lineCount: decoded.text.split('\n').length }
  }
  async analyze(sourcePath: string, reviewPath: string, text: string, words: Filters['words'], removed = 0, canceled = () => false) {
    if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('Document exceeds 20 MiB')
    const source = await this.load(sourcePath, 'source')
    const review = await this.load(reviewPath, 'review')
    const full = this.db.prepare('SELECT content FROM document_lines WHERE document_id=? AND hash_full=?')
    const partial = this.db.prepare('SELECT content FROM document_lines WHERE document_id=? AND hash_half=? AND half_length=?')
    const results: Line[] = []
    // Query indexed SQLite candidates once per distinct sum/prefix, and cache exact texts.
    const fullCache = new Map<number, Set<string>>()
    const halfCache = new Map<string, Set<string>>()
    for (const [i, line] of normalize(text).split('\n').entries()) {
      const sum = hash(line), prefix = half(line), size = Array.from(prefix).length, key = `${size}:${hash(prefix)}`
      if (!fullCache.has(sum)) fullCache.set(sum, new Set((full.all(source.id, sum) as { content: string }[]).map(r => r.content)))
      let status: Line['status'] = fullCache.get(sum)!.has(line) ? 'green' : 'red'
      if (status !== 'green' && prefix) {
        if (!halfCache.has(key)) halfCache.set(key, new Set((partial.all(source.id, hash(prefix), size) as { content: string }[]).map(r => half(r.content))))
        if (halfCache.get(key)!.has(prefix)) status = 'yellow'
      }
      results.push({ text: line, status, words: wordHits(line, words) })
      if (i % 500 === 499) { await tick(); if (canceled()) throw new Error('Analysis canceled') }
    }
      if (canceled()) throw new Error('Analysis canceled')
    const counts = { green: 0, yellow: 0, red: 0 }
    for (const line of results) counts[line.status]++
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO review_results(source_document_id,review_document_id,total_lines,green_lines,yellow_lines,red_lines,removed_lines,analyzed_at) VALUES(?,?,?,?,?,?,?,?)').run(source.id, review.id, results.length, counts.green, counts.yellow, counts.red, removed, new Date().toISOString())
      const update = this.db.prepare('UPDATE document_lines SET match_status=? WHERE document_id=? AND line_number=?')
      // Persist statuses only when the analysis describes the indexed on-disk revision.
      if (text === review.text) results.forEach((l, i) => update.run(l.status, review.id, i + 1))
      this.db.exec('COMMIT')
    } catch (e) { this.db.exec('ROLLBACK'); throw e }
    return { lines: results, counts, source }
  }
  filters(): Filters {
    const words = (this.db.prepare('SELECT * FROM word_filters ORDER BY id').all() as { word: string; enabled: number; match_mode: 'word' | 'substring'; case_sensitive: number }[]).map(r => ({ word: r.word, enabled: !!r.enabled, mode: r.match_mode, caseSensitive: !!r.case_sensitive }))
    const rules = (this.db.prepare("SELECT * FROM replacement_filters WHERE filter_type='literal' ORDER BY id").all() as { search_value: string; replace_value: string; enabled: number }[]).map(r => ({ search: r.search_value, replacement: r.replace_value, enabled: !!r.enabled }))
    const repeat = this.db.prepare("SELECT value FROM settings WHERE key='repeats'").get() as { value: string } | undefined
    return { words, rules, repeats: repeat ? repeat.value === 'true' : true }
  }
  setFilters(filters: Filters) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.exec('DELETE FROM word_filters; DELETE FROM replacement_filters;')
      const now = new Date().toISOString()
      for (const f of filters.words) this.db.prepare('INSERT INTO word_filters(word,enabled,match_mode,case_sensitive,created_at) VALUES(?,?,?,?,?)').run(f.word, +f.enabled, f.mode, +f.caseSensitive, now)
      for (const f of filters.rules) this.db.prepare('INSERT INTO replacement_filters(search_value,replace_value,enabled,filter_type,created_at) VALUES(?,?,?,?,?)').run(f.search, f.replacement, +f.enabled, 'literal', now)
      this.db.prepare("INSERT INTO settings VALUES('repeats',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(filters.repeats))
      this.db.exec('COMMIT')
    } catch (e) { this.db.exec('ROLLBACK'); throw e }
    return filters
  }
  async save(path: string, text: string, expected: string) {
    if (path === this.source || !path.startsWith('review/')) throw new Error('Source file is read only; save only inside review/')
    if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('Document exceeds 20 MiB')
    const actual = await this.path(path)
    if (digest(await readFile(actual)) !== expected) throw new Error('File changed on disk. Reload before saving to avoid overwriting changes.')
    const info = await stat(actual)
    if (info.nlink > 1) throw new Error('Hard-linked files are read only')
    const temp = join(dirname(actual), `.review-${randomUUID()}.tmp`)
    try {
      const handle = await open(temp, 'wx', info.mode & 0o777)
      try { await handle.writeFile(normalize(text), 'utf-8'); await handle.sync() } finally { await handle.close() }
      await this.path(path)
      if (digest(await readFile(actual)) !== expected) throw new Error('File changed during save')
      await rename(temp, actual)
    } finally { await unlink(temp).catch(() => {}) }
    const doc = await this.load(path, 'review', 'utf-8')
    const modified = (await stat(actual)).mtime.toISOString()
    const version = digest(`${basename(path)}\0${Buffer.byteLength(text)}\0${modified}\0${digest(text)}`)
    this.db.prepare('INSERT OR IGNORE INTO document_versions VALUES(?,?,?,?,?,?,?)').run(version, doc.id, digest(text), basename(path), Buffer.byteLength(text), modified, new Date().toISOString())
    return { ...doc, version }
  }
  progress() {
    return (this.db.prepare('SELECT COUNT(DISTINCT review_document_id) AS count FROM review_results').get() as { count: number }).count
  }
  close() { this.db.close() }
}
export async function createWorkspace(path: string, dataDir = resolve('.data')) {
  if (!isAbsolute(path)) throw new Error('Enter an absolute local directory path')
  const root = await realpath(path)
  if (!(await stat(root)).isDirectory()) throw new Error('Choose a directory')
  await mkdir(dataDir, { recursive: true })
  return new Workspace(root, join(dataDir, `${digest(root)}.sqlite`))
}
