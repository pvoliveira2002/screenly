import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createServerInvite, createUser, deleteCommunityMessage, deleteCommunityServer, editCommunityMessage, joinServerInvite, listCommunityMessages, listCommunityServers, sendCommunityMessage, toggleCommunityPin, toggleCommunityReaction, upsertCommunityServer } from '../lib/database.mjs'

test('servidor, membros, permissões e convite são compartilhados entre contas', () => {
  const suffix=crypto.randomUUID().replaceAll('-','')
  const owner=createUser(`owner-${suffix}@test.local`,'senha-segura-owner','Owner')
  const member=createUser(`member-${suffix}@test.local`,'senha-segura-member','Member')
  const server={id:`server-${suffix}`,name:'Servidor compartilhado',description:'Teste',categories:[{id:`cat-${suffix}`,name:'GERAL',channels:[{id:`channel-${suffix}`,name:'geral',type:'text'}]}]}
  const database=new DatabaseSync('screenly-data/screenly.db')
  try {
    upsertCommunityServer(owner.id,server)
    const invite=createServerInvite(owner.id,server.id)
    joinServerInvite(member.id,invite.code)
    const memberServers=listCommunityServers(member.id)
    assert.equal(memberServers.length,1)
    assert.equal(memberServers[0].currentRole,'member')
    assert.equal(memberServers[0].members.length,2)
    assert.throws(()=>upsertCommunityServer(member.id,{...server,name:'Alterado'}),/FORBIDDEN/)
    assert.throws(()=>deleteCommunityServer(member.id,server.id),/FORBIDDEN/)
    deleteCommunityServer(owner.id,server.id)
    assert.equal(listCommunityServers(member.id).length,0)
  } finally { database.prepare('DELETE FROM users WHERE id IN (?,?)').run(owner.id,member.id) }
})

test('chat é compartilhado e respeita autoria e moderação',()=>{
  const suffix=crypto.randomUUID().replaceAll('-',''),owner=createUser(`chat-owner-${suffix}@test.local`,'senha-segura-owner','Owner'),member=createUser(`chat-member-${suffix}@test.local`,'senha-segura-member','Member')
  const channelId=`chat-${suffix}`,server={id:`chat-server-${suffix}`,name:'Chat',description:'',categories:[{id:`chat-cat-${suffix}`,name:'GERAL',channels:[{id:channelId,name:'geral',type:'text'}]}]},database=new DatabaseSync('screenly-data/screenly.db')
  try{
    upsertCommunityServer(owner.id,server);joinServerInvite(member.id,createServerInvite(owner.id,server.id).code)
    sendCommunityMessage(member.id,{id:`msg-${suffix}`,channelId,text:'Olá',time:Date.now()})
    assert.equal(listCommunityMessages(owner.id)[0].text,'Olá')
    assert.throws(()=>editCommunityMessage(owner.id,`msg-${suffix}`,'alterada'),/FORBIDDEN/)
    editCommunityMessage(member.id,`msg-${suffix}`,'Editada')
    toggleCommunityReaction(owner.id,`msg-${suffix}`);toggleCommunityPin(owner.id,`msg-${suffix}`)
    const message=listCommunityMessages(member.id)[0];assert.equal(message.edited,true);assert.equal(message.pinned,true);assert.equal(message.reactions['👍'],1)
    deleteCommunityMessage(owner.id,`msg-${suffix}`);assert.equal(listCommunityMessages(member.id).length,0)
  }finally{database.prepare('DELETE FROM users WHERE id IN (?,?)').run(owner.id,member.id)}
})
