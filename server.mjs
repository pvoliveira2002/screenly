import { createServer } from 'node:http'
import { createServer as createViteServer } from 'vite'
import tokenHandler from './api/token.mjs'
import roomHandler from './api/room.mjs'
import moderateHandler from './api/moderate.mjs'
import presenterHandler from './api/presenter.mjs'
import accountHandler from './api/account.mjs'
import socialHandler from './api/social.mjs'
import communityHandler from './api/community.mjs'
import messagesHandler from './api/messages.mjs'

const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' })
const server = createServer((req, res) => {
  if (req.url === '/api/token' && req.method === 'POST') return tokenHandler(req, res)
  if (req.url === '/api/room' && req.method === 'POST') return roomHandler(req, res)
  if (req.url === '/api/moderate' && req.method === 'POST') return moderateHandler(req, res)
  if (req.url === '/api/presenter' && req.method === 'POST') return presenterHandler(req, res)
  if (req.url?.startsWith('/api/account/')) return accountHandler(req, res)
  if (req.url === '/api/social') return socialHandler(req, res)
  if (req.url === '/api/community') return communityHandler(req, res)
  if (req.url === '/api/messages') return messagesHandler(req, res)
  vite.middlewares(req, res, () => {})
})

server.listen(5173, '0.0.0.0', () => console.log('Screenly em http://localhost:5173'))
