import { errorStatus, readBody, roomClient, roomState, send, verifySession } from '../lib/livekit.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' })
  try {
    const body = await readBody(req)
    const control = verifySession(body.control_token, 'control')
    if (!control) return send(res, 403, { error: 'Controle de moderador inválido' })
    const client = roomClient()
    const state = await roomState(control.room)
    if (!state || state.owner !== control.owner) return send(res, 410, { error: 'Esta sala já foi encerrada' })
    if (body.action === 'close') await client.deleteRoom(control.room)
    else if (body.action === 'kick' && body.identity && body.identity !== control.owner) await client.removeParticipant(control.room, String(body.identity).slice(0, 128))
    else if (body.action === 'lock') await client.updateRoomMetadata(control.room, JSON.stringify({ ...state, locked: Boolean(body.locked) }))
    else if (body.action === 'stop-presenter' && body.identity) {
      const identity = String(body.identity).slice(0, 128)
      await client.updateParticipant(control.room, identity, { permission: { canSubscribe: true, canPublish: false, canPublishData: true } })
      await client.updateParticipant(control.room, identity, { permission: { canSubscribe: true, canPublish: true, canPublishData: true } })
    } else return send(res, 400, { error: 'Ação inválida' })
    return send(res, 200, { ok: true })
  } catch (error) {
    return send(res, errorStatus(error), { error: error?.message === 'INVALID_JSON' ? 'Dados da solicitação inválidos' : 'Falha ao moderar a sala' })
  }
}
