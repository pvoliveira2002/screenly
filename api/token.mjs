import { cleanName, config, errorStatus, participantCredentials, readBody, roomState, send, verifyRoomCode } from '../lib/livekit.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' })
  try {
    config()
    const body = await readBody(req)
    const room = verifyRoomCode(body.room)
    const name = cleanName(body.name)
    if (!room || !name) return send(res, 400, { error: 'Convite inválido ou nome ausente' })
    const state = await roomState(room)
    if (!state) return send(res, 410, { error: 'Esta sala já foi encerrada' })
    if (state.locked) return send(res, 423, { error: 'Esta sala foi bloqueada pelo responsável' })
    return send(res, 201, await participantCredentials({ room, name }))
  } catch (error) {
    const message = error?.message === 'CONFIG_MISSING' ? 'LiveKit não configurado' : error?.message === 'CONFIG_INVALID_URL' ? 'A URL do LiveKit está inválida' : error?.message === 'INVALID_JSON' ? 'Dados da solicitação inválidos' : 'Não foi possível entrar na sala'
    return send(res, errorStatus(error), { error: message })
  }
}
