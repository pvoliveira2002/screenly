const clients=new Set()

export function addRealtimeClient(userId,res){const client={userId,res};clients.add(client);res.write(`event: ready\ndata: ${JSON.stringify({connected:true})}\n\n`);return()=>clients.delete(client)}
export function publishRealtime(event,data={}){const payload=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;for(const client of clients)try{client.res.write(payload)}catch{clients.delete(client)}}
export function realtimeClientCount(){return clients.size}

const heartbeat=setInterval(()=>{for(const client of clients)try{client.res.write(': heartbeat\n\n')}catch{clients.delete(client)}},25_000)
heartbeat.unref()
