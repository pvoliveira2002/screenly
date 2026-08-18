import { readBody, roomClient, roomState, send, verifySession } from '../lib/livekit.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' })
  try {
    const body = await readBody(req)
    const control = verifySession(body.control_token, 'control')
    if (!control) return send(res, 403, { error: 'Controle de moderador inválido' })
    const client = roomClient()
    if (body.action === 'kick' && body.identity && body.identity !== control.owner) await client.removeParticipant(control.room, body.identity)
    else if (body.action === 'lock') {
      const state = await roomState(control.room)
      await client.updateRoomMetadata(control.room, JSON.stringify({ ...state, locked: Boolean(body.locked) }))
    } else if (body.action === 'stop-presenter' && body.identity) {
      await client.updateParticipant(control.room, body.identity, { permission: { canSubscribe: true, canPublish: false, canPublishData: true } })
      await client.updateParticipant(control.room, body.identity, { permission: { canSubscribe: true, canPublish: true, canPublishData: true } })
      const state = await roomState(control.room)
      await client.updateRoomMetadata(control.room, JSON.stringify({ ...state, presenter: '' }))
    } else return send(res, 400, { error: 'Ação inválida' })
    return send(res, 200, { ok: true })
  } catch { return send(res, 500, { error: 'Falha ao moderar a sala' }) }
}
