import { readBody, roomClient, roomState, send, verifySession } from '../lib/livekit.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' })
  try {
    const body = await readBody(req)
    const session = verifySession(body.session_token, 'session')
    if (!session) return send(res, 403, { error: 'Sessão inválida' })
    const state = await roomState(session.room)
    if (body.action === 'acquire') {
      if (state.presenter && state.presenter !== session.identity) return send(res, 409, { error: 'Outra pessoa já está apresentando' })
      state.presenter = session.identity
    } else if (body.action === 'release' && state.presenter === session.identity) state.presenter = ''
    else if (body.action !== 'release') return send(res, 400, { error: 'Ação inválida' })
    await roomClient().updateRoomMetadata(session.room, JSON.stringify(state))
    return send(res, 200, { ok: true, presenter: state.presenter })
  } catch { return send(res, 500, { error: 'Falha ao controlar a apresentação' }) }
}
