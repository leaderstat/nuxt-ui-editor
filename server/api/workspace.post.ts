import { replacements } from '../../shared/analysis'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { createWorkspace, type Workspace } from '../utils/workspace'

const sessions = new Map<string, { workspace: Workspace; used: number }>()
let queue = Promise.resolve()
const filters = z.object({
  words: z.array(z.object({ word: z.string().max(500), enabled: z.boolean(), mode: z.enum(['word', 'substring']), caseSensitive: z.boolean() })).max(1000),
  rules: z.array(z.object({ search: z.string().max(500), replacement: z.string().max(1000), enabled: z.boolean() })).max(1000),
  repeats: z.boolean()
})
const request = z.object({ action: z.enum(['open', 'load', 'analyze', 'save', 'filters', 'preview', 'close']), token: z.string().optional(), root: z.string().max(4096).optional(), path: z.string().max(4096).optional(), role: z.enum(['source', 'review']).optional(), encoding: z.string().optional(), force: z.boolean().optional(), source: z.string().max(4096).optional(), text: z.string().max(20 * 1024 * 1024).optional(), expected: z.string().optional(), filters: filters.optional(), removed: z.number().int().min(0).optional() })
export default defineEventHandler(async event => {
  const host = getRequestHeader(event, 'host') || ''
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) throw createError({ statusCode: 403, statusMessage: 'Local access only' })
  const origin = getRequestHeader(event, 'origin')
  if ((origin && origin !== `http://${host}` && origin !== `https://${host}`) || getRequestHeader(event, 'sec-fetch-site') === 'cross-site') throw createError({ statusCode: 403, statusMessage: 'Cross-origin file access denied' })
  if (!getRequestHeader(event, 'content-type')?.startsWith('application/json')) throw createError({ statusCode: 415, statusMessage: 'JSON required' })
  const parsed = request.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid workspace request' })
  const body = parsed.data
  const operation = queue.then(async () => {
    try {
      for (const [key, session] of sessions) if (Date.now() - session.used > 12 * 60 * 60 * 1000) { session.workspace.close(); sessions.delete(key) }
      if (body.action === 'open') {
        if (sessions.size >= 32) throw new Error('Too many open workspaces; close another workspace first')
        const workspace = await createWorkspace(body.root || '')
        try {
          const tree = await workspace.tree()
          const token = randomBytes(32).toString('hex')
          sessions.set(token, { workspace, used: Date.now() })
          return { token, root: workspace.root, tree, filters: workspace.filters(), processed: workspace.progress() }
        } catch (e) { workspace.close(); throw e }
      }
      const session = sessions.get(body.token || '')
      if (!session) throw new Error('Workspace expired. Open a local directory again.')
      session.used = Date.now()
      const w = session.workspace
      switch (body.action) {
        case 'load': return await w.load(body.path || '', body.role || 'review', body.encoding, body.force)
        case 'analyze': {
          const result = await w.analyze(body.source || '', body.path || '', body.text ?? '', body.filters?.words || w.filters().words, body.removed, () => event.node.res.destroyed)
          return { ...result, processed: w.progress() }
        }
        case 'save': return await w.save(body.path || '', body.text ?? '', body.expected || '')
        case 'preview': {
          const f = body.filters || w.filters()
          return { text: replacements(body.text ?? '', f.rules, f.repeats) }
        }
        case 'filters': return body.filters ? w.setFilters(body.filters) : w.filters()
        case 'close': w.close(); sessions.delete(body.token!); return { closed: true }
      }
    } catch (error) {
      if (process.env.LOCAL_REVIEW_DEBUG === '1') console.error('[local-review]', body.action, error)
      throw createError({ statusCode: 400, statusMessage: 'Workspace operation failed', data: { message: error instanceof Error ? error.message : 'Unknown file error' } })
    }
  })
  queue = operation.then(() => {}, () => {})
  return operation
})
