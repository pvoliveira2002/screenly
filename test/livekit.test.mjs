import assert from 'node:assert/strict'
import test from 'node:test'

process.env.LIVEKIT_API_KEY = 'test-key'
process.env.LIVEKIT_API_SECRET = 'test-secret-with-enough-entropy'
process.env.LIVEKIT_URL = 'wss://example.livekit.cloud'

const { cleanName, makeRoomCode, readBody, signSession, verifyRoomCode, verifySession } = await import('../lib/livekit.mjs')

test('código de sala assinado é aceito e adulteração é rejeitada', () => {
  const code = makeRoomCode()
  assert.equal(code.length, 25)
  assert.equal(verifyRoomCode(code), code)
  const changed = `${code.slice(0, -1)}${code.endsWith('A') ? 'B' : 'A'}`
  assert.equal(verifyRoomCode(changed), '')
})

test('token de sessão só é aceito para o tipo esperado', () => {
  const token = signSession({ type: 'session', room: 'room', identity: 'person' }, 60)
  assert.equal(verifySession(token, 'session')?.identity, 'person')
  assert.equal(verifySession(token, 'control'), null)
  assert.equal(verifySession(`${token}x`, 'session'), null)
})

test('nome remove caracteres de controle, espaços extras e respeita o limite', () => {
  assert.equal(cleanName('  Paulo\u0000   Victor  '), 'Paulo Victor')
  assert.equal(cleanName('a'.repeat(40)).length, 32)
})

test('corpo inválido recebe erro controlado', async () => {
  const request = {
    headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield Buffer.from('{invalid') },
  }
  await assert.rejects(readBody(request), { message: 'INVALID_JSON' })
})

test('corpo acima do limite é rejeitado', async () => {
  const request = {
    headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield Buffer.alloc(16_385) },
  }
  await assert.rejects(readBody(request), { message: 'BODY_TOO_LARGE' })
})
