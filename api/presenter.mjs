import { errorStatus, readBody, roomState, send, verifySession } from '../lib/livekit.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' })
  try {
    const body = await readBody(req)
    const session = verifySession(body.session_token, 'session')
    if (!session) return send(res, 403, { error: 'Sessão inválida' })
    const state = await roomState(session.room)
    if (!state) return send(res, 410, { error: 'Esta sala já foi encerrada' })
    if (body.action !== 'acquire' && body.action !== 'release') return send(res, 400, { error: 'Ação inválida' })
    return send(res, 200, { ok: true, presenter: session.identity })
  } catch (error) {
    return send(res, errorStatus(error), { error: error?.message === 'INVALID_JSON' ? 'Dados da solicitação inválidos' : 'Falha ao controlar a apresentação' })
  }
}
