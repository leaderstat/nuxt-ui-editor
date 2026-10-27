<script setup lang="ts">
import type { ReviewWorkspace } from '../composables/useReviewWorkspace'
const { workspace: w } = defineProps<{ workspace: ReviewWorkspace }>()
const addWords = ref(''), search = ref('')
const visibleWords = computed(() => w.filters.words.map((f, index) => ({ f, index })).filter(({ f }) => f.word.toLowerCase().includes(search.value.toLowerCase())))
function add() {
  for (const word of addWords.value.split(/[,\n;]/).map(w => w.trim()).filter(Boolean)) {
    if (!w.filters.words.some(f => f.word === word)) w.filters.words.push({ word, mode: 'word', caseSensitive: false, enabled: true })
  }
  addWords.value = ''
}
</script>
<template>
  <UAccordion type="multiple" :items="[{ label: 'Word filters', icon: 'i-lucide-text-search', slot: 'words' }, { label: 'Replacement filters', icon: 'i-lucide-replace', slot: 'replacements' }]" class="filters-accordion">
    <template #words>
      <div class="filter-body">
        <p class="muted">Mark matches without removing text. Separate new words with commas.</p>
        <div class="filter-row"><UInput v-model="addWords" aria-label="New filter words" placeholder="Add words, separated by commas" class="grow" @keydown.enter.prevent="add" /><UButton icon="i-lucide-plus" aria-label="Add words" @click="add" /></div>
        <UInput v-model="search" icon="i-lucide-search" aria-label="Search word filters" placeholder="Search filters" />
        <div v-for="{ f, index } in visibleWords" :key="index" class="filter-row">
          <USwitch v-model="f.enabled" :aria-label="`Enable word ${index + 1}`" />
          <UInput v-model="f.word" :aria-label="`Filter word ${index + 1}`" class="grow" />
          <USelect v-model="f.mode" :items="[{ label: 'Whole word', value: 'word' }, { label: 'Substring', value: 'substring' }]" :aria-label="`Word mode ${index + 1}`" />
          <UCheckbox v-model="f.caseSensitive" label="Aa" :aria-label="`Case sensitive ${index + 1}`" />
          <UButton icon="i-lucide-trash-2" :aria-label="`Delete word ${index + 1}`" color="neutral" variant="ghost" @click="w.filters.words.splice(index, 1)" />
        </div>
        <UButton icon="i-lucide-save" label="Save filters" :disabled="!w.root || w.busy" @click="w.persistFilters" />
      </div>
    </template>
    <template #replacements>
      <div class="filter-body">
        <USwitch v-model="w.filters.repeats" label="Collapse repeated characters" description="Unicode aware. Dots and line breaks are preserved. Applied only after preview." />
        <p class="muted">Enabled literal replacements run from top to bottom, then repeated characters are collapsed.</p>
        <div v-for="(f, index) in w.filters.rules" :key="index" class="filter-row">
          <USwitch v-model="f.enabled" :aria-label="`Enable replacement ${index + 1}`" />
          <UInput v-model="f.search" :aria-label="`Find ${index + 1}`" placeholder="Find" class="grow" /><span>→</span>
          <UInput v-model="f.replacement" :aria-label="`Replace ${index + 1}`" placeholder="Replace with" class="grow" />
          <UButton icon="i-lucide-trash-2" :aria-label="`Delete replacement ${index + 1}`" color="neutral" variant="ghost" @click="w.filters.rules.splice(index, 1)" />
        </div>
        <div class="filter-row">
          <UButton color="neutral" variant="soft" icon="i-lucide-plus" label="Add replacement" @click="w.filters.rules.push({ search: '', replacement: '', enabled: true })" />
          <UButton icon="i-lucide-scan-eye" label="Preview changes" :disabled="!w.review || w.busy" @click="w.previewFilters" />
          <UButton color="neutral" variant="soft" icon="i-lucide-save" label="Save filters" :disabled="!w.root || w.busy" @click="w.persistFilters" />
        </div>
      </div>
    </template>
  </UAccordion>
</template>
