import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
// Run against `npm start`. The sample files are read only throughout this capture.
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  await page.goto('http://127.0.0.1:3000')
  await page.getByRole('textbox', { name: 'Workspace directory', exact: true }).fill(resolve('examples/workspace'))
  await page.getByRole('button', { name: 'Open directory', exact: true }).click()
  await page.getByTestId('review-panel').waitFor()
  await page.getByRole('treeitem').filter({ hasText: 'source.txt' }).click()
  await page.getByTestId('review-panel').locator('.line-green').first().waitFor()
  await page.getByTestId('review-panel').locator('.line-yellow').first().waitFor()
  await mkdir('docs/screenshots', { recursive: true })
  await page.screenshot({ path: 'docs/screenshots/desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Source document', exact: true }).click()
  await page.getByTestId('source-panel').waitFor({ state: 'hidden' })
  await page.getByTestId('review-panel').getByLabel('Review text').waitFor()
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true })
} finally { await browser.close() }
