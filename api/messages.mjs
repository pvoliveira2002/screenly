import { deleteCommunityMessage, editCommunityMessage, listCommunityMessages, sendCommunityMessage, sessionUser, toggleCommunityPin, toggleCommunityReaction } from '../lib/database.mjs'
import { send } from '../lib/livekit.mjs'
import { publishRealtime } from '../lib/realtime.mjs'
import { unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const sessionId=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(value=>value.trim().split('=').map(decodeURIComponent)).filter(value=>value.length===2)).screenly_session
const readBody=async req=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1_500_000)throw new Error('BODY_TOO_LARGE');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}
export default async function messagesHandler(req,res){
  try{
    const user=sessionUser(sessionId(req));if(!user)return send(res,401,{error:'Sessão expirada'})
    if(req.method==='GET')return send(res,200,{messages:listCommunityMessages(user.id)})
    if(req.method!=='POST')return send(res,405,{error:'Método não permitido'})
    const body=await readBody(req)
    if(body.action==='send')sendCommunityMessage(user.id,body.message||{})
    else if(body.action==='import'){for(const message of (Array.isArray(body.messages)?body.messages.slice(-1000):[]))try{sendCommunityMessage(user.id,message)}catch{}}
    else if(body.action==='edit')editCommunityMessage(user.id,String(body.messageId||''),body.text)
    else if(body.action==='delete'){for(const storageName of deleteCommunityMessage(user.id,String(body.messageId||'')))try{unlinkSync(resolve(process.env.SCREENLY_DATA_DIR||'screenly-data','uploads',storageName))}catch{}}
    else if(body.action==='react')toggleCommunityReaction(user.id,String(body.messageId||''),String(body.emoji||'👍'))
    else if(body.action==='pin')toggleCommunityPin(user.id,String(body.messageId||''))
    else return send(res,400,{error:'Ação inválida'})
    publishRealtime('messages',{action:body.action});return send(res,200,{messages:listCommunityMessages(user.id)})
  }catch(error){if(error?.message==='FORBIDDEN')return send(res,403,{error:'Você não tem permissão para esta ação'});return send(res,error?.message==='BODY_TOO_LARGE'?413:400,{error:'Não foi possível atualizar as mensagens'})}
}
