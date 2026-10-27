export default defineNuxtConfig({
  compatibilityDate: '2026-10-27',
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css', '~/assets/css/workspace.scss'],
  ui: { fonts: false },
  icon: { provider: 'none', clientBundle: { scan: true }, serverBundle: { collections: ['lucide'] } },
  colorMode: { preference: 'dark', fallback: 'dark' },
  devtools: { enabled: false },
  typescript: { strict: true },
  nitro: { preset: 'node-server', externals: { external: ['node:sqlite'] } },
  app: { head: { title: 'Local Review — Duplicate Editor', meta: [{ name: 'description', content: 'Private, offline document comparison and review.' }] } }
})
