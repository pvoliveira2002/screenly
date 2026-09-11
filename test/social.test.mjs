import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { acceptFriend, createUser, listSocial, requestFriend, sessionProfile, touchPresence, updateAccountProfile, updateAvatar } from '../lib/database.mjs'

test('amizade, presença e avatar são persistidos entre contas', () => {
  const suffix = crypto.randomUUID().replaceAll('-', '')
  const first = createUser(`social-a-${suffix}@test.local`, 'senha-segura-a', 'Social A')
  const second = createUser(`social-b-${suffix}@test.local`, 'senha-segura-b', 'Social B')
  const database = new DatabaseSync('screenly-data/screenly.db')
  try {
    requestFriend(first.id, second.id)
    assert.equal(listSocial(second.id).incoming.length, 1)
    acceptFriend(second.id, first.id)
    touchPresence(first.id)
    updateAvatar(first.id, 'data:image/png;base64,AA==')
    const social = listSocial(second.id)
    assert.equal(social.friends.length, 1)
    assert.equal(social.friends[0].online, true)
    assert.equal(Boolean(social.friends[0].avatar), true)
  } finally {
    database.prepare('DELETE FROM users WHERE id IN (?,?)').run(first.id, second.id)
  }
})

test('apelido e foto do perfil atualizam a identidade da conta',()=>{const suffix=crypto.randomUUID().replaceAll('-',''),user=createUser(`profile-${suffix}@test.local`,'senha-segura-profile','Nome antigo'),database=new DatabaseSync('screenly-data/screenly.db');try{updateAccountProfile(user.id,'Novo apelido','data:image/png;base64,AA==');const profile=sessionProfile(user.id);assert.equal(profile.displayName,'Novo apelido');assert.match(profile.avatar,/data:image\/png/)}finally{database.prepare('DELETE FROM users WHERE id=?').run(user.id)}})
