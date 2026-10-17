# claude.remote

Painel pessoal para controlar pelo celular as sessões do Claude Code que rodam no PC. O PC executa tudo; o celular é o controle remoto, acessado pela rede Tailscale.

Estado atual: backend e frontend funcionando; o PWA é React + Vite + shadcn/ui. O histórico técnico está em [docs/investigacao-tecnica.md](docs/investigacao-tecnica.md).

## Usar pelo celular

1. Com o Tailscale conectado no celular, abra **https://arch.tail59085e.ts.net** no Chrome.
2. No menu do Chrome, toque em **Instalar app** (ou **Adicionar à tela inicial**). O painel passa a abrir como um app.

O que dá para fazer:
- **Sessões (home):** no topo, um quadro com CPU, memória e os limites do plano do Claude (janela de 5 h e semana, com horário de reset). Abaixo, as conversas, nesta ordem: as que precisam de você, as fixadas, as abertas agora e as recentes. A aba mostra um contador das que precisam de você.
- **Nova** (na home) pergunta só onde trabalhar, sem projeto (`~`) ou um projeto, e abre um chat vazio. A primeira mensagem, digitada na própria caixa do chat com modelo, modo, `/`, `@` e anexos, cria a sessão.
- **Projetos:** escolher um diretório do PC para iniciar uma sessão nova.
- **Computador:** detalhes do sistema (carga, swap, processos do Claude e memória deles, tempo ligado), todas as janelas de uso, inclusive por modelo, a conexão e o tema.

No chat:
- O menu ⋮ tem **Fixar no topo**, **Renomear**, **Resumo da sessão** e **Apagar conversa**. O título é gravado no próprio Claude Code, então aparece também no `/resume` do terminal e no VSCode. Apagar remove o histórico de vez e é recusado se a conversa estiver aberta no PC.
- Em chats com projeto, o topo mostra a branch e tem dois botões:
  - **☰**: abre a árvore de pastas e arquivos, só para leitura, com o que o git ignora esmaecido. Tocar num arquivo mostra o conteúdo com números de linha, com opções de quebrar linhas e de ver Markdown formatado; imagens aparecem direto e PDFs abrem à parte.
  - **⎇**: mostra a branch, à frente e atrás do upstream e os arquivos alterados, com linhas adicionadas e removidas. Tocar num arquivo mostra o diff colorido.
- A caixa de mensagem segue o formato da extensão do VSCode: o texto em cima e, na mesma caixa, uma linha com:
  - **+**: enviar do celular (câmera, galeria, arquivos) ou adicionar contexto com `@`;
  - **/**: comandos e skills;
  - **anel de contexto**: quanto falta para a compactação automática, com **Compactar agora**;
  - **pílula do modelo**: com o esforço;
  - **modo**: Manual, Editar automaticamente, Plano ou Automático, com o nível de esforço no mesmo menu;
  - **enviar**: muda de cor conforme o modo, e vira **parar** enquanto o Claude trabalha, com o campo vazio. Com texto, a mensagem entra na fila.
- Numa conversa parada, modelo, esforço e modo escolhidos na caixa valem quando ela for retomada.
- Imagens que o Claude devolve (prints, imagens lidas) e as que você envia aparecem como miniatura. Tocar abre em tela cheia, com um botão para abrir o original.

As ações do Claude aparecem num bloco separado das mensagens. As aprovações e as perguntas com opções aparecem como cartões, e o botão de lista no topo abre um resumo da sessão (arquivos alterados, testes, erros e comandos). Use o ditado do Gboard no campo de mensagem à vontade: Enter quebra linha, e o envio é pelo botão.

No campo de mensagem, tanto no chat quanto em "Nova sessão":
- **`/`** no início lista os comandos e skills do projeto: as suas skills e as de plugins primeiro, depois as internas. Comandos que só funcionam como tela no terminal (`/config`, `/mcp`, `/agents`…) ficam de fora.
- **`@`** lista os arquivos e pastas do projeto. Escolher uma pasta continua a navegação dentro dela.
- **📎** anexa arquivos. No Android, o seletor oferece câmera, galeria e arquivos.
  - **Imagens** são reduzidas no celular para até 1568 px e vão direto para o Claude.
  - **Outros arquivos** (até 25 MB) são gravados no PC em `~/.cache/claude-remote/uploads/<sessão>/` e entram na mensagem como `@caminho`. O Claude Code lê qualquer tipo assim, inclusive PDF.
- No PC, colar um print com Ctrl+V também anexa.

## Como funciona

- Cada sessão controlada pelo celular tem um único dono: um processo headless do Claude Code dirigido pelo Agent SDK.
- Sessões abertas no PC aparecem no celular só para leitura. **Assumir** encerra a sessão no PC (apenas se estiver ociosa) e a retoma no painel. **Liberar** devolve a sessão ao terminal (`claude --resume <id>`).
- O estado real das sessões do PC vem de `claude agents --json`.
- Não há tela de login: o servidor escuta só em `127.0.0.1`, e o acesso remoto passa pelo `tailscale serve` com a identidade do dono.

## Serviço (início automático)

O backend roda como serviço systemd de usuário e sobe no boot (o *linger* do usuário já está ativo). O serviço inicia pelo zsh interativo para herdar o ambiente do `~/.zshrc` (PATH, JAVA_HOME, ANDROID_HOME…). Assim, as sessões abertas pelo celular enxergam as mesmas ferramentas do terminal.

```sh
# instalação (já feita)
systemctl --user link ~/Projects/claude.remote/deploy/claude-remote.service
systemctl --user enable --now claude-remote

systemctl --user status claude-remote
systemctl --user restart claude-remote     # após mudar o código
journalctl --user -u claude-remote -f      # logs
```

Se cair, o serviço volta sozinho em ~3 s. As sessões que estavam abertas no painel aparecem como paradas e podem ser retomadas pelo ID.

Variáveis opcionais: `PORT`, `PROJECT_ROOTS` (padrão `~/Projects`, separadas por `:`), `EXTRA_ORIGINS`, `ALLOWED_LOGINS`.

O acesso remoto está ligado e persiste entre reinícios:

```sh
tailscale serve status              # ver
tailscale serve --bg 7337           # ligar
tailscale serve --https=443 off     # desligar
```

## Desenvolvimento

```sh
pnpm install
pnpm build        # gera web/dist, que o backend serve; basta recarregar a página
pnpm dev:web      # Vite em http://localhost:5173 com proxy para o serviço na 7337
pnpm check        # tipos do server e do web
```

O serviço lê o frontend de `web/dist` a cada requisição, então um `pnpm build` não exige reiniciar o serviço. Mudanças no backend exigem `systemctl --user restart claude-remote`. Para rodar o backend em modo dev, pare o serviço antes (`systemctl --user stop claude-remote` e depois `pnpm dev`) ou use outra porta (`PORT=7338 pnpm dev`).

Estrutura do frontend (`web/src`):
- `lib/store.ts`: WebSocket com reconexão automática e retomada pelo último `seq`.
- `lib/api.ts`: cliente REST.
- `pages/`: telas (sessões, projetos, nova sessão, computador, chat).
- `components/chat/`: blocos de atividade, cartões de aprovação e de pergunta, campo de mensagem e resumo.

## Cliente de teste (no lugar do celular)

```sh
cd server
node scripts/poc-client.ts list
node scripts/poc-client.ts new ~/Projects/algum-projeto "sua instrução"
node scripts/poc-client.ts watch <id>            # pede s/N nas aprovações e a opção nas perguntas
node scripts/poc-client.ts send <id> "próxima mensagem"
node scripts/poc-client.ts takeover <id>         # assumir sessão ociosa do terminal
node scripts/poc-client.ts release <id>          # devolver ao terminal
```

## API

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/sessions` | Catálogo: salvas + vivas no PC + do painel, com `owner` e `state` |
| GET | `/api/projects` | Diretórios disponíveis para sessões novas |
| GET | `/api/sessions/:id/history` | Histórico salvo, normalizado |
| POST | `/api/sessions` | Nova sessão `{cwd?, prompt, attachments?, model?, effort?, permissionMode?}`; sem `cwd`, abre em `~` |
| POST | `/api/sessions/:id/open` | Retomar no painel (`409 live_on_pc` se estiver aberta no PC) |
| POST | `/api/sessions/:id/takeover` | Assumir (`409 busy_on_pc` se estiver ocupada) |
| POST | `/api/sessions/:id/release` | Liberar para o terminal |
| POST | `/api/sessions/:id/messages` | Enviar `{text, attachments?: [{name, mediaType, data (base64), thumb?}]}` |
| GET | `/api/commands?cwd=` | Comandos e skills do projeto (cache de 10 min) |
| POST | `/api/sessions/:id/pin` | `{pinned}`: fixa ou desafixa (guardado em `~/.local/state/claude-remote/meta.json`) |
| POST | `/api/sessions/:id/rename` | `{title}`: usa `renameSession` do SDK |
| POST | `/api/sessions/:id/settings` | `{model?, effort?, permissionMode?}` numa sessão aberta no painel |
| GET | `/api/sessions/:id/context` | Tokens usados e limite da compactação automática |
| GET | `/api/models` | Modelos e níveis de esforço (cache de 10 min) |
| POST | `/api/sessions/:id/delete` | Apaga a conversa (`deleteSession` do SDK), os anexos e o "fixado" |
| GET | `/api/tree?cwd=&path=` | Um nível da árvore do projeto (só leitura; nada fora do projeto) |
| GET | `/api/file?cwd=&path=` | Conteúdo para leitura: texto até 1 MB, ou tipo (imagem, PDF, binário) |
| GET | `/api/file/raw?cwd=&path=` | Arquivo original (imagens, PDF), com CSP que bloqueia scripts |
| GET | `/api/git?cwd=` | Branch, upstream e arquivos alterados com +/- (`null` sem git) |
| GET | `/api/git/diff?cwd=&path=` | Diff do arquivo contra o último commit; novo = contra vazio |
| GET | `/api/sessions/:id/images/:key` | Imagem do chat (cache em memória, refeito a partir do histórico) |
| GET | `/api/files?cwd=&q=` | Busca de arquivos do projeto para a menção `@` |
| POST | `/api/sessions/:id/interrupt` | Interromper o turno |
| POST | `/api/sessions/:id/approvals/:requestId` | Aprovar ou negar ferramenta: `{allow, message?, always?}` |
| POST | `/api/sessions/:id/questions/:requestId` | Responder pergunta do Claude: `{answers: {"<pergunta>": "<opção>"}}` ou `{decline: true}` |
| WS | `/ws` | `subscribe {sessionId, sinceSeq}` → `snapshot`, `event`, `delta`, `catalog` |
