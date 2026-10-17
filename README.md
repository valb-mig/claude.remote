<img src="web/public/pwa-192.png" width="96" alt="Logo: notebook com terminal e celular ligados por sinal">

# claude.remote

Painel pessoal para controlar pelo celular as sessões do Claude Code que rodam no PC. O PC executa tudo; o celular é o controle remoto, acessado pela rede Tailscale.

Estado atual: backend e frontend funcionando; o PWA é React + Vite + shadcn/ui. O histórico técnico está em [docs/investigacao-tecnica.md](docs/investigacao-tecnica.md).

## Instalar na sua máquina

O PC fica ligado com o servidor rodando como serviço, e o celular acessa pela sua rede Tailscale. Não há nuvem no meio nem senha: só aparelhos da sua tailnet chegam ao painel. A exceção são as notificações, que passam criptografadas pelo serviço de push do Google (ou da Apple, no iPhone).

### Requisitos

- **Linux com systemd.** O servidor roda como serviço de usuário, e o quadro do computador lê CPU e memória de `/proc`.
- **Node.js 22.18 ou mais novo.** O servidor roda o TypeScript direto, sem etapa de build (testado no 26).
- **pnpm:** `npm install -g pnpm`.
- **Claude Code** instalado e logado: rode `claude` uma vez e faça o login. O painel usa as mesmas credenciais e o mesmo histórico de `~/.claude`.
- **Tailscale** no PC e no celular, logados na mesma conta.

### 1. Baixar e compilar

```sh
git clone https://github.com/valb-mig/claude.remote.git ~/Projects/claude.remote
cd ~/Projects/claude.remote
pnpm install
pnpm build        # gera web/dist, o app que o servidor entrega ao celular
```

O serviço do passo 3 espera o projeto em `~/Projects/claude.remote`. Se clonar em outro lugar, ajuste o `WorkingDirectory` dele.

### 2. Testar à mão

```sh
pnpm --filter server start
curl http://127.0.0.1:7337/api/health      # em outro terminal: deve responder {"ok":true,...}
```

Abrir http://127.0.0.1:7337 no navegador do PC já mostra o painel. Pare com Ctrl+C.

### 3. Deixar rodando como serviço

O arquivo [`deploy/claude-remote.service`](deploy/claude-remote.service) sobe o servidor pelo shell interativo (`zsh -lic`) para herdar o PATH e as variáveis do seu `~/.zshrc`. Assim, o Claude aberto pelo celular enxerga as mesmas ferramentas do terminal (git, node, java…). Antes de instalar, confira o `ExecStart`:

- usa **bash** em vez de zsh? Troque `/usr/bin/zsh -lic` por `/bin/bash -lic`;
- o Node veio do nvm, fnm, mise ou asdf? Troque `/usr/bin/node` só por `node`, que o shell encontra no PATH.

```sh
systemctl --user link ~/Projects/claude.remote/deploy/claude-remote.service
systemctl --user enable --now claude-remote
loginctl enable-linger "$USER"             # sobe no boot, mesmo sem login no PC
systemctl --user status claude-remote
```

Se editar o arquivo depois de instalado, rode `systemctl --user daemon-reload` e reinicie o serviço.

### 4. Publicar na sua tailnet

No [painel de DNS do Tailscale](https://login.tailscale.com/admin/dns), deixe ligados **MagicDNS** e **HTTPS Certificates**. Depois, no PC:

```sh
tailscale serve --bg 7337      # se der "access denied": sudo tailscale set --operator="$USER"
tailscale serve status         # mostra o endereço, algo como https://seu-pc.tail1234.ts.net
```

A configuração do `--bg` sobrevive a reinícios. O servidor só escuta em `127.0.0.1`; o `tailscale serve` é a única porta de entrada, com HTTPS e só para a sua tailnet.

### 5. Instalar no celular

1. Com o Tailscale ligado no celular, abra no Chrome o endereço do passo 4.
2. No menu ⋮, toque em **Instalar app** (ou **Adicionar à tela inicial**). No iPhone, pelo Safari: **Compartilhar → Adicionar à Tela de Início**.
3. Abra o app instalado e, na aba **Computador**, toque em **Ativar notificações** e permita. Toque em **Enviar teste** para conferir.

O painel passa a abrir como um app e avisa quando o Claude precisa de você.

### Quem pode acessar

O servidor confere o login do Tailscale de quem acessa (o `tailscale serve` informa no cabeçalho `Tailscale-User-Login`). Por padrão, só entra o dono do PC na tailnet. Para liberar outra conta, use `ALLOWED_LOGINS`: ela substitui o padrão, então inclua o seu login também.

### Configuração

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `7337` | Porta local; o `tailscale serve` precisa apontar para ela |
| `PROJECT_ROOTS` | `~/Projects` | Pastas onde o celular pode abrir projetos, separadas por `:` |
| `ALLOWED_LOGINS` | o dono do PC | Logins do Tailscale com acesso, separados por `,` |
| `EXTRA_ORIGINS` | (nenhuma) | Origens extras aceitas do navegador, separadas por `,` |
| `UPLOADS_DIR` | `~/.cache/claude-remote/uploads` | Onde ficam os anexos enviados pelo celular |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Configuração e histórico do Claude Code, se você usa outra pasta |

No serviço, defina com `systemctl --user edit claude-remote` e depois `systemctl --user restart claude-remote`:

```ini
[Service]
Environment=PROJECT_ROOTS=%h/Projects:%h/code
```

### Problemas comuns

- **A página não abre no celular:** confira se o Tailscale está ligado nos dois aparelhos e se `tailscale serve status` aponta para a porta 7337.
- **Erro `tailnet_identity_required`:** o celular está em outra conta do Tailscale; ponha os dois logins em `ALLOWED_LOGINS`.
- **Erro `host_not_allowed`:** acesse pelo nome `https://….ts.net`, não pelo IP.
- **Pelo celular, o Claude não acha ferramentas que existem no terminal:** o serviço não carregou o seu shell. Revise o `ExecStart` (passo 3).
- **Logo depois de ligar o PC, só o acesso local funciona:** o serviço pode subir antes do Tailscale; ele tenta de novo a cada 15 s.
- **As notificações não chegam:** use **Enviar teste** na aba Computador. Se aparecer erro, ele vem do serviço de push; se não der erro e nada chegar, libere as notificações do app e tire o Chrome da otimização de bateria nas configurações do Android. Falhas de envio aparecem nos logs como `falha ao enviar notificação`.
- **Qualquer outra coisa:** `journalctl --user -u claude-remote -f` mostra os logs.

### Atualizar

```sh
cd ~/Projects/claude.remote
git pull
pnpm install
pnpm build
systemctl --user restart claude-remote
```

## Usar pelo celular

O que dá para fazer:
- **Sessões (home):** no topo, um quadro com CPU, memória e os limites do plano do Claude (janela de 5 h e semana, com horário de reset). Abaixo, as conversas, nesta ordem: as que precisam de você, as fixadas, as abertas agora e as recentes. A aba mostra um contador das que precisam de você.
- **Nova** (na home) pergunta só onde trabalhar, sem projeto (`~`) ou um projeto, e abre um chat vazio. A primeira mensagem, digitada na própria caixa do chat com modelo, modo, `/`, `@` e anexos, cria a sessão.
- **Projetos:** escolher um diretório do PC para iniciar uma sessão nova.
- **Computador:** detalhes do sistema (carga, swap, processos do Claude e memória deles, tempo ligado), todas as janelas de uso, inclusive por modelo, a conexão, as notificações e o tema.

Notificações, mesmo com o app fechado, depois de ativadas na aba Computador:
- **Sempre:** quando o Claude faz uma pergunta (com as opções), pede aprovação (com o comando ou o arquivo) ou a sessão cai.
- **Quando terminar** (opcional): com o começo da última resposta do Claude.
- **Sessões abertas no PC** (opcional): quando uma sessão do terminal ou do VSCode passa a esperar você, ou termina algo que levou mais de 1 min.
- Cada conversa tem uma notificação só, e a mais nova substitui a anterior. Tocar abre a conversa; abrir a conversa limpa o aviso; a conversa que já está na tela não avisa.
- O aviso chega mesmo com o Tailscale desligado no celular, mas abrir a conversa precisa dele. No Android, vale ligar a **VPN sempre ativa** do Tailscale.

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
- Sem internet, ou com o PC fora de alcance, a mensagem não se perde, como no WhatsApp: aparece com um relógio e **Aguardando conexão** e é enviada sozinha, na ordem, assim que a conexão volta, mesmo que o app tenha sido fechado nesse meio-tempo. Se não der para entregar (por exemplo, a sessão foi aberta no PC), ela fica marcada como **Não enviada**, com **Tentar de novo** e **Descartar**. Um reenvio nunca repete o turno no Claude.
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

## Operação do serviço

```sh
systemctl --user status claude-remote
systemctl --user restart claude-remote     # após mudar o código do servidor
journalctl --user -u claude-remote -f      # logs
tailscale serve status                     # acesso remoto
tailscale serve --https=443 off            # desligar o acesso remoto
```

Se cair, o serviço volta sozinho em ~3 s. As sessões que estavam abertas no painel aparecem como paradas e podem ser retomadas pelo ID.

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
- `lib/outbox.ts`: fila das mensagens ainda não entregues, guardada no IndexedDB e enviada quando a conexão volta.
- `lib/push.ts` e `sw.ts`: inscrição nas notificações e o service worker que as mostra (e guarda o app em cache).
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
| GET | `/api/push/key` | Chave pública VAPID do PC, para o celular se inscrever |
| POST | `/api/push/subscribe` | `{subscription, prefs: {done, pc}}`: inscreve o aparelho ou muda as preferências (guardado em `~/.local/state/claude-remote/push.json`) |
| POST | `/api/push/unsubscribe` | `{endpoint}`: remove o aparelho |
| POST | `/api/push/test` | `{endpoint}`: manda um aviso de teste a esse aparelho |
| WS | `/ws` | `subscribe {sessionId, sinceSeq}` → `snapshot`, `event`, `delta`, `catalog` |
