import crypto from 'node:crypto'
import { createReadStream, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAttachment, listCommunityMessages, sendAttachmentMessage, sessionUser } from '../lib/database.mjs'
import { send } from '../lib/livekit.mjs'
import { publishRealtime } from '../lib/realtime.mjs'

const uploadRoot=resolve(process.env.SCREENLY_DATA_DIR||'screenly-data','uploads')
mkdirSync(uploadRoot,{recursive:true})
const sessionId=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(value=>value.trim().split('=').map(decodeURIComponent)).filter(value=>value.length===2)).screenly_session
const safeName=value=>String(value||'arquivo').replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').trim().slice(0,120)||'arquivo'
const safeMime=value=>String(value||'application/octet-stream').toLowerCase().slice(0,100)

export async function uploadHandler(req,res){
  let storagePath=''
  try{
    const user=sessionUser(sessionId(req));if(!user)return send(res,401,{error:'Sessão expirada'})
    const declared=Number(req.headers['content-length']||0);if(declared>25*1024*1024)return send(res,413,{error:'O arquivo deve ter no máximo 25 MB'})
    const channelId=String(req.headers['x-screenly-channel']||''),fileName=safeName(decodeURIComponent(String(req.headers['x-screenly-name']||'arquivo'))),mimeType=safeMime(req.headers['content-type'])
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>25*1024*1024)throw new Error('BODY_TOO_LARGE');chunks.push(chunk)}if(!size)throw new Error('EMPTY_FILE')
    const storageName=crypto.randomUUID(),messageId=crypto.randomUUID();storagePath=resolve(uploadRoot,storageName);writeFileSync(storagePath,Buffer.concat(chunks))
    try{sendAttachmentMessage(user.id,{id:messageId,channelId,text:fileName},{fileName,mimeType,size,storageName})}catch(error){unlinkSync(storagePath);storagePath='';throw error}
    publishRealtime('messages',{action:'attachment'});return send(res,201,{messages:listCommunityMessages(user.id)})
  }catch(error){if(storagePath)try{unlinkSync(storagePath)}catch{};if(error?.message==='FORBIDDEN')return send(res,403,{error:'Você não pode enviar arquivos neste canal'});return send(res,error?.message==='BODY_TOO_LARGE'?413:400,{error:error?.message==='EMPTY_FILE'?'O arquivo está vazio':'Não foi possível enviar o arquivo'})}
}

export function downloadHandler(req,res){
  const user=sessionUser(sessionId(req));if(!user)return send(res,401,{error:'Sessão expirada'})
  const id=decodeURIComponent(String(req.url||'').split('/').pop()||''),attachment=getAttachment(user.id,id);if(!attachment)return send(res,404,{error:'Arquivo não encontrado'})
  const safeInline=/^image\/(png|jpeg|gif|webp)$/.test(attachment.mimeType)
  res.statusCode=200;res.setHeader('Content-Type',safeInline?attachment.mimeType:'application/octet-stream');res.setHeader('Content-Length',attachment.size);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, max-age=3600');res.setHeader('Content-Disposition',`${safeInline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`)
  createReadStream(resolve(uploadRoot,attachment.storageName)).on('error',()=>{if(!res.headersSent)send(res,404,{error:'Arquivo não encontrado'});else res.destroy()}).pipe(res)
}
