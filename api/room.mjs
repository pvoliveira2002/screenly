import { config, makeRoomCode, participantCredentials, readBody, roomClient, send, signSession } from '../lib/livekit.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' })
  try {
    config()
    const body = await readBody(req)
    const name = String(body.name || '').trim().slice(0, 32)
    if (!name) return send(res, 400, { error: 'Informe seu nome' })
    const room = makeRoomCode()
    const credentials = await participantCredentials({ room, name, role: 'owner' })
    const state = { owner: credentials.identity, locked: false, presenter: '' }
    await roomClient().createRoom({ name: room, emptyTimeout: 600, departureTimeout: 300, maxParticipants: 50, metadata: JSON.stringify(state) })
    return send(res, 201, { ...credentials, room, control_token: signSession({ type: 'control', room, owner: credentials.identity }, 86400) })
  } catch (error) {
    return send(res, error?.message === 'BODY_TOO_LARGE' ? 413 : 500, { error: error?.message === 'CONFIG_MISSING' ? 'LiveKit não configurado' : 'Não foi possível criar a sala' })
  }
}
