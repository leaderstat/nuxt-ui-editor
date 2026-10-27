<script setup lang="ts">
import type { TreeItem } from '@nuxt/ui'
import type { FileNode } from '#shared/workspace'
const w = useReviewWorkspace()
useReviewShortcuts(w)
const sidebar = ref(true), directory = ref(''), selected = ref<TreeItem>()
const encodingOptions = ['utf-8', 'utf-16le', 'utf-16be', 'windows-1251', 'windows-1252']
const wordResults = computed(() => w.lines.flatMap((line, i) => line.words.length ? [{ number: i + 1, words: line.words }] : []).slice(0, 200))
const panels = [{ label: 'Source document', icon: 'i-lucide-file-lock-2', slot: 'source', value: 'source' }, { label: 'Review document', icon: 'i-lucide-file-pen-line', slot: 'review', value: 'review' }]
const split = [{ slot: 'workspace', defaultSize: 80, minSize: 30, class: 'workspace-panel' }, { slot: 'journal', defaultSize: 20, minSize: 10, class: 'journal-panel' }]
const treeItems = computed(() => {
  const convert = (nodes: FileNode[]): TreeItem[] => nodes.map(n => ({ ...n, icon: n.children ? 'i-lucide-folder' : 'i-lucide-file-text', children: n.children ? convert(n.children) : undefined, class: n.path === w.source?.path ? 'source-file' : n.path === w.review?.path ? 'current-file' : '', defaultExpanded: n.path === 'review' }))
  return convert(w.tree)
})
function select(item?: TreeItem) { if (item && !item.children) void w.selectFile({ label: item.label || '', path: item.path }) }
</script>

<template>
  <div class="app-shell">
    <USidebar v-model:open="sidebar" title="Workspace files" description="Local documents only" :close="true" :ui="{ root: 'workspace-sidebar', body: 'sidebar-body' }">
      <template #header>
        <div class="brand"><UIcon name="i-lucide-files" class="brand-icon" /><div><strong>Local Review</strong><span>DOCUMENT WORKSPACE</span></div></div>
      </template>
      <div data-workspace-picker class="workspace-picker">
        <span class="picker-label">WORKING DIRECTORY</span>
        <UInput v-model="directory" placeholder="Absolute directory path" aria-label="Workspace directory" class="w-full" @keydown.enter="w.openWorkspace(directory)" />
        <UButton icon="i-lucide-folder-open" label="Open directory" :loading="w.busy" class="w-full justify-center" @click="w.openWorkspace(directory)" />
        <p class="muted">Enter a folder on this computer. Place review files inside its <code>review/</code> folder.</p>
      </div>
      <div class="sidebar-section"><span>FILES</span><UBadge color="neutral" variant="soft" size="sm">{{ w.reviewFiles.length }} in review</UBadge></div>
      <UTree v-if="treeItems.length" v-model="selected" :items="treeItems" :get-key="item => item.path" :disabled="w.busy" :virtualize="true" class="file-tree" @update:model-value="select" />
      <p v-else class="empty-files">Open a directory to browse your text files.</p>
      <template #footer>
        <div class="sidebar-footer"><UIcon name="i-lucide-hard-drive" /><span>SQLite · {{ w.processed }} reviewed</span><UBadge color="success" variant="subtle" size="sm">Local only</UBadge></div>
      </template>
    </USidebar>
    <main class="main-shell">
      <header class="app-header">
        <div class="header-title"><UButton icon="i-lucide-panel-left" color="neutral" variant="ghost" aria-label="Toggle files" @click="sidebar = !sidebar" /><div><h1>Document review</h1><p>{{ w.root || 'Your files stay on your computer' }}</p></div></div>
        <UBadge :color="w.dirty ? 'warning' : 'neutral'" variant="subtle">{{ w.dirty ? 'Unsaved changes' : 'Local workspace' }}</UBadge>
      </header>
      <UAlert v-if="w.error" color="error" icon="i-lucide-circle-alert" title="Operation failed" :description="w.error" :close="true" class="error-alert" @update:open="w.error = ''" />
      <USplitter id="review-journal" orientation="vertical" :items="split" class="main-splitter">
        <template #workspace>
          <div class="workspace-content">
            <UCard v-if="!w.root" class="welcome-card">
              <UIcon name="i-lucide-file-search" class="welcome-icon" />
              <h2>A clearer view of every line.</h2>
              <p>Open a local directory, choose a source file, and review the documents in <code>review/</code>. Compare, clean up, and save with confidence.</p>
              <div class="legend"><span class="green-dot">Full match</span><span class="yellow-dot">Matching prefix</span><span class="red-dot">Unique line</span></div>
              <p class="muted">No accounts. No document uploads. Works offline after installation.</p>
            </UCard>
            <UAccordion v-else type="multiple" :default-value="['source', 'review']" :items="panels" class="document-accordion">
              <template #source>
                <div v-if="w.source" class="document-panel" data-testid="source-panel">
                  <div class="document-info"><div><strong>{{ w.source.path }}</strong><p>{{ w.source.fullPath }}</p></div><UBadge color="neutral" variant="soft">Read only</UBadge></div>
                  <div class="document-meta"><span>{{ w.source.lineCount }} lines · {{ w.source.cached ? 'Index cached' : 'Indexed' }} · {{ new Date(w.source.indexedAt).toLocaleTimeString() }}</span><USelect :model-value="w.source.encoding" :items="encodingOptions" aria-label="Source encoding" :disabled="w.busy" @update:model-value="w.reload('source', $event)" /><UButton icon="i-lucide-refresh-cw" aria-label="Reindex source" color="neutral" variant="ghost" :disabled="w.busy" @click="w.reload('source')" /></div>
                  <DocumentEditor :key="w.source.path" :text="w.source.text" readonly label="Source text" />
                </div>
                <div v-else class="panel-empty"><UIcon name="i-lucide-mouse-pointer-2" />Choose a source file outside review/ in the file tree.</div>
              </template>
              <template #review>
                <div v-if="w.review" class="document-panel" data-testid="review-panel">
                  <div class="document-info"><div><strong>{{ w.review.path }}</strong><p>{{ w.review.fullPath }}</p></div><span class="muted">{{ w.index + 1 }} / {{ w.reviewFiles.length }}</span></div>
                  <div class="review-toolbar" role="toolbar" aria-label="Review actions">
                    <UTooltip text="Review with enabled filters (Ctrl/Cmd+Enter)"><UButton icon="i-lucide-scan-text" label="Start review" :loading="w.analyzing" :disabled="!w.source || w.busy" @click="w.previewFilters" /></UTooltip>
                    <UTooltip text="Remove confirmed full matches (Ctrl/Cmd+Shift+G)"><UButton icon="i-lucide-list-minus" label="Remove green" color="neutral" variant="soft" :disabled="!w.counts.green || w.analyzing || w.busy" @click="w.removeMatches" /></UTooltip>
                    <UTooltip text="Save as UTF-8 (Ctrl/Cmd+S)"><UButton icon="i-lucide-save" aria-label="Save document" color="neutral" variant="soft" :disabled="!w.dirty || w.busy" @click="w.save" /></UTooltip>
                    <UTooltip text="Analyze current text without replacements"><UButton icon="i-lucide-refresh-cw" aria-label="Reanalyze" color="neutral" variant="ghost" :disabled="!w.source || w.busy" @click="w.analyzeNow()" /></UTooltip>
                    <div class="toolbar-spacer" />
                    <USelect :model-value="w.review.encoding" :items="encodingOptions" aria-label="Review encoding" :disabled="w.busy" @update:model-value="w.reload('review', $event)" />
                    <UButton icon="i-lucide-arrow-up" aria-label="Previous document" color="neutral" variant="ghost" :disabled="w.index <= 0 || w.busy" @click="w.navigate(-1)" />
                    <UButton icon="i-lucide-arrow-down" aria-label="Next document" color="neutral" variant="ghost" :disabled="w.index >= w.reviewFiles.length - 1 || w.busy" @click="w.navigate(1)" />
                  </div>
                  <DocumentEditor :key="w.review.path" :text="w.text" :lines="w.lines" label="Review text" :can-undo="w.canUndo" :can-redo="w.canRedo" :disabled="w.busy" @change="w.edit" @undo="w.undo" @redo="w.redo" />
                  <div class="review-summary" aria-live="polite"><div class="legend"><span class="green-dot">{{ w.counts.green }} full</span><span class="yellow-dot">{{ w.counts.yellow }} partial</span><span class="red-dot">{{ w.counts.red }} unique</span></div><span>{{ w.analyzing ? 'Analyzing…' : w.lines.length ? 'Review complete' : 'Choose a source to compare' }} · {{ w.text.split('\n').length }} lines</span></div>
                  <div v-if="wordResults.length" class="word-results"><span v-for="line in wordResults" :key="line.number">Line {{ line.number }}: {{ line.words.join(', ') }} · </span><span v-if="wordResults.length === 200">Showing first 200 matching lines.</span></div>
                </div>
                <div v-else class="panel-empty">Add text files to review/ and reopen the directory.</div>
              </template>
            </UAccordion>
            <div v-if="w.root" data-filter-fields><ReviewFilters :workspace="w" /></div>
          </div>
        </template>
        <template #journal>
          <section class="journal" aria-label="Review journal"><header><UIcon name="i-lucide-terminal" /><h2>Review journal</h2><span>ON THIS COMPUTER</span></header><div class="journal-entries" role="log"><p v-if="!w.log.length" class="muted">File operations and analysis results will appear here.</p><p v-for="(entry, i) in [...w.log].reverse()" :key="i"><time>{{ entry.time }}</time><span>{{ entry.message }}</span></p></div></section>
        </template>
      </USplitter>
      <footer class="status-bar"><span><span class="status-dot" />Local processing · UTF-8</span><span>Ctrl/Cmd+S save · Ctrl/Cmd+Enter review</span></footer>
    </main>
    <UModal v-model:open="w.dirtyDialog" title="Unsaved document" description="Save your changes before switching, discard them, or keep editing." :dismissible="false">
      <template #footer><UButton label="Save and continue" :loading="w.busy" @click="w.resolveDirty('save')" /><UButton label="Discard changes" color="error" variant="soft" :disabled="w.busy" @click="w.resolveDirty('discard')" /><UButton label="Keep editing" color="neutral" variant="ghost" @click="w.resolveDirty('cancel')" /></template>
    </UModal>
    <UModal v-model:open="w.previewOpen" title="Review filters preview" description="Replacements change only the editor until you save. Word filters mark lines without removing them." :ui="{ content: 'max-w-3xl' }">
      <template #body><div class="preview-comparison"><div><h3>Current text</h3><pre>{{ w.text.slice(0, 12000) }}</pre></div><div><h3>After enabled filters</h3><pre>{{ w.preview?.slice(0, 12000) }}</pre></div></div><p v-if="w.text.length > 12000 || (w.preview?.length || 0) > 12000" class="muted">Preview displays the first 12,000 characters. Applying affects the complete document.</p></template>
      <template #footer><UButton label="Apply and analyze" icon="i-lucide-check" @click="w.applyPreview(); w.analyzeNow()" /><UButton label="Analyze without replacements" color="neutral" variant="soft" @click="w.previewOpen = false; w.analyzeNow()" /><UButton label="Cancel" color="neutral" variant="ghost" @click="w.previewOpen = false" /></template>
    </UModal>
  </div>
</template>
