import { createServerInvite, deleteCommunityServer, joinServerInvite, listCommunityServers, sessionUser, upsertCommunityServer } from '../lib/database.mjs'
import { send } from '../lib/livekit.mjs'
import crypto from 'node:crypto'

const sessionId = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(value => value.trim().split('=').map(decodeURIComponent)).filter(value => value.length === 2)).screenly_session
const readBody = async req => { const chunks=[]; let size=0; for await(const chunk of req){size+=chunk.length;if(size>1_000_000)throw new Error('BODY_TOO_LARGE');chunks.push(chunk)} return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }

export default async function communityHandler(req,res) {
  try {
    const user=sessionUser(sessionId(req)); if(!user)return send(res,401,{error:'Sessão expirada'})
    if(req.method==='GET')return send(res,200,{servers:listCommunityServers(user.id)})
    if(req.method!=='POST')return send(res,405,{error:'Método não permitido'})
    const body=await readBody(req)
    if(body.action==='sync') {
      for(const source of (Array.isArray(body.servers) ? body.servers.slice(0,30) : [])) {
        try { upsertCommunityServer(user.id,source) }
        catch(error) {
          if(error?.message!=='FORBIDDEN')throw error
          const clone={...source,id:crypto.randomUUID(),categories:(source.categories||[]).map(category=>({...category,id:crypto.randomUUID(),channels:(category.channels||[]).map(channel=>({...channel,id:crypto.randomUUID(),roomCode:undefined}))})),roles:(source.roles||[]).map(role=>({...role,id:crypto.randomUUID()}))}
          upsertCommunityServer(user.id,clone)
        }
      }
      return send(res,200,{servers:listCommunityServers(user.id)})
    }
    if(body.action==='delete') { deleteCommunityServer(user.id,String(body.serverId||'')); return send(res,200,{servers:listCommunityServers(user.id)}) }
    if(body.action==='invite') { const invite=createServerInvite(user.id,String(body.serverId||'')); return send(res,201,invite) }
    if(body.action==='join') { const server=joinServerInvite(user.id,String(body.code||'')); return send(res,200,{server,servers:listCommunityServers(user.id)}) }
    return send(res,400,{error:'Ação inválida'})
  } catch(error) {
    const message=error?.message
    if(message==='FORBIDDEN')return send(res,403,{error:'Somente o dono pode alterar este servidor'})
    if(message==='INVALID_INVITE')return send(res,404,{error:'Este convite expirou ou atingiu o limite de usos'})
    return send(res,message==='BODY_TOO_LARGE'?413:400,{error:'Não foi possível atualizar o servidor'})
  }
}
