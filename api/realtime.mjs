import { sessionUser, touchPresence } from '../lib/database.mjs'
import { addRealtimeClient, publishRealtime } from '../lib/realtime.mjs'
import { send } from '../lib/livekit.mjs'

const sessionId=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(value=>value.trim().split('=').map(decodeURIComponent)).filter(value=>value.length===2)).screenly_session
export default function realtimeHandler(req,res){const user=sessionUser(sessionId(req));if(!user)return send(res,401,{error:'Sessão expirada'});res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});touchPresence(user.id);const remove=addRealtimeClient(user.id,res),presenceTimer=setInterval(()=>touchPresence(user.id),30_000);presenceTimer.unref();publishRealtime('presence',{userId:user.id});req.on('close',()=>{clearInterval(presenceTimer);remove();publishRealtime('presence',{userId:user.id});const offlineTimer=setTimeout(()=>publishRealtime('presence',{userId:user.id}),71_000);offlineTimer.unref()})}
