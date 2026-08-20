import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('manifesto PWA identifica o produto como Screenly', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
  assert.equal(manifest.name, 'Screenly')
  assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.icons.length > 0)
})

test('service worker não intercepta APIs', async () => {
  const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(worker, /startsWith\('\/api\/'\)/)
  assert.match(worker, /request\.method !== 'GET'/)
})

test('LiveKit é carregado sob demanda', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /await import\('livekit-client'\)/)
  assert.doesNotMatch(app, /import \{ Room/)
})

test('dependências diretas usam versões reproduzíveis', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  for (const version of [...Object.values(pkg.dependencies), ...Object.values(pkg.devDependencies)]) {
    assert.doesNotMatch(version, /latest|^[~^]/)
  }
})
