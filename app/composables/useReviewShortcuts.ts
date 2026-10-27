import type { ReviewWorkspace } from './useReviewWorkspace'
export function useReviewShortcuts(w: ReviewWorkspace) {
  const excluded = ref(false)
  const updateFocus = (e: FocusEvent) => {
    excluded.value = !!(e.target as HTMLElement | null)?.closest('[data-filter-fields], [data-workspace-picker], [role="dialog"]')
  }
  onMounted(() => document.addEventListener('focusin', updateFocus))
  onBeforeUnmount(() => document.removeEventListener('focusin', updateFocus))
  const shortcut = (fn: () => unknown) => ({ usingInput: true, handler: () => { fn() } })
  // Omit shortcuts before Nuxt UI handles keydown: the composable prevents default
  // before invoking handlers, so checking focus inside a handler would be too late.
  defineShortcuts(computed(() => excluded.value ? {} : {
    meta_s: shortcut(() => w.save()),
    meta_z: shortcut(() => w.undo()),
    meta_shift_z: shortcut(() => w.redo()),
    meta_enter: shortcut(() => w.previewFilters()),
    alt_arrowup: shortcut(() => w.navigate(-1)),
    alt_arrowdown: shortcut(() => w.navigate(1)),
    meta_shift_g: shortcut(() => w.removeMatches())
  }))
}
