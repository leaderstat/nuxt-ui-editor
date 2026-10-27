# Issue #1 work plan and acceptance inventory

The starting directory contains documentation and a concept PNG only. Both README files,
all 846 lines of prompts/Start.md, issue #1 and every PR #3 comment/review were inspected.
There are no comments, required sub-issues, existing tests, contributing rules or workflows.
The prepared Linux checkout supersedes the issue's unavailable Windows directory.

1. [x] Verify current official Nuxt UI APIs, select compatible stable dependencies, scaffold Nuxt 4, TS, Sass, npm lockfile.
2. [x] Test first: collision-safe UTF-8 sums and Unicode half-prefixes; shuffled/duplicate/empty lines; filters; encodings; history; bounded large files.
3. [x] Implement local filesystem selection/tree, review ordering, symlink/traversal/source protection and conflict-safe UTF-8 saves.
4. [x] Implement transactional SQLite document/line/results/filter/version storage, digest caching, batched indexing and indexed candidate lookup.
5. [x] Implement reactive composable state, cancellation, navigation/save/discard/cancel, previewed replacements, word marking, undo/redo and shortcuts.
6. [x] Implement responsive Nuxt UI Sidebar/Tree, two resizable Accordion document panels, plain-text Editor/EditorToolbar, colored numbered lines, filter Accordion, vertical Splitter and local operation log.
7. [x] Verify offline runtime, actual browser workflow, mobile layout, large-file virtualization, and capture screenshots. No browser MCP is exposed; use Playwright's local API.
8. [x] Run all unit/integration/browser tests, typecheck and production build sequentially under the memory limit; add CI.
9. [x] Document research, architecture, startup, tests and requirement evidence; retain existing user files.
10. [x] Review final PR diff, sync main, commit atomic steps, push only prepared branch, update PR #3 with screenshots and Fixes #1, verify latest-SHA CI, mark ready and clean worktree.

Architecture: loopback-only Nitro API, per-browser unguessable workspace capability,
local Node SQLite, asynchronous filesystem reads and yielding indexing batches. No document
network requests, cloud, login, AI or remote fonts/icons. Version metadata belongs in SQLite
rather than prepending unrequested text to user documents. File size cap is explicit (20 MiB);
large documents use a virtual numbered classification view and native plain-text editing.


## Requirement evidence

| Requirement | Implementation | Verification |
| --- | --- | --- |
| Issue phases 1–2: inspect and create actual Nuxt/UI/TS/Sass app | `nuxt.config.ts`, `package.json`, lockfile, Nuxt 4 `app/` structure; original concept and prompts retained | Dependency installation, production build, strict typecheck |
| Issue phases 3–4: functional responsive UI and current component APIs | `app/pages/index.vue`, `DocumentEditor.vue`, `ReviewFilters.vue`; official API notes in `NUXT_UI_RESEARCH.md` | Desktop/mobile browser tests and committed screenshots |
| Prompt criteria 1–5: local startup, directory selection, source selection, review tree and first file | Loopback Nitro API, explicit absolute directory, nested deterministic tree, automatic first review; `useReviewWorkspace` | Browser workflow opens real temporary files, source is read only; mobile tree |
| Criteria 6–7: review with full/prefix/unique classification | UTF-8 additive checksum and Unicode half-prefix; indexed SQLite candidates followed by exact content comparison | `analysis.test.ts` and `workspace.test.ts`: reordered lines, duplicates, blanks, Cyrillic, full/half collisions and prefix lengths; browser line colors |
| Criteria 8–9: remove full matches, preserve others, undo | In-memory removal and bounded shared history; separate explicit disk save | Browser deletion/undo/redo verifies disk remains unchanged until save; unit history/classification tests |
| Criterion 10: edit text with reactive analysis | Plain-text UEditor with decorations and app-managed history; debounce and obsolete-request cancellation | Browser exact syntax/spacing/blank-line save; cancellation integration test leaves no partial results |
| Criterion 11: word and replacement filters | Editable enabled/case/mode word rules; ordered literal rules; Unicode repeats switch; preview before applying; SQLite persistence | Unit word/replacement tests cover disabled filters and dot/newline exceptions; browser preview, undo and word marking |
| Criteria 12–13: safe saves and document navigation | UTF-8 atomic temporary-file save, expected disk digest, save/discard/cancel guard, previous/next controls | Browser all guard choices and exact disk contents; integration traversal/symlink/hardlink/source/external-change rejection |
| Criterion 14: work offline | All document operations and SQLite local; bundled icons; system fonts; no accounts or remote processing | Browser blocks every non-loopback request and checks no external request occurred |
| Prompt sections 5, 8–9: encodings, hashes and database | BOM UTF-16 LE/BE, UTF-8, fallback Windows-1251 and explicit overrides; transactional schema/indexes, digest cache, results and version records | Integration encoding, cache reuse/change detection, persisted filters/status/version tests |
| Sections 4, 10, 12, 14, 18: panels, toolbar, journal, shortcuts and style | Multiple document Accordion panels, resizable editors, vertical workspace/journal Splitter, EditorToolbar, `defineShortcuts`, charcoal numbered lines | Browser splitter drag and width regression, keyboard save/history and native filter undo, mobile no overflow; screenshots |
| Sections 13, 15–16: state, performance and file safety | Single reactive composable state, async reads, yielding indexing batches, cached indexed queries, virtual large-file view, capability sessions and origin checks | Bounded 30,000-line algorithm test; 5,000-line SQLite/browser test with <60 rendered lines; API origin/capability tests |
| Versioning prose | SHA-256 revision identity includes name, size, modification time and content, stored in `document_versions` | Save integration test checks version record. Metadata does not alter reviewed text or eagerly write every file. |

The original `screen-editor.png` was inspected as the supplied concept (the prompt calls it
`screen.png`, which does not exist). The Windows path in the issue is unavailable in this
Linux runner; the actual project is the prepared checkout documented in README and the PR.

The test-first algorithm probe failed before implementation; subsequent UI checks exposed
reactive editability and keyboard focus issues, both fixed and covered by the browser suite.
`docs/screenshots/layout-before.png` records the later desktop panel-width defect;
`desktop.png` and `mobile.png` show the corrected rendering. Reproduce screenshots with
`npm run build`, `npm start`, then `node experiments/capture-screenshots.mjs` in another shell.

Local verification: `npm test` (11 unit/integration tests), `npm run typecheck`,
`npm run build`, and `npm run test:e2e` (6 Chromium browser/API tests). The same commands
are required by `.github/workflows/ci.yml`; final CI is checked against the pushed commit.
No release workflow existed; this new private application starts at version 0.1.0.

Finalization: PR #3 has been reviewed and marked ready. Both push and pull-request CI
runs passed for application commit `c3076f4`; the documentation-only completion commit
is also validated by CI before the final report. The branch contains `origin/main`.
