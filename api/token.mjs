import { config, participantCredentials, readBody, roomState, send, verifyRoomCode } from '../lib/livekit.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' })
  try {
    config()
    const body = await readBody(req)
    const room = verifyRoomCode(body.room)
    const name = String(body.name || '').trim().slice(0, 32)
    if (!room || !name) return send(res, 400, { error: 'Convite inválido ou nome ausente' })
    const state = await roomState(room)
    if (state.locked) return send(res, 423, { error: 'Esta sala foi bloqueada pelo responsável' })
    return send(res, 201, await participantCredentials({ room, name }))
  } catch (error) {
    return send(res, error?.message === 'BODY_TOO_LARGE' ? 413 : 500, { error: error?.message === 'CONFIG_MISSING' ? 'LiveKit não configurado' : 'Não foi possível entrar na sala' })
  }
}
