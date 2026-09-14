# Screenly

Comunidade autohospedada com contas, servidores, canais, chat, arquivos, voz e compartilhamento de tela.

## Recursos

- Contas e sessões persistentes com senhas derivadas por `scrypt`.
- Servidores compartilhados, membros, cargos, canais e convites com validade.
- Chat persistente com respostas, edição, reações, mensagens fixadas e moderação.
- Atualização em tempo real por conexão SSE, sem consultas frequentes ao banco.
- Envio autenticado de imagens e arquivos de até 25 MB.
- Amigos, presença, apelido, status e foto de perfil.
- Voz e compartilhamento de tela pelo LiveKit, carregado sob demanda.
- Interface inspirada no Discord, PWA e controles de áudio por participante.

## Desenvolvimento local

1. Copie `.env.example` para `.env` e preencha as credenciais do LiveKit.
2. Execute `npm ci`.
3. Execute `npm run dev`.
4. Abra `http://localhost:5173`.

## Dados locais

O SQLite fica em `screenly-data/screenly.db` e os anexos em `screenly-data/uploads`. Defina `SCREENLY_DATA_DIR` para mudar a pasta. Todo esse diretório é ignorado pelo Git e deve entrar no backup do servidor.

## Validação

- `npm test` executa os testes do projeto.
- `npm run build` valida o TypeScript e gera o bundle de produção.
- `npm ci` instala as versões registradas no lockfile.

## Publicação

O backend precisa de um processo Node persistente e acesso a disco. A configuração atual não deve ser publicada como função serverless na Vercel, pois o SQLite e os uploads locais não persistem nesse ambiente. Para uso doméstico, execute o servidor no PC de casa e exponha-o por HTTPS com Cloudflare Tunnel.

## Segurança

O `LIVEKIT_API_SECRET` permanece somente no backend e nunca deve usar prefixo `VITE_`. Downloads exigem sessão e participação no servidor, corpos de requisição possuem limites e os tokens do LiveKit expiram.
