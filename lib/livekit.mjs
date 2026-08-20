import crypto from 'node:crypto'
import { AccessToken, TrackSource, RoomServiceClient } from 'livekit-server-sdk'

export function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(payload))
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (req.headers?.['content-type'] && !String(req.headers['content-type']).toLowerCase().startsWith('application/json')) {
    throw new Error('UNSUPPORTED_MEDIA_TYPE')
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 16_384) throw new Error('BODY_TOO_LARGE')
    chunks.push(chunk)
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body
  } catch {
    throw new Error('INVALID_JSON')
  }
}

export function cleanName(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ').slice(0, 32)
}

export function errorStatus(error) {
  if (error?.message === 'BODY_TOO_LARGE') return 413
  if (error?.message === 'UNSUPPORTED_MEDIA_TYPE') return 415
  if (error?.message === 'INVALID_JSON') return 400
  return 500
}

export function config() {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) throw new Error('CONFIG_MISSING')
  return { key: LIVEKIT_API_KEY, secret: LIVEKIT_API_SECRET, url: normalizeLiveKitUrl(LIVEKIT_URL) }
}

export function normalizeLiveKitUrl(value) {
  try {
    const url = new URL(String(value).trim())
    if (url.protocol === 'https:') url.protocol = 'wss:'
    else if (url.protocol === 'http:') url.protocol = 'ws:'
    if (!['ws:', 'wss:'].includes(url.protocol) || !url.hostname) throw new Error()
    return url.toString().replace(/\/$/, '')
  } catch {
    throw new Error('CONFIG_INVALID_URL')
  }
}

const sign = value => crypto.createHmac('sha256', config().secret).update(value).digest('base64url')

export function makeRoomCode() {
  const id = crypto.randomBytes(6).toString('base64url').toUpperCase()
  const expires = (Math.floor(Date.now() / 1000) + 86_400).toString(36).toUpperCase().padStart(7, '0')
  const payload = `${id}${expires}`
  return `${payload}${sign(payload).slice(0, 10).toUpperCase()}`
}

export function verifyRoomCode(room) {
  const clean = String(room || '').replace(/[^A-Z0-9_-]/gi, '').toUpperCase()
  if (clean.length !== 25) return ''
  const payload = clean.slice(0, 15)
  const expires = Number.parseInt(clean.slice(8, 15), 36)
  if (!Number.isFinite(expires) || expires < Date.now() / 1000) return ''
  const expected = `${payload}${sign(payload).slice(0, 10).toUpperCase()}`
  return crypto.timingSafeEqual(Buffer.from(clean), Buffer.from(expected)) ? clean : ''
}

export function signSession(payload, ttlSeconds = 7200) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifySession(token, expectedType) {
  try {
    const [body, signature, extra] = String(token || '').split('.')
    if (!body || !signature || extra) return null
    const expected = sign(body)
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!Number.isFinite(payload.exp) || payload.exp < Date.now() / 1000 || payload.type !== expectedType) return null
    return payload
  } catch {
    return null
  }
}

export async function participantCredentials({ room, name, role = 'member' }) {
  const { key, secret, url } = config()
  const identity = crypto.randomUUID()
  const token = new AccessToken(key, secret, { identity, name, ttl: '2h', metadata: JSON.stringify({ role }) })
  token.addGrant({ roomJoin: true, room, roomAdmin: role === 'owner', canSubscribe: true, canPublish: true, canPublishData: true, canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] })
  return { server_url: url, participant_token: await token.toJwt(), identity, role, session_token: signSession({ type: 'session', room, identity, role }) }
}

export function roomClient() {
  const { key, secret, url } = config()
  return new RoomServiceClient(url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), key, secret)
}

export async function roomState(room) {
  const rooms = await roomClient().listRooms([room])
  if (!rooms[0]) return null
  try { return { locked: false, ...JSON.parse(rooms[0].metadata || '{}') } } catch { return { locked: false } }
}
