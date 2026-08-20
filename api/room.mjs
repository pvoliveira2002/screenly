import { cleanName, config, errorStatus, makeRoomCode, participantCredentials, readBody, roomClient, send, signSession } from '../lib/livekit.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' })
  try {
    config()
    const body = await readBody(req)
    const name = cleanName(body.name)
    if (!name) return send(res, 400, { error: 'Informe seu nome' })
    const room = makeRoomCode()
    const credentials = await participantCredentials({ room, name, role: 'owner' })
    const state = { owner: credentials.identity, locked: false }
    await roomClient().createRoom({ name: room, emptyTimeout: 600, departureTimeout: 300, maxParticipants: 50, metadata: JSON.stringify(state) })
    return send(res, 201, { ...credentials, room, control_token: signSession({ type: 'control', room, owner: credentials.identity }, 86400) })
  } catch (error) {
    const message = error?.message === 'CONFIG_MISSING' ? 'LiveKit não configurado' : error?.message === 'CONFIG_INVALID_URL' ? 'A URL do LiveKit está inválida' : error?.message === 'INVALID_JSON' ? 'Dados da solicitação inválidos' : 'Não foi possível criar a sala'
    return send(res, errorStatus(error), { error: message })
  }
}
