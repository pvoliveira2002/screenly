import { createSession, createUser, deleteSession, getUserState, sessionUser, updateAccountProfile, updateUserState, verifyUser } from '../lib/database.mjs'
import { readBody, send } from '../lib/livekit.mjs'

const cookieName = 'screenly_session'
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(item => item.trim().split('=').map(decodeURIComponent)).filter(pair => pair.length === 2))
const sessionCookie = (id, maxAge) => `${cookieName}=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
const publicUser = user => ({ id: user.id, email: user.email, displayName: user.displayName, avatar:user.avatar||'' })
const readStateBody = async req => {
  const chunks = []; let size = 0
  for await (const chunk of req) { size += chunk.length; if (size > 2_000_000) throw new Error('BODY_TOO_LARGE'); chunks.push(chunk) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export default async function accountHandler(req, res) {
  try {
    const action = new URL(req.url, 'http://localhost').pathname.split('/').pop()
    const sessionId = cookies(req)[cookieName]
    if (req.method === 'GET' && action === 'session') {
      const user = sessionUser(sessionId)
      return user ? send(res, 200, { user: publicUser(user), state: getUserState(user.id) }) : send(res, 401, { error: 'Faça login para continuar' })
    }
    if (req.method === 'POST' && action === 'logout') {
      deleteSession(sessionId); res.setHeader('Set-Cookie', sessionCookie('', 0)); return send(res, 200, { ok: true })
    }
    if (req.method === 'POST' && (action === 'register' || action === 'login')) {
      const body = await readBody(req)
      const email = String(body.email || '').trim().toLowerCase().slice(0, 254)
      const password = String(body.password || '')
      const displayName = String(body.displayName || '').trim().replace(/\s+/g, ' ').slice(0, 32)
      if (!emailPattern.test(email)) return send(res, 400, { error: 'Informe um e-mail válido' })
      if (password.length < 8 || password.length > 128) return send(res, 400, { error: 'A senha deve ter entre 8 e 128 caracteres' })
      let user
      if (action === 'register') {
        if (!displayName) return send(res, 400, { error: 'Informe seu nome' })
        try { user = createUser(email, password, displayName) } catch (error) { return send(res, 409, { error: String(error).includes('UNIQUE') ? 'Este e-mail já está cadastrado' : 'Não foi possível criar a conta' }) }
      } else {
        user = verifyUser(email, password)
        if (!user) return send(res, 401, { error: 'E-mail ou senha incorretos' })
      }
      const session = createSession(user.id)
      res.setHeader('Set-Cookie', sessionCookie(session.id, Math.floor((session.expiresAt - Date.now()) / 1000)))
      return send(res, action === 'register' ? 201 : 200, { user: publicUser(user), state: getUserState(user.id) })
    }
    if (action === 'state' && req.method === 'PUT') {
      const user = sessionUser(sessionId)
      if (!user) return send(res, 401, { error: 'Sessão expirada' })
      const body = await readStateBody(req)
      return send(res, 200, { state: updateUserState(user.id, body) })
    }
    if(action==='profile'&&req.method==='POST'){
      const user=sessionUser(sessionId);if(!user)return send(res,401,{error:'Sessão expirada'})
      const body=await readStateBody(req),displayName=String(body.displayName||'').trim().replace(/\s+/g,' ').slice(0,32),avatar=String(body.avatar||'')
      if(displayName.length<2)return send(res,400,{error:'O apelido precisa ter pelo menos 2 caracteres'})
      if(avatar&&(!/^data:image\/(png|jpeg|webp);base64,/.test(avatar)||avatar.length>1_400_000))return send(res,400,{error:'Use uma imagem PNG, JPG ou WebP de até 1 MB'})
      const updated=updateAccountProfile(user.id,displayName,avatar),state=updateUserState(user.id,{profile:{...getUserState(user.id).profile,...body,displayName,avatar}})
      return send(res,200,{user:publicUser(updated),state})
    }
    return send(res, 404, { error: 'Rota não encontrada' })
  } catch (error) {
    return send(res, error?.message === 'BODY_TOO_LARGE' ? 413 : 400, { error: 'Solicitação inválida' })
  }
}
