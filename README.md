# Screenly

Sala privada de voz, chat e compartilhamento de tela no navegador.

## Recursos

- Convites com códigos assinados pelo servidor.
- Identidade UUID separada do nome visível.
- Criador da sala com controles de bloqueio, remoção e interrupção de apresentação.
- Uma apresentação por vez, coordenada pelo backend.
- Voz com indicador de quem está falando.
- Painel de voz com microfone, silenciamento, volume e seleção de dispositivos de entrada e saída.
- Volume e silenciamento local por participante.
- Teste de microfone com medidor, push-to-talk e atalhos de teclado.
- Chat em tempo real durante a sessão.
- Compartilhamento simultâneo de tela por vários participantes em uma grade responsiva.
- Destaque e tela cheia individual para cada apresentação.
- PWA instalável e LiveKit carregado somente ao entrar em uma sala.
- Modo econômico com 540p/20 FPS padrão, até três apresentações e estimativa de minutos.
- Aviso de inatividade, encerramento de salas vazias e limite de duração da apresentação.
- Compartilhamento de tela com áudio e três perfis de qualidade.
- Reconexão automática e indicador de qualidade.
- Histórico local das cinco salas recentes.

## Desenvolvimento local

1. Crie um projeto no [LiveKit Cloud](https://cloud.livekit.io/).
2. Copie `.env.example` para `.env` e preencha as credenciais.
3. Execute `npm run dev`.
4. Abra `http://localhost:5173`.

## Validação

- `npm test` executa os testes de segurança e validação.
- `npm run build` valida o TypeScript e gera o bundle de produção.
- `npm ci` instala exatamente as versões registradas no lockfile.

## Publicação na Vercel

Cadastre estas variáveis em **Settings > Environment Variables**:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Configure-as em Production e, se quiser testar deployments temporários, também em Preview. Depois execute `npx vercel --prod`.

## Segurança

O `LIVEKIT_API_SECRET` é usado somente nas Functions e nunca deve receber prefixo `VITE_`. Convites são validados por HMAC e expiram em 24 horas, requisições têm limite de corpo e tokens de participante expiram em duas horas.

## Persistência

Salas recentes ficam no `localStorage` do navegador. Para sincronizar espaços, histórico de chat e preferências entre dispositivos será necessário conectar um banco de dados em uma próxima etapa.
