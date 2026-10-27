# Local Review — Nuxt UI Editor

A local text-document review editor built with Nuxt 4, Vue 3, TypeScript, Nuxt UI v4,
Sass and SQLite. Compare lines regardless of their order; inspect partial matches,
remove confirmed duplicates, edit and save UTF-8 files. No login or external document API.

## Run locally

Use Node **24.15+**, **22.22.3+**, or **26+** (the ranges in package.json are authoritative).
From the repository root:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Enter an **absolute directory path** in the sidebar and click
**Open directory**. This explicitly selects the server's local workspace; no files are uploaded.
Choose a source file outside `review/` in the tree. The first text file in `review/` loads
automatically. Nested folders are supported; files are sorted deterministically by name.
Supported file extensions: `.txt`, `.text`, `.md`, `.log`, `.csv`, `.json`.

For an example, open the absolute path to `examples/workspace` in this checkout. These are
real editable example files, never automatically loaded into the application.

```sh
npm run build
npm start
```

Production also binds to loopback. Set `PORT` to change the port. `npm run preview` is also
available. Runtime works without internet after dependencies and the app have been built.
No remote fonts or icons are fetched. Keep the checkout and its `.output` build together.

## Review workflow

- Source is read only. Both document panels can collapse independently and resize vertically.
- Green = exact full text match; yellow = exact first-half prefix match of the same Unicode
  code point length; red = unique. Additive UTF-8 sums are candidate keys, always verified
  against text to prevent collisions such as `AB` and `BA`. Blank lines are preserved.
- **Start review** previews enabled literal replacements followed by repeat collapsing
  (on by default, excluding dots and line breaks). Apply or analyze without replacing.
  Word filters mark matching lines/words and never remove text automatically.
- **Remove green** removes every confirmed full line, including shuffled duplicates.
  Yellow/red lines retain their order. Undo/redo covers typing, filters and removal.
- **Save** explicitly writes only the review file, as UTF-8, using a same-directory temporary
  file and rename. Disk changes detected since loading reject the save. Navigation prompts
  to save, discard or keep editing. Closing with unsaved edits triggers the browser prompt.
- Filters support editable enabled rules, whole Unicode words/substrings, case sensitivity,
  multiword addition and list search. Click **Save filters** to persist them in SQLite.
- Review metadata, line indexes, filter rules and version history stay in `.data/` (gitignored).
  Version IDs include filename, size, modification time and SHA-256 content digest. Metadata
  never gets prepended to the user's text. Content digests invalidate stale cached indexes.
- Source/review encoding selectors allow UTF-8, UTF-16 LE/BE and Windows-1251/1252.
  BOM/valid UTF-8 is detected; non-UTF-8 without BOM defaults to Windows-1251 for the Russian
  specification. Legacy encoding detection is inherently ambiguous: select an override when
  needed. Reading never rewrites the source. Internal newlines normalize to LF.

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd+S | Save review |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z | Redo |
| Ctrl/Cmd+Enter | Review with filter preview |
| Alt+↑ / Alt+↓ | Previous / next review file |
| Ctrl/Cmd+Shift+G | Remove green lines |

Filter fields retain native editing shortcuts. The lower journal records local operations,
errors and removal counts; its height is adjustable with the vertical splitter.

## Validation and architecture

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit/integration tests cover the specified hash, encoding, filtering, ordering, undo,
SQLite caching/versioning and filesystem protection scenarios. Playwright runs the production
server and covers offline rendering, real editing, color classification, cleanup/undo/redo,
save, guarded navigation, mobile layout and large-file virtualization. CI runs the same checks.
Use `LOCAL_REVIEW_DEBUG=1` for server tracing; it is disabled by default.

File reads are asynchronous, indexing yields every 1,000 lines and analysis every 500 lines.
SQLite uses prepared indexed queries and transactions. Stale HTTP analyses are canceled and
ignored. A single composable owns document/filter/history state. A 20 MiB file cap and 20,000
workspace-entry cap keep memory bounded. Documents over 2,000 lines or 150,000 characters
use a virtual line view with a plain-text editing switch. Undo retains up to 100 states and
32 MiB of history (plus the current state). This application targets one local user and trusted
local processes; it is not a shared or remotely hosted file service.

Requests enforce loopback hosts, same-origin JSON and unguessable workspace capabilities.
Paths, symlinks, hard links on save, source writes and out-of-workspace saves are rejected.
Do not modify directory/symlink structure concurrently with a save. Cross-process edits of
file content are detected; filesystem rename is atomic but not a general OS locking protocol.

See [verified Nuxt UI APIs](docs/NUXT_UI_RESEARCH.md),
[implementation evidence](docs/IMPLEMENTATION_PLAN.md) and the original requirements in
[Readme.md](Readme.md) and [prompts/Start.md](prompts/Start.md).
