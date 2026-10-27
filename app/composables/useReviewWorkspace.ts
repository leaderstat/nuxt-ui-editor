import { defaultFilters, History, removeGreen, type Line, type Filters } from '#shared/analysis'
import type { DocumentData, FileNode } from '#shared/workspace'

export function useReviewWorkspace() {
  const token = ref(''), root = ref(''), tree = ref<FileNode[]>([])
  const source = shallowRef<DocumentData>(), review = shallowRef<DocumentData>()
  const text = ref(''), saved = ref(''), lines = shallowRef<Line[]>([])
  const filters = ref(defaultFilters()), processed = ref(0)
  const busy = ref(false), analyzing = ref(false), error = ref('')
  const log = ref<{ time: string; message: string }[]>([])
  const preview = ref<string>(), previewOpen = ref(false)
  const pending = shallowRef<(() => Promise<void>)>(), dirtyDialog = ref(false)
  const history = shallowRef(new History('')), historyVersion = ref(0)
  let generation = 0, timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined
  const dirty = computed(() => !!review.value && text.value !== saved.value)
  const canUndo = computed(() => { void historyVersion.value; return history.value.canUndo })
  const canRedo = computed(() => { void historyVersion.value; return history.value.canRedo })
  const counts = computed(() => {
    const c = { green: 0, yellow: 0, red: 0 }
    for (const line of lines.value) c[line.status]++
    return c
  })
  const reviewFiles = computed(() => {
    const result: FileNode[] = []
    const visit = (items: FileNode[]) => { for (const f of items) { if (f.children) visit(f.children); else if (f.path.startsWith('review/')) result.push(f) } }
    visit(tree.value)
    return result
  })
  const index = computed(() => reviewFiles.value.findIndex(f => f.path === review.value?.path))
  function record(message: string) {
    log.value = [...log.value.slice(-199), { time: new Date().toLocaleTimeString(), message }]
  }
  function report(e: unknown) {
    const err = e as { data?: { data?: { message?: string }; message?: string }; message?: string }
    error.value = err.data?.data?.message || err.data?.message || err.message || 'Operation failed'
    record(error.value)
  }
  async function rpc<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    return await $fetch<T>('/api/workspace', { method: 'POST', body: { ...body, token: token.value }, signal }) as T
  }
  function invalidate() {
    generation++; clearTimeout(timer); controller?.abort(); analyzing.value = false; lines.value = []
  }
  async function run(fn: () => Promise<void>) {
    if (busy.value) return
    busy.value = true; error.value = ''
    try { await fn() } catch (e) { report(e) } finally { busy.value = false }
  }
  async function guard(fn: () => Promise<void>) {
    if (busy.value) return
    if (dirty.value) { pending.value = fn; dirtyDialog.value = true }
    else await fn()
  }
  async function resolveDirty(choice: 'save' | 'discard' | 'cancel') {
    const fn = pending.value
    if (choice === 'cancel') { dirtyDialog.value = false; pending.value = undefined; return }
    if (choice === 'save' && !(await save())) return
    if (choice === 'discard') { text.value = saved.value; history.value = new History(saved.value); historyVersion.value++ }
    dirtyDialog.value = false; pending.value = undefined
    await fn?.()
  }
  async function loadReview(path: string, encoding?: string) {
    const doc = await rpc<DocumentData>({ action: 'load', path, role: 'review', encoding })
    invalidate(); review.value = doc; text.value = doc.text; saved.value = doc.text
    history.value = new History(doc.text); historyVersion.value++
    record(`Loaded ${path} · ${doc.encoding} · ${doc.cached ? 'cached index' : 'indexed'}`)
    await analyzeNow()
  }
  async function openWorkspace(path: string) {
    await guard(() => run(async () => {
      const result = await rpc<{ token: string; root: string; tree: FileNode[]; filters: Filters; processed: number }>({ action: 'open', root: path })
      if (token.value) await rpc({ action: 'close' })
      invalidate(); token.value = result.token; root.value = result.root; tree.value = result.tree
      filters.value = result.filters; processed.value = result.processed
      source.value = undefined; review.value = undefined; text.value = ''; saved.value = ''
      record(`Opened local workspace ${result.root}`)
      if (reviewFiles.value[0]) await loadReview(reviewFiles.value[0].path)
    }))
  }
  async function selectFile(file: FileNode) {
    if (file.children) return
    await guard(() => run(async () => {
      if (file.path.startsWith('review/')) await loadReview(file.path)
      else {
        invalidate()
        source.value = await rpc<DocumentData>({ action: 'load', path: file.path, role: 'source' })
        record(`Source indexed: ${file.path}`)
        await analyzeNow()
      }
    }))
  }
  async function reload(role: 'source' | 'review', encoding?: string) {
    const doc = role === 'source' ? source.value : review.value
    if (!doc) return
    const operation = () => run(async () => {
      if (role === 'review') await loadReview(doc.path, encoding)
      else {
        invalidate(); source.value = await rpc<DocumentData>({ action: 'load', path: doc.path, role, encoding, force: true })
        record('Source reindexed'); await analyzeNow()
      }
    })
    await guard(operation)
  }
  async function analyzeNow(removed = 0) {
    if (!source.value || !review.value) return
    clearTimeout(timer); controller?.abort()
    const id = ++generation
    const abort = new AbortController(); controller = abort; analyzing.value = true
    const snapshot = text.value
    try {
      const result = await rpc<{ lines: Line[]; counts: Record<string, number>; source: DocumentData; processed: number }>({ action: 'analyze', source: source.value.path, path: review.value.path, text: snapshot, filters: filters.value, removed }, abort.signal)
      if (id !== generation) return
      lines.value = result.lines; source.value = result.source; processed.value = result.processed
      record(`Review: ${result.counts.green} full · ${result.counts.yellow} partial · ${result.counts.red} unique${removed ? ` · ${removed} removed` : ''}`)
    } catch (e) { if (id === generation && !abort.signal.aborted) report(e) }
    finally { if (id === generation) analyzing.value = false }
  }
  function edit(value: string) {
    if (busy.value || value === text.value) return
    history.value.set(value); historyVersion.value++; text.value = value
  }
  function undo() { if (!busy.value && canUndo.value) { text.value = history.value.undo(); historyVersion.value++; record('Undo') } }
  function redo() { if (!busy.value && canRedo.value) { text.value = history.value.redo(); historyVersion.value++; record('Redo') } }
  async function save(): Promise<boolean> {
    if (!review.value || busy.value) return false
    let success = false
    await run(async () => {
      const doc = await rpc<DocumentData>({ action: 'save', path: review.value!.path, text: text.value, expected: review.value!.diskDigest })
      review.value = doc; saved.value = text.value; success = true
      record(`Saved UTF-8 · revision ${doc.version?.slice(0, 12)}`)
    })
    return success
  }
  async function removeMatches() {
    if (busy.value || analyzing.value || !lines.value.length) return
    const count = counts.value.green
    if (!count) return
    edit(removeGreen(lines.value)); record(`Removed ${count} confirmed full lines in editor; disk unchanged`)
    await analyzeNow(count)
  }
  async function previewFilters() {
    if (!review.value) return
    await run(async () => {
      await rpc({ action: 'filters', filters: filters.value })
      preview.value = (await rpc<{ text: string }>({ action: 'preview', text: text.value, filters: filters.value })).text
      previewOpen.value = true
    })
  }
  function applyPreview() {
    if (preview.value === undefined) return
    edit(preview.value); previewOpen.value = false; record('Applied replacement preview in editor')
  }
  async function persistFilters() {
    if (!token.value) return
    await run(async () => { await rpc({ action: 'filters', filters: filters.value }); record('Filters saved locally'); await analyzeNow() })
  }
  async function navigate(direction: number) {
    const file = reviewFiles.value[index.value + direction]
    if (file) await selectFile(file)
  }
  watch(text, () => {
    invalidate()
    timer = setTimeout(() => { void analyzeNow() }, 400)
  }, { flush: 'sync' })
  onMounted(() => {
    const unload = (e: BeforeUnloadEvent) => { if (dirty.value) { e.preventDefault(); e.returnValue = '' } }
    const release = (e: PageTransitionEvent) => {
      if (!e.persisted && token.value) navigator.sendBeacon('/api/workspace', new Blob([JSON.stringify({ action: 'close', token: token.value })], { type: 'application/json' }))
    }
    window.addEventListener('beforeunload', unload)
    window.addEventListener('pagehide', release)
    onBeforeUnmount(() => { window.removeEventListener('beforeunload', unload); window.removeEventListener('pagehide', release) })
  })
  onBeforeUnmount(() => { invalidate(); if (token.value) void rpc({ action: 'close' }).catch(() => {}) })
  return reactive({ root, tree, source, review, text, saved, lines, filters, processed, busy, analyzing, error, log,
    dirty, canUndo, canRedo, counts, reviewFiles, index, preview, previewOpen, dirtyDialog,
    openWorkspace, selectFile, reload, analyzeNow, edit, undo, redo, save, removeMatches, previewFilters, applyPreview,
    persistFilters, navigate, resolveDirty })
}
export type ReviewWorkspace = ReturnType<typeof useReviewWorkspace>
