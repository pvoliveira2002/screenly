import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import crypto from 'node:crypto'

const databasePath = resolve(process.env.SCREENLY_DATA_DIR || 'screenly-data', 'screenly.db')
mkdirSync(dirname(databasePath), { recursive: true })

const database = new DatabaseSync(databasePath)
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_state (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    servers_json TEXT NOT NULL DEFAULT '[]',
    messages_json TEXT NOT NULL DEFAULT '[]',
    profile_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS friendships (
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (requester_id, addressee_id)
  );
  CREATE TABLE IF NOT EXISTS community_servers (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS server_members (
    server_id TEXT NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('owner','member')),
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (server_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS server_roles (
    id TEXT NOT NULL,
    server_id TEXT NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    permissions_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (server_id,id)
  );
  CREATE TABLE IF NOT EXISTS channel_categories (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS community_channels (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES channel_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('text','voice')),
    position INTEGER NOT NULL,
    room_code TEXT,
    topic TEXT,
    muted INTEGER NOT NULL DEFAULT 0,
    private INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS server_invites (
    code TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 25,
    uses INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS server_members_user ON server_members(user_id);
  CREATE INDEX IF NOT EXISTS categories_server ON channel_categories(server_id,position);
  CREATE INDEX IF NOT EXISTS invites_expiry ON server_invites(expires_at);
  CREATE TABLE IF NOT EXISTS community_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    reply_to TEXT REFERENCES community_messages(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    edited_at INTEGER,
    pinned INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    PRIMARY KEY(message_id,user_id,emoji)
  );
  CREATE INDEX IF NOT EXISTS messages_channel_time ON community_messages(channel_id,created_at);
  CREATE TABLE IF NOT EXISTS message_attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    storage_name TEXT NOT NULL UNIQUE
  );
`)
try { database.exec('ALTER TABLE users ADD COLUMN avatar TEXT') } catch {}
try { database.exec('ALTER TABLE users ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0') } catch {}

const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex')
const safeJson = (value, fallback) => { try { return JSON.parse(value) } catch { return fallback } }

export function createUser(email, password, displayName) {
  const id = crypto.randomUUID()
  const salt = crypto.randomBytes(16).toString('hex')
  const now = Date.now()
  database.prepare('INSERT INTO users (id,email,display_name,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)').run(id, email, displayName, hashPassword(password, salt), salt, now)
  database.prepare('INSERT INTO user_state (user_id,updated_at) VALUES (?,?)').run(id, now)
  return { id, email, displayName }
}

export function verifyUser(email, password) {
  const row = database.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!row) return null
  const received = Buffer.from(hashPassword(password, row.password_salt), 'hex')
  const expected = Buffer.from(row.password_hash, 'hex')
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null
  return { id: row.id, email: row.email, displayName: row.display_name }
}

export function createSession(userId) {
  const id = crypto.randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000
  database.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
  database.prepare('INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,?)').run(id, userId, expiresAt)
  return { id, expiresAt }
}

export function deleteSession(id) { if (id) database.prepare('DELETE FROM sessions WHERE id = ?').run(id) }

export function sessionUser(id) {
  if (!id) return null
  const row = database.prepare('SELECT users.id,users.email,users.display_name,users.avatar FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.id=? AND sessions.expires_at>?').get(id, Date.now())
  return row ? { id: row.id, email: row.email, displayName: row.display_name, avatar:row.avatar||'' } : null
}

export function getUserState(userId) {
  const row = database.prepare('SELECT servers_json,messages_json,profile_json FROM user_state WHERE user_id=?').get(userId)
  return { servers: safeJson(row?.servers_json, []), messages: safeJson(row?.messages_json, []), profile: safeJson(row?.profile_json, {}) }
}

export function updateUserState(userId, value) {
  const current = getUserState(userId)
  const servers = Array.isArray(value.servers) ? value.servers : current.servers
  const messages = Array.isArray(value.messages) ? value.messages.slice(-1000) : current.messages
  const profile = value.profile && typeof value.profile === 'object' ? value.profile : current.profile
  database.prepare('INSERT INTO user_state (user_id,servers_json,messages_json,profile_json,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET servers_json=excluded.servers_json,messages_json=excluded.messages_json,profile_json=excluded.profile_json,updated_at=excluded.updated_at').run(userId, JSON.stringify(servers), JSON.stringify(messages), JSON.stringify(profile), Date.now())
  return { servers, messages, profile }
}

export function touchPresence(userId) { database.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(), userId) }
export function updateAvatar(userId, avatar) { database.prepare('UPDATE users SET avatar=? WHERE id=?').run(avatar || null, userId) }
export function updateAccountProfile(userId, displayName, avatar) { database.prepare('UPDATE users SET display_name=?,avatar=? WHERE id=?').run(displayName,avatar||null,userId);return sessionProfile(userId) }
export function sessionProfile(userId){const row=database.prepare('SELECT id,email,display_name,avatar FROM users WHERE id=?').get(userId);return row?{id:row.id,email:row.email,displayName:row.display_name,avatar:row.avatar||''}:null}
export function socialProfile(userId) { const row=database.prepare('SELECT id,email,display_name,avatar,last_seen FROM users WHERE id=?').get(userId); return row ? mapSocialUser(row) : null }
const mapSocialUser = row => ({ id: row.id, email: row.email, displayName: row.display_name, avatar: row.avatar || '', online: Date.now() - Number(row.last_seen || 0) < 70_000 })
export function findUser(email, currentUserId) { const row=database.prepare('SELECT id,email,display_name,avatar,last_seen FROM users WHERE email=? AND id<>?').get(email, currentUserId); return row ? mapSocialUser(row) : null }
export function requestFriend(requesterId, addresseeId) { database.prepare("INSERT INTO friendships(requester_id,addressee_id,status,created_at) VALUES (?,?, 'pending',?) ON CONFLICT(requester_id,addressee_id) DO NOTHING").run(requesterId, addresseeId, Date.now()) }
export function acceptFriend(userId, requesterId) { database.prepare("UPDATE friendships SET status='accepted' WHERE requester_id=? AND addressee_id=?").run(requesterId, userId) }
export function removeFriend(userId, otherId) { database.prepare('DELETE FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)').run(userId, otherId, otherId, userId) }
export function listSocial(userId) {
  const friends=database.prepare("SELECT u.id,u.email,u.display_name,u.avatar,u.last_seen FROM friendships f JOIN users u ON u.id=CASE WHEN f.requester_id=?1 THEN f.addressee_id ELSE f.requester_id END WHERE (f.requester_id=?1 OR f.addressee_id=?1) AND f.status='accepted'").all(userId).map(mapSocialUser)
  const incoming=database.prepare("SELECT u.id,u.email,u.display_name,u.avatar,u.last_seen FROM friendships f JOIN users u ON u.id=f.requester_id WHERE f.addressee_id=? AND f.status='pending'").all(userId).map(mapSocialUser)
  const outgoing=database.prepare("SELECT u.id,u.email,u.display_name,u.avatar,u.last_seen FROM friendships f JOIN users u ON u.id=f.addressee_id WHERE f.requester_id=? AND f.status='pending'").all(userId).map(mapSocialUser)
  return { friends, incoming, outgoing, profile: socialProfile(userId) }
}

const defaultRoles = [{ id: 'admin', name: 'Administrador', color: '#58e8b1', permissions: ['manage_server','manage_channels','manage_messages'] }, { id: 'member', name: 'Membro', color: '#9cafaa', permissions: ['view_channels','send_messages','join_voice'] }]
const cleanId = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || crypto.randomUUID()
const memberRows = serverId => database.prepare(`SELECT u.id,u.display_name,u.avatar,u.last_seen,sm.role FROM server_members sm JOIN users u ON u.id=sm.user_id WHERE sm.server_id=? ORDER BY sm.role='owner' DESC,u.display_name`).all(serverId)
const mapMember = row => ({ id: row.id, displayName: row.display_name, avatar: row.avatar || '', role: row.role, online: Date.now() - Number(row.last_seen || 0) < 70_000 })

function hydrateServer(row, currentUserId) {
  const categories = database.prepare('SELECT id,name FROM channel_categories WHERE server_id=? ORDER BY position').all(row.id).map(category => ({ ...category, channels: database.prepare('SELECT id,name,type,room_code,topic,muted,private FROM community_channels WHERE category_id=? ORDER BY position').all(category.id).map(channel => ({ id: channel.id, name: channel.name, type: channel.type, ...(channel.room_code ? { roomCode: channel.room_code } : {}), ...(channel.topic ? { topic: channel.topic } : {}), ...(channel.muted ? { muted: true } : {}), ...(channel.private ? { private: true } : {}) })) }))
  const roles = database.prepare('SELECT id,name,color,permissions_json FROM server_roles WHERE server_id=?').all(row.id).map(role => ({ id: role.id, name: role.name, color: role.color, permissions: safeJson(role.permissions_json, []) }))
  const membership = database.prepare('SELECT role FROM server_members WHERE server_id=? AND user_id=?').get(row.id, currentUserId)
  return { id: row.id, name: row.name, description: row.description, icon: row.icon || undefined, categories, roles, ownerId: row.owner_id, currentRole: membership?.role || 'member', members: memberRows(row.id).map(mapMember) }
}

export function listCommunityServers(userId) {
  return database.prepare('SELECT s.* FROM community_servers s JOIN server_members sm ON sm.server_id=s.id WHERE sm.user_id=? ORDER BY sm.joined_at').all(userId).map(row => hydrateServer(row, userId))
}

function writeServerContents(serverId, server) {
  database.prepare('DELETE FROM server_roles WHERE server_id=?').run(serverId)
  for (const role of (Array.isArray(server.roles) && server.roles.length ? server.roles : defaultRoles)) database.prepare('INSERT INTO server_roles(id,server_id,name,color,permissions_json) VALUES (?,?,?,?,?)').run(cleanId(role.id), serverId, String(role.name || 'Cargo').slice(0,32), String(role.color || '#9cafaa').slice(0,16), JSON.stringify(Array.isArray(role.permissions) ? role.permissions : []))
  for (const [categoryPosition, category] of (Array.isArray(server.categories) ? server.categories : []).entries()) {
    const categoryId = cleanId(category.id)
    database.prepare('INSERT INTO channel_categories(id,server_id,name,position) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position').run(categoryId, serverId, String(category.name || 'CATEGORIA').slice(0,30), categoryPosition)
    const channels=Array.isArray(category.channels)?category.channels:[], keepChannels=new Set()
    for (const [channelPosition, channel] of channels.entries()) { const channelId=cleanId(channel.id);keepChannels.add(channelId);database.prepare('INSERT INTO community_channels(id,category_id,name,type,position,room_code,topic,muted,private) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type,position=excluded.position,room_code=excluded.room_code,topic=excluded.topic,muted=excluded.muted,private=excluded.private').run(channelId, categoryId, String(channel.name || 'canal').slice(0,30), channel.type === 'voice' ? 'voice' : 'text', channelPosition, channel.roomCode || null, String(channel.topic || '').slice(0,100) || null, channel.muted ? 1 : 0, channel.private ? 1 : 0) }
    for(const row of database.prepare('SELECT id FROM community_channels WHERE category_id=?').all(categoryId))if(!keepChannels.has(row.id))database.prepare('DELETE FROM community_channels WHERE id=?').run(row.id)
  }
  const keepCategories=new Set((server.categories||[]).map(category=>cleanId(category.id)))
  for(const row of database.prepare('SELECT id FROM channel_categories WHERE server_id=?').all(serverId))if(!keepCategories.has(row.id))database.prepare('DELETE FROM channel_categories WHERE id=?').run(row.id)
}

export function upsertCommunityServer(userId, server) {
  const id = cleanId(server.id), existing = database.prepare('SELECT owner_id FROM community_servers WHERE id=?').get(id), now = Date.now()
  if (existing && existing.owner_id !== userId) throw new Error('FORBIDDEN')
  database.exec('BEGIN IMMEDIATE')
  try {
    if (!existing) {
      database.prepare('INSERT INTO community_servers(id,owner_id,name,description,icon,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id,userId,String(server.name||'Servidor').slice(0,40),String(server.description||'').slice(0,100),String(server.icon||'').slice(0,8)||null,now,now)
      database.prepare("INSERT INTO server_members(server_id,user_id,role,joined_at) VALUES (?,?,'owner',?)").run(id,userId,now)
    } else database.prepare('UPDATE community_servers SET name=?,description=?,icon=?,updated_at=? WHERE id=?').run(String(server.name||'Servidor').slice(0,40),String(server.description||'').slice(0,100),String(server.icon||'').slice(0,8)||null,now,id)
    writeServerContents(id, server)
    database.exec('COMMIT')
  } catch (error) { database.exec('ROLLBACK'); throw error }
  return hydrateServer(database.prepare('SELECT * FROM community_servers WHERE id=?').get(id), userId)
}

export function deleteCommunityServer(userId, serverId) { const result=database.prepare('DELETE FROM community_servers WHERE id=? AND owner_id=?').run(serverId,userId); if(!result.changes)throw new Error('FORBIDDEN') }
export function createServerInvite(userId, serverId) {
  const member=database.prepare('SELECT role FROM server_members WHERE server_id=? AND user_id=?').get(serverId,userId); if(!member)throw new Error('FORBIDDEN')
  const code=crypto.randomBytes(6).toString('base64url').toUpperCase(), now=Date.now(), expiresAt=now+7*24*60*60*1000
  database.prepare('INSERT INTO server_invites(code,server_id,created_by,expires_at,created_at) VALUES (?,?,?,?,?)').run(code,serverId,userId,expiresAt,now)
  return { code, expiresAt }
}
export function joinServerInvite(userId, code) {
  const invite=database.prepare('SELECT * FROM server_invites WHERE code=? AND expires_at>? AND uses<max_uses').get(String(code||'').toUpperCase(),Date.now()); if(!invite)throw new Error('INVALID_INVITE')
  database.exec('BEGIN IMMEDIATE'); try { const inserted=database.prepare("INSERT OR IGNORE INTO server_members(server_id,user_id,role,joined_at) VALUES (?,?,'member',?)").run(invite.server_id,userId,Date.now()); if(inserted.changes)database.prepare('UPDATE server_invites SET uses=uses+1 WHERE code=?').run(invite.code); database.exec('COMMIT') } catch(error){database.exec('ROLLBACK');throw error}
  return hydrateServer(database.prepare('SELECT * FROM community_servers WHERE id=?').get(invite.server_id),userId)
}

const channelAccess = (userId, channelId) => database.prepare(`SELECT sm.role FROM community_channels c JOIN channel_categories cc ON cc.id=c.category_id JOIN server_members sm ON sm.server_id=cc.server_id WHERE c.id=? AND sm.user_id=?`).get(channelId,userId)
const messageAccess = (userId, messageId) => database.prepare(`SELECT m.author_id,sm.role FROM community_messages m JOIN community_channels c ON c.id=m.channel_id JOIN channel_categories cc ON cc.id=c.category_id JOIN server_members sm ON sm.server_id=cc.server_id WHERE m.id=? AND sm.user_id=?`).get(messageId,userId)
const reactionsFor = messageId => Object.fromEntries(database.prepare('SELECT emoji,COUNT(*) count FROM message_reactions WHERE message_id=? GROUP BY emoji').all(messageId).map(row=>[row.emoji,Number(row.count)]))
const attachmentsFor = messageId => database.prepare('SELECT id,file_name,mime_type,size FROM message_attachments WHERE message_id=?').all(messageId).map(row=>({id:row.id,name:row.file_name,type:row.mime_type,size:Number(row.size),url:`/api/files/${row.id}`}))
const mapCommunityMessage = row => ({ id:row.id,channelId:row.channel_id,authorId:row.author_id,author:row.display_name,avatar:row.avatar||'',text:row.text,time:Number(row.created_at),edited:Boolean(row.edited_at),replyTo:row.reply_to||undefined,pinned:Boolean(row.pinned),reactions:reactionsFor(row.id),attachments:attachmentsFor(row.id) })
export function listCommunityMessages(userId) {
  return database.prepare(`SELECT m.*,u.display_name,u.avatar FROM community_messages m JOIN users u ON u.id=m.author_id JOIN community_channels c ON c.id=m.channel_id JOIN channel_categories cc ON cc.id=c.category_id JOIN server_members sm ON sm.server_id=cc.server_id WHERE sm.user_id=? ORDER BY m.created_at DESC LIMIT 1000`).all(userId).reverse().map(mapCommunityMessage)
}
export function sendCommunityMessage(userId, value) {
  if(!channelAccess(userId,value.channelId))throw new Error('FORBIDDEN')
  const id=cleanId(value.id), text=String(value.text||'').trim().slice(0,1000); if(!text)throw new Error('INVALID_MESSAGE')
  const reply=value.replyTo&&messageAccess(userId,value.replyTo)?value.replyTo:null
  database.prepare('INSERT OR IGNORE INTO community_messages(id,channel_id,author_id,text,reply_to,created_at) VALUES (?,?,?,?,?,?)').run(id,value.channelId,userId,text,reply,Number(value.time)||Date.now())
}
export function sendAttachmentMessage(userId,value,attachment){if(!channelAccess(userId,value.channelId))throw new Error('FORBIDDEN');const id=cleanId(value.id),text=String(value.text||attachment.fileName).trim().slice(0,1000),attachmentId=crypto.randomUUID();database.exec('BEGIN IMMEDIATE');try{database.prepare('INSERT INTO community_messages(id,channel_id,author_id,text,created_at) VALUES (?,?,?,?,?)').run(id,value.channelId,userId,text,Date.now());database.prepare('INSERT INTO message_attachments(id,message_id,file_name,mime_type,size,storage_name) VALUES (?,?,?,?,?,?)').run(attachmentId,id,attachment.fileName,attachment.mimeType,attachment.size,attachment.storageName);database.exec('COMMIT')}catch(error){database.exec('ROLLBACK');throw error}return attachmentId}
export function getAttachment(userId,attachmentId){const row=database.prepare(`SELECT a.* FROM message_attachments a JOIN community_messages m ON m.id=a.message_id JOIN community_channels c ON c.id=m.channel_id JOIN channel_categories cc ON cc.id=c.category_id JOIN server_members sm ON sm.server_id=cc.server_id WHERE a.id=? AND sm.user_id=?`).get(attachmentId,userId);return row?{id:row.id,fileName:row.file_name,mimeType:row.mime_type,size:Number(row.size),storageName:row.storage_name}:null}
export function listAttachmentStorageNames(){return database.prepare('SELECT storage_name FROM message_attachments').all().map(row=>row.storage_name)}
export function editCommunityMessage(userId,messageId,text) { const access=messageAccess(userId,messageId); if(!access||access.author_id!==userId)throw new Error('FORBIDDEN'); const clean=String(text||'').trim().slice(0,1000);if(!clean)throw new Error('INVALID_MESSAGE');database.prepare('UPDATE community_messages SET text=?,edited_at=? WHERE id=?').run(clean,Date.now(),messageId) }
export function deleteCommunityMessage(userId,messageId) { const access=messageAccess(userId,messageId);if(!access||(access.author_id!==userId&&access.role!=='owner'))throw new Error('FORBIDDEN');const storageNames=database.prepare('SELECT storage_name FROM message_attachments WHERE message_id=?').all(messageId).map(row=>row.storage_name);database.prepare('DELETE FROM community_messages WHERE id=?').run(messageId);return storageNames }
export function toggleCommunityReaction(userId,messageId,emoji='👍') { if(!messageAccess(userId,messageId))throw new Error('FORBIDDEN');const exists=database.prepare('SELECT 1 FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?').get(messageId,userId,emoji);if(exists)database.prepare('DELETE FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?').run(messageId,userId,emoji);else database.prepare('INSERT INTO message_reactions(message_id,user_id,emoji) VALUES (?,?,?)').run(messageId,userId,String(emoji).slice(0,8)) }
export function toggleCommunityPin(userId,messageId) { const access=messageAccess(userId,messageId);if(!access||access.role!=='owner')throw new Error('FORBIDDEN');database.prepare('UPDATE community_messages SET pinned=CASE pinned WHEN 1 THEN 0 ELSE 1 END WHERE id=?').run(messageId) }
