# Nuxt UI API verification

Checked the current official documentation and installed package declarations on 2026-10-27.
This project uses Nuxt **4.6.3**, Vue **3.5.44**, Nuxt UI **4.12.0**, Tailwind **4.3.x**,
Sass **1.106.1**, and TypeScript **6.0.3**. TypeScript 7.0.2 was tested but current vue-tsc
requires the JS compiler's `typescript/lib/tsc` entry, which TypeScript 7 no longer exports.
6.0.3 is the latest stable compatible TypeScript major, verified by real type checking.
Exact resolved dependencies are recorded in package-lock.json.

## Installation and imports

Followed the [Nuxt UI Nuxt installation](https://ui.nuxt.com/docs/getting-started/installation/nuxt):
register `@nuxt/ui` in `modules`, import `tailwindcss` then `@nuxt/ui` from the CSS entry,
wrap the application in `UApp`. UI v4 registers icon, fonts and color-mode modules itself.
No v2 Tailwind module/configuration is needed. Nuxt auto-imports U-prefixed components
and composables. Public types are named imports from `@nuxt/ui`; TipTap types come from
`@tiptap/core`. Shared application types use Nuxt's `#shared` alias.

Sass is a separate application stylesheet. Tailwind's entry remains plain CSS as required
by Tailwind v4. Fonts are disabled and Lucide icons are packaged locally so runtime uses
no Google Fonts, Iconify CDN, analytics, AI, authentication or external document APIs.

## Verified components

| API | Props and types | Slots and decisions |
| --- | --- | --- |
| [Accordion](https://ui.nuxt.com/docs/components/accordion) / `UAccordion` | `AccordionItem[]`, `items`, `type="multiple"`, `default-value` string array, item `value`, `label`, `icon`, `slot`; `unmountOnHide` controls destruction | `body`/`content` or named slots from each item's `slot`. Both document panels may be open. Individual document containers resize vertically using native CSS; filters use a second accordion. |
| [Sidebar](https://ui.nuxt.com/docs/components/sidebar) / `USidebar` | `SidebarProps`, `v-model:open`, `collapsible`, `mode`, `breakpoint` | `header`, `default`, `footer`, `actions`; responsive mobile slideover. It is a real standalone component in UI 4.12, distinct from `UDashboardSidebar`, which supports dashboard resizing/state integration. |
| [Tree](https://ui.nuxt.com/docs/components/tree) / `UTree` | `TreeItem`, `items`, `v-model`, `get-key`, `virtualize`; each item has `label`, `children`, `icon`, `defaultExpanded` | Item/label/trailing slots customize rendering. Paths provide stable unique keys, not filenames. Select event uses `update:modelValue`; directories expand, only leaf selections load files. The server excludes symlinks. |
| [Editor](https://ui.nuxt.com/docs/components/editor) / `UEditor` | `EditorProps`, `v-model`, `content-type="json"`, `editable`, `starter-kit`, `extensions`, `editor-props`, `parse-options`; JSON uses TipTap `JSONContent` | Default slot exposes `{ editor, handlers }`; exposed `editor` gives access to the TipTap instance. Plain paragraph JSON preserves line order, empty lines, leading/trailing spaces and text syntax. Formatting, images, mentions, input rules and built-in undo are disabled; pasted content is plain text. ProseMirror node decorations add line numbers/colors and word-filter markings. Large files use virtual lines and a native textarea because TipTap does not virtualize document nodes. |
| [EditorToolbar](https://ui.nuxt.com/docs/components/editor-toolbar) / `UEditorToolbar` | `EditorToolbarItem[]` (or grouped arrays), `editor`, `items`, `layout` = `fixed`, `bubble`, `floating`. Items support built-in `kind` or custom button `onClick`, icons, tooltip, disabled state | Must be inside Editor's default slot with its `editor` instance. Fixed toolbar uses application undo/redo, so cleanup and typing share history. Other file/review actions are Nuxt UI buttons in a labeled toolbar. Optional bubble/floating behavior uses TipTap menus; no AI extensions are enabled. |
| [Splitter](https://ui.nuxt.com/docs/components/splitter) / `USplitter` | `SplitterItem[]`, `items`, `orientation="vertical"`, stable `id`. Each item supplies `slot`, `defaultSize`, `minSize`, `maxSize` and optional `collapsible`/`sizeUnit` | Named item slots; all panels specify default sizes for SSR consistency. Parent has a defined height. Only separates the document workspace from the bottom operation journal. Documents themselves use Accordion. |
| [Card](https://ui.nuxt.com/docs/components/card) / `UCard` | `CardProps`, `variant`, `class`, `ui`; current versions also offer title/description props | `header`, `default`, `footer`; used for the functional onboarding card. |
| [defineShortcuts](https://ui.nuxt.com/docs/composables/define-shortcuts) | Auto-imported `defineShortcuts(config, options?)`; config entries are callbacks or `{ handler, usingInput }`; returns cleanup function | `meta` maps to Command on macOS and Control elsewhere. Implemented save, undo, redo, review, previous/next and remove green. `usingInput: true` permits editor shortcuts; handlers preserve native behavior inside filter inputs, directory picker and dialogs. |

## Dependencies and local architecture

UI 4.12 supplies its TipTap 3 core, starter-kit, markdown and menu dependencies; explicit
`@tiptap/core`, `@tiptap/pm`, `@tiptap/vue-3` dependencies support the imports we use.
No second UI toolkit is installed. `@tanstack/vue-virtual` handles large-file line rendering.
SQLite uses Node's built-in `node:sqlite` on the supported Node versions; `iconv-lite` provides
local legacy decoding. Nitro's node-server build is required; this is not a static deployment.

The [Nuxt 4 directory structure](https://nuxt.com/docs/4.x/directory-structure/app) places
pages, components and composables in `app/`, with server APIs at root `server/`.
Nuxt generates application/server/shared TypeScript projects referenced by tsconfig.json.

## Text semantics

Empty full lines match other empty full lines. A zero-length half-prefix is not evidence
of a partial match (so different single-code-point lines remain red). Half-prefixes compare
only at equal code point lengths and exact prefix text; SHA-256 supplements the specified
additive sums. These decisions avoid vacuous/colliding matches and are covered by tests.
