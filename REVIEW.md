# Review de QA — tela principal

Data: 14/09/2026

## Resultado

A tela principal está adequada para um beta fechado. Build concluído e 18 testes automatizados aprovados. O QA cobriu código, banco e APIs; não havia navegador automatizado disponível neste ambiente, então interação visual, câmera, microfone e compartilhamento de tela ainda devem ser conferidos manualmente em dois dispositivos.

| Área | Estado | Observação |
|---|---|---|
| Servidores, categorias e canais | Aprovado | Criar, editar, excluir, convite e associação persistem no banco. |
| Chat | Aprovado | Enviar, responder, editar, excluir, reagir e fixar respeitam autoria/permissão. |
| Arquivos | Aprovado | Upload autenticado de até 25 MB; imagens têm prévia e arquivos têm download. |
| Amigos e presença | Aprovado | Solicitação, aceite, remoção, perfil e presença usam persistência e eventos em tempo real. |
| Perfil | Aprovado | Apelido, avatar, status e descrição persistem. |
| Voz e tela | Condicional | Integração e controles existem; dependem do LiveKit e das permissões do navegador. |
| Busca e mensagens fixadas | Aprovado | Busca atua no canal aberto; painel lista mensagens fixadas. |
| PWA | Aprovado | Manifesto e service worker válidos; APIs não entram no cache. |
| Celular | Parcial | Em telas estreitas a lista de canais é ocultada e ainda falta um botão para reabri-la. |

## Correções feitas neste QA

- Os botões de presente e emoji do campo de mensagem agora funcionam.
- O microfone no rodapé entra no primeiro canal de voz disponível.
- Editar e excluir mensagens usa o ID da conta, evitando conflito entre apelidos iguais.
- A ação de fixar aparece somente para quem administra o servidor.
- O seletor de emoji recebeu estilo integrado ao layout atual.

## Melhorias recomendadas

### Prioridade alta

- Criar navegação móvel para abrir servidores e canais.
- Aplicar no servidor as permissões de canais privados; hoje o marcador visual não restringe acesso.
- Adicionar limite de requisições, proteção CSRF, política de sessão e rotina automática de backup antes de expor o app na internet.
- Fazer um teste real de voz e compartilhamento de tela com duas contas e duas redes.

### Prioridade média

- Trocar `prompt` e `confirm` de canais/categorias por diálogos do próprio layout.
- Implementar paginação de mensagens e busca em todo o servidor.
- Permitir atribuição real dos cargos cadastrados e aplicar suas permissões.
- Exibir estado de digitação e confirmação de entrega/erro.
- Enviar arquivos por streaming para reduzir uso de memória no servidor.

### Manutenção

- Dividir `CommunityHub.tsx` e `App.tsx` em componentes menores.
- Adicionar testes E2E com Playwright para cliques, modais, teclado e responsividade.
- Melhorar foco, atalhos de teclado e rótulos acessíveis dos diálogos.
- Separar o LiveKit em mais chunks para eliminar o aviso de bundle acima de 500 kB.

## Veredito

Pode ser usado por um grupo pequeno em ambiente controlado. Antes de acesso público, devem ser resolvidos canais privados, segurança de produção, backups e o teste real do LiveKit.
