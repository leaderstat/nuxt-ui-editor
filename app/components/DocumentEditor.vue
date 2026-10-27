<script setup lang="ts">
import { Extension, type JSONContent, type Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { EditorToolbarItem } from '@nuxt/ui'
import type { Line } from '#shared/analysis'

const props = defineProps<{ text: string; lines?: Line[]; readonly?: boolean; label: string; canUndo?: boolean; canRedo?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ change: [text: string]; undo: []; redo: [] }>()
const editorRef = useTemplateRef('editorRef')
const scroll = useTemplateRef('scroll')
const editLarge = ref(false)
const rawLines = computed(() => props.text.split('\n'))
const large = computed(() => rawLines.value.length > 2000 || props.text.length > 150000)
const virtualizer = useVirtualizer(computed(() => ({ count: rawLines.value.length, getScrollElement: () => scroll.value, estimateSize: () => 26, overscan: 15 })))
const model = computed<JSONContent>(() => ({ type: 'doc', content: rawLines.value.map(text => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })) }))
function update(value: JSONContent) {
  // Text-only paragraphs; hard breaks from Shift+Enter remain newlines too.
  const extract = (node: JSONContent): string => node.type === 'text' ? node.text || '' : node.type === 'hardBreak' ? '\n' : (node.content || []).map(extract).join('')
  const valueText = (value.content || []).map(extract).join('\n')
  if (valueText !== props.text) emit('change', valueText)
}
const highlighting = Extension.create({
  name: 'reviewLines',
  addProseMirrorPlugins() {
    return [new Plugin({ props: { decorations(state) {
      let index = 0
      const items: Decoration[] = []
      state.doc.forEach((node, pos) => {
        const line = props.lines?.[index]
        items.push(Decoration.node(pos, pos + node.nodeSize, { class: `review-line ${line ? `line-${line.status}` : ''} ${line?.words.length ? 'word-hit' : ''}`, 'data-line': String(++index), title: line?.words.length ? `Word filters: ${line.words.join(', ')}` : line?.status || '' }))
      })
      return DecorationSet.create(state.doc, items)
    } } })]
  }
})
const plain = {
  blockquote: false as const, bold: false as const, bulletList: false as const, code: false as const,
  codeBlock: false as const, heading: false as const, horizontalRule: false as const, italic: false as const,
  listItem: false as const, listKeymap: false as const, link: false as const, orderedList: false as const,
  strike: false as const, underline: false as const, trailingNode: false as const, undoRedo: false as const
}
const toolbar = computed<EditorToolbarItem[]>(() => [
  { icon: 'i-lucide-undo-2', tooltip: { text: 'Undo (Ctrl/Cmd+Z)' }, 'aria-label': 'Undo', disabled: !props.canUndo || props.disabled, onClick: () => emit('undo') },
  { icon: 'i-lucide-redo-2', tooltip: { text: 'Redo (Ctrl/Cmd+Shift+Z)' }, 'aria-label': 'Redo', disabled: !props.canRedo || props.disabled, onClick: () => emit('redo') }
])
const editorProps = {
  attributes: { 'aria-label': props.label, spellcheck: 'false' },
  handlePaste(view: import('@tiptap/pm/view').EditorView, event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text/plain')
    if (text === undefined) return false
    event.preventDefault()
    const content = text.replace(/\r\n?/g, '\n').split('\n').map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }))
    const editor = editorRef.value?.editor as Editor | undefined
    editor?.commands.insertContent(content)
    return true
  },
  handleDrop: () => true
}
watch(() => [props.disabled, props.readonly, editorRef.value?.editor] as const, ([disabled, readonly, instance]) => {
  const editor = instance as Editor | undefined
  if (editor && !editor.isDestroyed) editor.setEditable(!readonly && !disabled)
}, { immediate: true, flush: 'post' })
watch(() => props.lines, async () => {
  await nextTick()
  const editor = editorRef.value?.editor as Editor | undefined
  if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('reviewHighlight', true))
})
</script>

<template>
  <div class="document-editor" :data-large="large">
    <template v-if="large">
      <div class="large-tools">
        <span>Large file · virtualized line view</span>
        <UButton v-if="!readonly" size="xs" color="neutral" variant="soft" :label="editLarge ? 'Show highlights' : 'Edit text'" @click="editLarge = !editLarge" />
        <UButton v-if="!readonly" aria-label="Undo" icon="i-lucide-undo-2" size="xs" :disabled="!canUndo || disabled" @click="emit('undo')" />
        <UButton v-if="!readonly" aria-label="Redo" icon="i-lucide-redo-2" size="xs" :disabled="!canRedo || disabled" @click="emit('redo')" />
      </div>
      <textarea v-if="editLarge && !readonly" :aria-label="label" :value="text" :disabled="disabled" class="large-input" spellcheck="false" @input="emit('change', ($event.target as HTMLTextAreaElement).value)" />
      <div v-else ref="scroll" class="virtual-scroll" :aria-label="label" role="region" tabindex="0">
        <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
          <div v-for="row in virtualizer.getVirtualItems()" :key="row.index" :class="['virtual-line', lines?.[row.index] ? `line-${lines[row.index]!.status}` : '', lines?.[row.index]?.words.length ? 'word-hit' : '']" :style="{ position: 'absolute', top: 0, transform: `translateY(${row.start}px)`, height: '26px', width: '100%' }" :title="lines?.[row.index]?.words.join(', ')">
            <span class="line-number">{{ row.index + 1 }}</span>{{ rawLines[row.index] || ' ' }}
          </div>
        </div>
      </div>
    </template>
    <ClientOnly v-else>
      <UEditor ref="editorRef" v-slot="{ editor }" :model-value="model" content-type="json" :editable="!readonly && !disabled" :starter-kit="plain" :image="false" :mention="false" :extensions="[highlighting]" :enable-input-rules="false" :enable-paste-rules="false" :parse-options="{ preserveWhitespace: 'full' }" :editor-props="editorProps" @update:model-value="update">
        <UEditorToolbar v-if="!readonly" :editor="editor" :items="toolbar" layout="fixed" class="editor-history" />
      </UEditor>
      <template #fallback><pre>{{ text }}</pre></template>
    </ClientOnly>
  </div>
</template>
