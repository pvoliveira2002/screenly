import { acceptFriend, findUser, listSocial, removeFriend, requestFriend, sessionUser, touchPresence, updateAvatar } from '../lib/database.mjs'
import { send } from '../lib/livekit.mjs'
import { publishRealtime } from '../lib/realtime.mjs'

const sessionId = req => Object.fromEntries(String(req.headers.cookie||'').split(';').map(value=>value.trim().split('=').map(decodeURIComponent)).filter(value=>value.length===2)).screenly_session
const readSocialBody=async req=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1_500_000)throw new Error('large');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}
export default async function socialHandler(req,res) {
  try {
    const user=sessionUser(sessionId(req)); if(!user)return send(res,401,{error:'Sessão expirada'})
    touchPresence(user.id)
    if(req.method==='GET')return send(res,200,listSocial(user.id))
    if(req.method!=='POST')return send(res,405,{error:'Método não permitido'})
    const body=await readSocialBody(req)
    if(body.action==='request') { const target=findUser(String(body.email||'').trim().toLowerCase(),user.id); if(!target)return send(res,404,{error:'Usuário não encontrado'}); requestFriend(user.id,target.id) }
    else if(body.action==='accept') acceptFriend(user.id,String(body.userId||''))
    else if(body.action==='remove') removeFriend(user.id,String(body.userId||''))
    else if(body.action==='avatar') { const avatar=String(body.avatar||''); if(avatar && (!avatar.startsWith('data:image/')||avatar.length>1_400_000))return send(res,400,{error:'Use uma imagem de até 1 MB'}); updateAvatar(user.id,avatar) }
    else if(body.action!=='heartbeat')return send(res,400,{error:'Ação inválida'})
    publishRealtime(body.action==='heartbeat'?'presence':'social',{userId:user.id});return send(res,200,listSocial(user.id))
  } catch { return send(res,400,{error:'Não foi possível atualizar seus amigos'}) }
}
