<div align="center">

<img src="web/public/pwa-192.png" width="96" alt="Logo: notebook com terminal e celular ligados por sinal">

# claude.remote

</div>

Painel pessoal para controlar pelo celular as sessões do Claude Code que rodam no PC. O PC executa tudo; o celular é o controle remoto, acessado pela rede Tailscale.

Estado atual: backend e frontend funcionando; o PWA é React + Vite + shadcn/ui.

## Instalar na sua máquina

O PC fica ligado com o servidor rodando como serviço, e o celular acessa pela sua rede Tailscale. Não há nuvem no meio nem senha: só aparelhos da sua tailnet chegam ao painel. A exceção são as notificações, que passam criptografadas pelo serviço de push do Google (ou da Apple, no iPhone).

### Requisitos

- **Linux com systemd.** O servidor roda como serviço de usuário, e o quadro do computador lê CPU e memória de `/proc`.
- **Node.js 22.18 ou mais novo.** O servidor roda o TypeScript direto, sem etapa de build (testado no 26).
- **pnpm:** `npm install -g pnpm`.
- **Claude Code** instalado e logado: rode `claude` uma vez e faça o login. O painel usa as mesmas credenciais e o mesmo histórico de `~/.claude`.
- **Tailscale** no PC e no celular, logados na mesma conta.

### Jeito rápido: o instalador

Com os requisitos acima prontos (e o Tailscale com **MagicDNS** e **HTTPS Certificates** ligados no [painel de DNS](https://login.tailscale.com/admin/dns)):

```sh
git clone https://github.com/valb-mig/claude.remote.git ~/Projects/claude.remote
cd ~/Projects/claude.remote
./deploy/install.sh
```

O script compila o app, sobe o serviço systemd (ajustando o caminho, o shell e o Node à sua máquina), publica na tailnet com `tailscale serve` e instala o comando `cr`. No fim, ele imprime o **link de acesso remoto** que o celular vai abrir. Depois, de qualquer terminal:

```sh
cr -link        # mostra o link de acesso remoto da tailnet
```

O instalador é idempotente, então pode rodar de novo sem medo. Se preferir entender cada etapa, siga os passos manuais abaixo.

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

### Várias máquinas

Instale o Claude Remote em outra máquina sua da mesma tailnet (o mesmo login do Tailscale) e ela aparece sozinha no app, em até um minuto: cada servidor pergunta ao Tailscale quais máquinas do dono respondem como Claude Remote. Não há central: o app, instalado a partir de qualquer uma, fala direto com todas, e cada servidor aceita o app vindo de outra máquina sua (só do mesmo dono, nunca de outro endereço). Com uma máquina desligada, as outras seguem funcionando.

As notificações passam pela máquina de onde o app foi instalado: o celular só se inscreve nela, e as outras repassam os avisos para ela. Com ela desligada, os avisos das outras não chegam.

### Configuração

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `7337` | Porta local; o `tailscale serve` precisa apontar para ela |
| `PROJECT_ROOTS` | `~/Projects` | Pastas onde o celular pode abrir projetos, separadas por `:` |
| `ALLOWED_LOGINS` | o dono do PC | Logins do Tailscale com acesso, separados por `,` |
| `EXTRA_ORIGINS` | (nenhuma) | Origens extras aceitas do navegador, separadas por `,` |
| `UPLOADS_DIR` | `~/.cache/claude-remote/uploads` | Onde ficam os anexos enviados pelo celular |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Configuração e histórico do Claude Code, se você usa outra pasta |
| `MACHINE_NAME` | o nome do sistema | Nome desta máquina no app, quando há várias |
| `WHISPER_CLI` | `~/.local/share/claude-remote/whisper/whisper.cpp/build/bin/whisper-cli` | Binário do Whisper para o ditado no Firefox (ver [Ditado no Firefox](#ditado-no-firefox-whisper)) |
| `WHISPER_MODEL` | `~/.local/share/claude-remote/whisper/models/ggml-small-q5_1.bin` | Modelo do Whisper |
| `ACTIVITY_FILE` | `~/.local/share/claude-remote/activity.json` | Resumo do uso por dia, para o Início (sobrevive à limpeza dos registros pelo Claude Code) |
| `WAKATIME_CLI` | `~/.wakatime/wakatime-cli` | Binário do WakaTime, para o seu tempo no painel contar lá (ver [WakaTime](#wakatime)); `WAKATIME=0` desliga |
| `WAKATIME_GOAL_HOURS` | `4` | Quantas horas de hoje enchem o anel do WakaTime na alça do PC |
| `EXTRA_MACHINES` | (nenhuma) | Outras máquinas além das achadas no Tailscale (ex.: uma instância de teste, `http://127.0.0.1:7338`), separadas por `,` |

No serviço, defina com `systemctl --user edit claude-remote` e depois `systemctl --user restart claude-remote`:

```ini
[Service]
Environment=PROJECT_ROOTS=%h/Projects:%h/code
```

### Ditado no Firefox (Whisper)

O ditado do Chrome e do celular usa o reconhecimento de voz do navegador, e o Firefox não tem. Para ditar pelo Firefox, instale o Whisper no PC, que transcreve ali mesmo, sem internet e sem o áudio sair do PC:

```sh
deploy/install-whisper.sh        # compila o whisper.cpp e baixa o modelo small-q5_1 (~190 MB)
```

Precisa de git, cmake e um compilador de C++. O servidor acha o Whisper sozinho, sem reiniciar, e o microfone passa a aparecer no Firefox. O modelo `small-q5_1` vai bem em português e usa uns 400 MB de memória só enquanto transcreve. Com mais memória sobrando, o `large-v3-turbo-q5_0` acerta mais (`deploy/install-whisper.sh large-v3-turbo-q5_0` e `WHISPER_MODEL` apontando para ele).

### WakaTime

Se você usa [WakaTime](https://wakatime.com), o tempo com o Claude pelo painel conta lá, no projeto certo.

São dois lados. O que o **Claude faz** já vem do próprio `wakatime-cli`, que lê os transcritos das conversas (`wakatime-cli --sync-ai-activity`) e manda como *AI Coding*; quem dispara isso costuma ser o plugin do editor, então, com o editor fechado, vale deixar um timer do systemd rodando a cada poucos minutos:

```ini
# ~/.config/systemd/user/wakatime-ai-sync.service
[Service]
Type=oneshot
ExecStart=%h/.wakatime/wakatime-cli --sync-ai-activity
Nice=10
```

```ini
# ~/.config/systemd/user/wakatime-ai-sync.timer
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

Depois: `systemctl --user enable --now wakatime-ai-sync.timer`.

O outro lado é o **seu**: ler a resposta, conferir um diff, escrever a próxima mensagem. Nada disso vira transcrito, e por isso o servidor manda os heartbeats dele mesmo, com as regras dos plugins de editor (um por arquivo a cada dois minutos, no máximo): abrir um arquivo no explorador ou ver um diff conta como *code reviewing*, e o tempo mexendo numa conversa conta no projeto dela. Parou de mexer ou saiu do app, para de contar.

Com isso em pé, a alça do PC ganha o anel **Hoje**, acima do de CPU: quanto você já codou hoje (o que o Claude fez mais o seu tempo), pelo mesmo número que o `wakatime-cli --today` mostra. Ele enche até a meta de `WAKATIME_GOAL_HOURS` e fica verde ao bater.

Sem o `wakatime-cli` instalado, nada disso acontece: o anel não aparece e o painel segue igual. Para desligar com ele instalado, use `WAKATIME=0`.

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

Ou pelo celular, na aba **Computador**, cartão **Atualização do PC**: ele mostra as novidades da `main` do GitHub, e **Atualizar e reiniciar** faz os passos acima (trocando para a `main`, se o PC estiver noutra branch). A atualização recusa se o repositório no PC tiver mudanças não commitadas, se a `main` do PC tiver commits que não estão no GitHub ou se alguma conversa do painel estiver trabalhando ou esperando resposta. O painel fica fora do ar por alguns segundos, e as conversas que estavam abertas nele são reabertas sozinhas, com o mesmo modelo e modo.

Com o app aberto no celular, aparece o aviso **Versão nova do app**: toque em **Atualizar**. Ao voltar para o app, ele procura sozinho a versão nova.

## Usar pelo celular

O que dá para fazer:
- **Início:** o app abre aqui (no PC, ao lado da lista de conversas, quando nenhuma está aberta). Uma saudação com a data e, numa linha, o que está acontecendo (quantas conversas pedem você, quantas trabalham, quanto do limite de 5 h foi usado). Abaixo:
  - **Pedindo você / Agora**: aprovações e perguntas de todas as conversas do painel, com os mesmos cartões do chat para responder ali mesmo; as abertas no PC que esperam você levam até elas; e as que estão trabalhando ou com algo em segundo plano.
  - **Limites do plano** (5 h, semana e por modelo) com previsão pelo ritmo desde o começo da janela: até onde vai ou, se for acabar antes de renovar, quando (em laranja). Embaixo, CPU, memória e processos do Claude no PC.
  - **Dias com o Claude Remote**: o ano em quadradinhos, como o grid de contribuições do GitHub, com a cor mais forte nos dias com mais sessões pelo Claude Remote (**Tudo** conta também as do terminal e do VSCode). Mostra os dias de uso, a sequência atual e o recorde; tocar num dia mostra as sessões, as mensagens e o custo.
  - **Últimos 30 dias**: custo estimado, mensagens suas, dias de uso e tokens; o custo de cada dia em colunas; um mapa de calor dos dias da semana e horários em que você mais usa; e os projetos que mais consumiram. O custo é a preço de tabela da API.
  - **Projetos recentes**: branch e arquivos não commitados de cada um, a última conversa, quanto custou em 30 dias e **+** para começar uma conversa nova nele.
  - O histórico vem dos registros das conversas no PC, que o Claude Code apaga depois de ~30 dias; por isso o servidor guarda um resumo por dia em `~/.local/share/claude-remote/activity.json`, e o grid não perde os dias antigos. Dias de antes dos registros que ainda existem vêm do histórico de mensagens do terminal (`~/.claude/history.jsonl`), sem custo.
- **Salinha** (`/salinha`; o atalho fica na aba Computador e, no PC, na alça): um prédio de escritórios em pixel art para deixar de fundo e acompanhar tudo de uma vez. Cada conversa aberta (no painel ou no PC) é uma área do escritório, separada das outras por divisórias; cada andar tem áreas dos dois lados do corredor (no celular, uma por andar, com o corredor à esquerda), e conversa nova ganha área nova, no lugar onde fica até fechar.
  - **Estações:** o gestor (a conversa) e os funcionários (os subagentes) chegam pelo elevador e vão até a estação do que estão fazendo: mesa com o PC (web, inclusive `curl`), gaveteiro (lendo e procurando arquivos, inclusive `cat`, `grep` e afins no terminal, e compactando a conversa), bancada (editando), terminal (comandos), quadro (planejando e coordenando), café (pensando) e sofá (descansando, com a TV ligada quando algo roda em segundo plano); quem pede você sai até o corredor com um "!". A última ferramenta segura o claudinho na estação por alguns segundos, porque Read e Edit acabam antes da salinha perguntar, e cada um fica um tempo mínimo onde chegou antes de ir para outra.
  - **O que acontece na conversa vira animação:** cada arquivo editado é uma folha voando para a pilha da bancada; erro solta fumaça e um "!?"; teste acende o semáforo do rack, verde ou vermelho; `git commit` faz o claudinho levar uma caixa ao elevador, e `git push` ou `gh pr create` chama o caminhão de entregas na rua; skill tira um livro da estante; o quadro mostra as tarefas da conversa (TodoWrite) com a barra de progresso; o subagente que termina entrega uma pasta ao gestor antes de ir embora; turno encerrado ou pedido respondido ganham um ✓. O gestor usa o chapéu do modelo: coroa no Opus, chapéu de mago no Fable, boina no Sonnet e brotinho no Haiku.
  - **Vida própria:** os claudinhos piscam, olham para a tela, digitam em rajadas e andam de lá para cá pensando. Parado, cada um descansa de um jeito e troca de tempos em tempos: cochila na cadeira com a cabeça caída, senta no sofá (que cabe dois), olha a cidade pela janela, rega a planta, pega um livro na estante, vai ao café, ao bebedouro do corredor ou ao quadro, se espreguiça — e, com dois na mesma área, os dois se encontram no meio da sala para conversar. Ninguém ocupa o mesmo canto que o outro. A área que pede você pulsa em âmbar (e a salinha rola até ela), a que descansa à noite apaga a luz, e com o limite de 5 h estourado o escritório fecha, com "VOLTA ÀS…" no letreiro.
  - **Cidade:** o céu segue o relógio aos poucos, com o sol e a lua cruzando, nuvens, avião, pássaros e, de vez em quando, chuva. Na rua, carros, vans e ônibus passam nas duas mãos, de faróis acesos à noite e guardando distância de quem vai à frente, e gente anda na calçada, de guarda-chuva quando chove. Tudo na escala dos claudinhos: quem passa na calçada tem a altura de um deles, e um carro, umas duas vezes e meia isso de comprimento. No Halloween aparecem abóboras e morcegos, na festa junina, bandeirinhas, e no Natal, luzinhas no telhado.
  - **Toques:** tocar num claudinho mostra o que ele faz (e ele pula); tocar na área abre a conversa ou, se ela pede você no painel, os pedidos ali mesmo, para aprovar sem sair. Para as conversas abertas no PC, o servidor lê o fim do registro delas (só de novo quando ele muda). No topo, dá para manter a tela acesa e abrir em tela cheia; `/salinha?demo` mostra um escritório de mentira, cheio, e `?hora=21` e `?chuva` mudam o céu para ver como fica.
- **Conversas:** no topo, um quadro com CPU, memória e os limites do plano do Claude (janela de 5 h e semana, com horário de reset). Abaixo, as conversas, nesta ordem: as que precisam de você, as fixadas, as abertas agora e as recentes. A aba mostra um contador das que precisam de você. Segurar o dedo numa conversa (ou clicar com o botão direito, no PC) abre o menu dela com **Apagar conversa**, que pede confirmação; a aberta no PC não pode ser apagada até ser fechada lá.
- **Nova** (nas Conversas) pergunta só onde trabalhar, sem projeto (`~`) ou um projeto, e abre um chat vazio. A primeira mensagem, digitada na própria caixa do chat com modelo, modo, `/`, `@` e anexos, cria a sessão.
- **Projetos:** escolher um diretório do PC para iniciar uma sessão nova. Os projetos com mudanças no git sobem para o grupo **Com mudanças**, com selos de arquivos não commitados, commits para enviar (↑) e commits novos no GitHub (↓). A tela mostra primeiro o estado local e depois consulta o remoto com `git fetch` (no máximo a cada 10 min por projeto, sem nunca pedir senha: sem chave ou credencial que funcione sozinha, o ↓ fica no último fetch).
- **Computador:** detalhes do sistema (carga, swap, processos do Claude e memória deles, tempo ligado), todas as janelas de uso, inclusive por modelo, a conexão, as notificações, os sons e o tema.

Com várias máquinas (ver [Várias máquinas](#várias-máquinas)):
- As conversas de todas aparecem juntas, cada uma com o nome da máquina. No topo das Sessões, o filtro **Todas · máquina 1 · máquina 2** mostra só as de uma; a bolinha de cada máquina diz se a conexão com ela está de pé.
- O cabeçalho do chat diz a máquina, e tudo da conversa (mensagens, arquivos, git, `@`, comandos) vai para ela. Dá para pôr conversas de máquinas diferentes lado a lado.
- **Nova** pergunta primeiro a máquina e depois o projeto dela. **Projetos** e **Computador** mostram os da máquina escolhida no filtro.

O app se ajusta à tela:
- **Celular em pé:** uma tela por vez, com as abas embaixo.
- **Celular deitado:** o app instalado gira junto. As abas viram uma coluna na lateral, e o cabeçalho e a caixa de mensagem ficam mais baixos para sobrar espaço para a conversa; a branch continua no **⎇** do topo. Depois de atualizar, o Android pode levar até um dia para liberar a rotação no app instalado; reinstalar o app faz valer na hora.
- **PC ou tablet deitado** (a partir de 1024 px de largura): a lista de conversas fica fixa à esquerda, e a conversa aberta fica ao lado, marcada na lista. Trocar de conversa não precisa voltar à lista. Sem conversa aberta, o lado direito mostra **Nova conversa**.
  - À esquerda fica sempre a alça, uma barra estreita com nova conversa, Sessões (com o contador das que precisam de você), Projetos e Computador e, embaixo, CPU, memória e os limites do Claude (5 h e semana) em anéis de progresso, com as mesmas cores de alerta do quadro do PC. Passar o mouse num anel mostra o detalhe, e clicar abre a aba Computador.
  - Ao lado da alça, a lista de conversas, só com a busca e as conversas. O botão do topo da alça (ou Sessões) recolhe e abre a lista, e a escolha fica salva. Com a lista recolhida, cabe mais uma conversa lado a lado.

Conversas lado a lado (split): **Abrir outra ao lado**, no menu ⋮ do chat, escolhe a conversa que divide a tela. No PC também dá pelo botão que aparece ao passar o mouse numa conversa da lista.
- Cabem 2 no celular: em pé, uma em cima da outra, e deitado, lado a lado. Digitando numa, a outra encolhe até o cabeçalho para o teclado não espremer as duas.
- No PC, cabem conforme a largura da tela, até 4: 2 numa tela de 1280 px, 3 numa de 1440 px e 4 numa de 1920 px.
- A conversa em foco tem uma faixa no topo; tocar numa conversa a põe em foco, e clicar noutra da lista troca a que está em foco.
- O **×** no cabeçalho tira a conversa da tela, e o voltar desfaz a última abertura ou fechamento.
- Cada conversa é um chat completo, com caixa de mensagem, arquivos, git e leitura em voz alta; a barra de leitura aparece na conversa que está sendo lida.

Notificações, mesmo com o app fechado, depois de ativadas na aba Computador:
- **Sempre:** quando o Claude faz uma pergunta (com as opções), pede aprovação (com o comando ou o arquivo) ou a sessão cai.
- **Quando terminar** (opcional): com o começo da última resposta do Claude.
- **Sessões abertas no PC** (opcional): quando uma sessão do terminal ou do VSCode passa a esperar você, ou termina algo que levou mais de 1 min.
- **Sons no app** (cartão **Sons**, na aba Computador): com o app aberto, toca um som quando qualquer conversa passa a perguntar algo ou pedir aprovação (duas notas subindo) e outro quando termina (três notas descendo); das sessões abertas no PC, o de fim só depois de algo que levou mais de 1 min. Cada um liga e desliga separado, com **Ouvir** para conhecer. Os sons são gerados no próprio navegador, sem arquivo de áudio. Com o app na tela, a notificação chega sem som, porque o app já tocou o dele; em segundo plano, quem avisa é a notificação. O navegador só libera o som depois do primeiro toque no app.
- Cada conversa tem uma notificação só, e a mais nova substitui a anterior. Tocar abre a conversa; abrir a conversa limpa o aviso; a conversa que já está na tela não avisa.
- O aviso chega mesmo com o Tailscale desligado no celular, mas abrir a conversa precisa dele. No Android, vale ligar a **VPN sempre ativa** do Tailscale.

No chat:
- O menu ⋮ tem **Fixar no topo**, **Renomear**, **Resumo da sessão** e **Apagar conversa**. O título é gravado no próprio Claude Code, então aparece também no `/resume` do terminal e no VSCode. Apagar remove o histórico de vez e é recusado se a conversa estiver aberta no PC.
- **Sua mensagem fixa no topo:** quando a sua mensagem sobe e sai da tela, ela fica numa faixa logo abaixo do cabeçalho (até duas linhas), para você não perder o que pediu enquanto lê a resposta. Subindo até a resposta anterior, a faixa troca para a mensagem de lá; com a mensagem à vista, a faixa some. Mensagem curta: tocar leva até ela. Mensagem que não cabe nas duas linhas (com a ⌄): tocar abre ela inteira ali mesmo, rolando dentro da faixa até metade da tela, sem tirar você do ponto da resposta; embaixo, **Ir até a mensagem** e **Recolher**.
- Em chats com projeto, a branch aparece inteira embaixo da caixa de mensagem, e o topo tem estes botões:
  - **GitHub** (se o projeto tem remoto): abre a página do repositório; no Android, abre o app do GitHub se estiver instalado. Em outros serviços, como o GitLab, o ícone é um link genérico.
  - **☰**: abre a árvore de pastas e arquivos, só para leitura, com o que o git ignora esmaecido. Tocar num arquivo mostra o conteúdo com números de linha, com opções de quebrar linhas e de ver Markdown formatado; imagens aparecem direto e PDFs abrem à parte.
  - **⎇**: mostra a branch, à frente e atrás do upstream e os arquivos alterados, com linhas adicionadas e removidas. Tocar num arquivo mostra o diff colorido.
- A caixa de mensagem segue o formato da extensão do VSCode: o texto em cima e, na mesma caixa, uma linha com:
  - **+**: enviar do celular (câmera, galeria, arquivos) ou adicionar contexto com `@`;
  - **/**: comandos e skills;
  - **anel de contexto**: quanto falta para a compactação automática, com **Compactar agora**;
  - **pílula do modelo**: com o esforço;
  - **modo**: Manual, Editar automaticamente, Plano ou Automático, com o nível de esforço no mesmo menu;
  - **enviar**: muda de cor conforme o modo, e vira **parar** enquanto o Claude trabalha, com o campo vazio. Com texto, a mensagem entra na fila.
- Embaixo de cada resposta do Claude, **Ouvir** lê o texto em voz alta com a voz do próprio celular; nada roda no PC. Blocos de código e tabelas viram um aviso ("Tem um trecho de código na tela"), caminhos viram só o nome do arquivo e links viram "um link". Durante a leitura:
  - como a letra no Spotify, o trecho sendo lido fica em destaque, o resto da resposta esmaece e a conversa rola junto;
  - em cima da caixa de mensagem aparece uma barra com pausar/continuar, a frase atual e até onde já leu; tocar ou arrastar na barra pula para outra frase, e o **×** encerra;
  - o botão embaixo da resposta também pausa e continua (continuar repete a frase desde o começo), e tocar em outra resposta troca a leitura.
  - o **1x** da barra troca a velocidade: 1,5x, 2x, 3x e de volta a 1x. A escolha fica salva no celular e vale para todas as conversas, inclusive na leitura automática; trocar no meio de uma frase recomeça a frase já na velocidade nova. A voz acelera sem ficar fina, mas o máximo real depende da voz do aparelho: algumas param de acelerar antes de 3x.
  - Com a tela apagada, o Android pode cortar a fala: a leitura fica pausada na frase em que parou, e **Continuar** retoma.
- O alto-falante no topo do chat liga a **leitura automática**: cada resposta nova do Claude é lida sozinha, sem tocar em **Ouvir**. Uma resposta que chega com outra sendo lida espera a vez, e o histórico nunca é lido. A escolha vale para todas as conversas e fica salva no celular; desligar cala na hora.

  No Android, a voz é a de **Configurações › Acessibilidade › Saída de texto para fala** (o nome muda conforme a marca do celular): escolha **Serviços de fala do Google**, idioma Português (Brasil), e baixe a voz para ela funcionar sem internet.
- Na última resposta de cada turno (da sua mensagem até o fim da resposta), ao lado de **Ouvir**, aparecem atalhos do que o Claude fez nele, quando houver: **arquivos**, **comandos** e **links**. Cada um abre o painel **Nesta resposta** na seção dele:
  - **Arquivos alterados**, com as linhas colocadas e tiradas; tocar mostra o diff de cada edição. Entram as mudanças feitas pelas ferramentas de edição do Claude (Edit, Write); arquivos mudados por um comando (um script, um formatador) aparecem só em **Comandos**.
  - **Comandos** do terminal, com ✓ ou ✗; tocar mostra o comando e a saída.
  - **Links**: as páginas que o Claude acessou e as pesquisas que fez na web, e os links citados na resposta.
- **Subagentes:** quando o Claude delega parte do trabalho (a ferramenta Agent), cada subagente vira uma linha no bloco de ações, com a tarefa e, embaixo, o que ele está fazendo agora; ao terminar, o começo do relatório. O que ele faz por dentro (ferramentas, falas) não se mistura ao chat: fica no painel dele. As aprovações pedidas por um subagente dizem de qual subagente vieram.
  - O botão de robô no topo aparece quando a conversa tem subagentes, com quantos estão trabalhando (laranja se algum pede aprovação). Ele abre **Agentes**, a visão geral, em duas formas:
    - **Grafo**, no jeito de um fluxograma do mermaid: a conversa e, ligado a ela, cada subagente, com os que um subagente chamou ligados a ele. A cor diz o estado (trabalhando, pede aprovação, concluído, falhou, interrompido), a linha corre enquanto ele trabalha e fica pontilhada se ele roda em segundo plano. O desenho vai de cima para baixo ou da esquerda para a direita, o que couber melhor na tela (a seta embaixo troca), com zoom e **caber na tela**.
    - **Lista**, na ordem em que foram chamados, com tipo, ferramentas usadas, tempo e o que cada um está fazendo.
  - Tocar num subagente (no chat, no grafo ou na lista) abre o painel dele: o que está fazendo agora (com um resumo do andamento a cada ~30 s), quem o chamou e quem ele chamou, o pedido que recebeu, o passo a passo e o relatório final. Em conversas do histórico ou abertas no PC, o passo a passo vem do registro salvo no PC.
  - Subagentes em segundo plano continuam depois do fim da resposta: enquanto trabalham, a conversa segue como **Executando**, com "N subagentes" na lista de conversas, e **Liberar para o PC** espera eles terminarem.
- **Mapa mental:** o botão de rede no topo troca o chat por um mapa mental da conversa, ao vivo. No centro fica a conversa; cada mensagem sua é um galho numerado, com uma cor; dele saem os passos do Claude, com o que ele disse que ia fazer (ou, se não disse nada, o raciocínio ou o que mais fez: "Lendo 3 arquivos", "Rodando 2 comandos"), as aprovações, as perguntas e a resposta. Nas pontas fica o que cada passo tocou: arquivos (lidos, criados ou editados, com +linhas −linhas), comandos, buscas, sites e subagentes, com o que eles fizeram.
  - Enquanto o Claude trabalha, o galho em andamento fica azul com a linha correndo, e o mapa acompanha sozinho o passo atual. Arrastar solta o acompanhamento, e a mira na barra volta a seguir. Um pedido de aprovação ou uma pergunta fica laranja no mapa, e o cartão para responder (**Permitir**, **Negar**, as opções) aparece acima da caixa de mensagem, sem sair do mapa. Dá para mandar mensagem e parar o Claude normalmente.
  - Turnos antigos ficam recolhidos: tocar num turno abre ou fecha os passos dele, e passos com muitas ações mostram as mais recentes (**+N ações** abre o resto). Tocar num passo ou numa ação volta ao chat naquele ponto, que pisca para ser achado; num subagente, abre o painel dele.
  - O desenho se ajusta à tela: na tela grande, galhos dos dois lados do centro (o mapa clássico); em meia tela, todos para a direita; no celular em pé, uma árvore de cima para baixo. O botão da barra troca entre os três, com zoom pelos botões, pela pinça no celular ou Ctrl + roda no PC. No PC com espaço, **lado a lado** mostra o chat e o mapa juntos.
  - **Salvar como imagem** baixa o mapa como está na tela, em PNG ou SVG; no celular, **Compartilhar imagem** manda direto para outro app.
- **Em segundo plano:** quando o Claude deixa algo rodando e encerra a resposta (um **Monitor** vigiando um build, um comando com `run_in_background`, um subagente, um workflow), a conversa não aparece como concluída: o cabeçalho e a lista de conversas mostram **Em segundo plano**, com a tarefa. No fim da conversa, o cartão **Em segundo plano** diz o que está rodando, o comando e há quanto tempo, e explica que o Claude volta sozinho quando cada uma terminar (num monitor, a cada novidade). **Ver saída** mostra o que o comando ou o monitor escreveu, atualizando sozinha, e **Parar** encerra a tarefa (o Claude recebe o aviso). O som e a notificação de "terminou" só vêm quando não sobra nada em segundo plano, e não a cada passo de um monitor.
- Durante a resposta, a linha embaixo do chat diz o que está rodando e há quanto tempo (ex.: "Rodando Bash · npm run build · 1min 12s"), em vez de só "Trabalhando…".
- Numa conversa parada, modelo, esforço e modo escolhidos na caixa valem quando ela for retomada.
- Sem internet, ou com o PC fora de alcance, a mensagem não se perde, como no WhatsApp: aparece com um relógio e **Aguardando conexão** e é enviada sozinha, na ordem, assim que a conexão volta, mesmo que o app tenha sido fechado nesse meio-tempo. Se não der para entregar (por exemplo, a sessão foi aberta no PC), ela fica marcada como **Não enviada**, com **Tentar de novo** e **Descartar**. Um reenvio nunca repete o turno no Claude.
- Imagens que o Claude devolve (prints, imagens lidas) e as que você envia aparecem como miniatura, reduzida no PC (até 512 px) para pesar pouco no 4G; o original só é baixado ao ampliar. Tocar abre a imagem ampliada por cima do chat, com quem mandou e a posição no topo ("Claude · 3 / 8"):
  - deslizar de lado, ou as setas, passa pelas outras imagens do mesmo lado da conversa, na ordem do chat;
  - zoom com pinça, toque duplo, os botões − e + ou a roda do mouse; ampliada, arrastar passeia pela imagem, e tocar na porcentagem volta ao tamanho normal;
  - tocar fora da imagem fecha, e o botão de abrir leva ao arquivo original.
- O voltar do celular fecha o que está aberto por cima (menu, painel, diálogo, imagem) antes de sair da tela.

As ações do Claude aparecem num bloco separado das mensagens. As aprovações e as perguntas com opções aparecem como cartões, e o botão de lista no topo abre um resumo da sessão: o consumo (quanto do contexto está ocupado, tokens de entrada, saída e cache, e o custo estimado em dólar por modelo, subagentes incluídos), mídia (as imagens numa grade, separadas em suas e do Claude), arquivos alterados, testes, erros e comandos. O custo vem do registro da conversa salvo no PC, a preço de tabela da API: no plano de assinatura, o uso conta nos limites do plano e não é cobrado à parte. Para ditar, toque no microfone da caixa de mensagem: o texto aparece enquanto você fala, onde estava o cursor, e as ondas da voz aparecem na linha de baixo. No Firefox, com o Whisper instalado no PC (ver [Ditado no Firefox](#ditado-no-firefox-whisper)), o microfone grava: toque de novo para parar, e o texto aparece de uma vez alguns segundos depois ("Transcrevendo no PC…"), sem sair do PC; gravação só de silêncio nem é enviada. Pausas para pensar não desligam o microfone: o ditado termina ao tocar de novo, ao enviar, ao começar a digitar, ao sair do app ou depois de 1 minuto sem fala. É o reconhecimento de voz do navegador (no Android, o mesmo do Google que o Gboard usa), então precisa de internet e da permissão de microfone na primeira vez. Nada é enviado sozinho: revise e toque em enviar. O ditado do próprio Gboard também funciona: Enter quebra linha, e o envio é pelo botão.

No campo de mensagem, tanto no chat quanto em "Nova sessão":
- **`/`** no início lista os comandos e skills do projeto: as suas skills e as de plugins primeiro, depois as internas. Comandos que só funcionam como tela no terminal (`/config`, `/mcp`, `/agents`…) ficam de fora.
- **`@`** lista os arquivos e pastas do projeto. Escolher uma pasta continua a navegação dentro dela.
- **📎** anexa arquivos. No Android, o seletor oferece câmera, galeria e arquivos.
  - **Imagens** são reduzidas no celular para até 1568 px e vão direto para o Claude. Tocar numa imagem anexada (a do lápis) abre o editor: caneta, seta, círculo e recorte, em cinco cores, com desfazer; **Pronto** troca o anexo pela versão marcada.
  - **Outros arquivos** (até 25 MB) são gravados no PC em `~/.cache/claude-remote/uploads/<sessão>/` e entram na mensagem como `@caminho`. O Claude Code lê qualquer tipo assim, inclusive PDF.
- No PC, colar um print com Ctrl+V também anexa.
- O rascunho de cada conversa (texto e anexos) fica guardado no celular: trocar de conversa, tocar em **Atualizar** ou o Android fechar o app não perde o que foi digitado.
- No Android, o Claude Remote aparece no menu **Compartilhar** dos outros apps (prints, fotos, arquivos, links): escolha a conversa, ou uma nova, e tudo entra no rascunho dela para você revisar antes de enviar. Depois de atualizar, o Android pode levar até um dia para mostrar o app no menu; reinstalar o app faz aparecer na hora.

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
cr -link                                   # link de acesso remoto (atalho)
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
- `pages/`: telas (início, conversas, projetos, nova sessão, computador, chat).
- `components/home/`: painéis do início (saudação, pedidos, limites, grid do ano, gráficos, projetos).
- `components/office/`: a salinha em pixel art (sprites e móveis desenhados em código, o prédio, quem anda para onde).
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
| GET | `/api/sessions/:id/tasks/:taskId/output` | Fim da saída (até 8 KiB) de um comando ou monitor em segundo plano da conversa aberta no painel |
| POST | `/api/sessions/:id/tasks/:taskId/stop` | Para uma tarefa em segundo plano; o Claude recebe o aviso |
| GET | `/api/transcribe` | `{available}`: se o Whisper está instalado neste PC |
| POST | `/api/transcribe` | `{audio}` (WAV em base64, até ~10 min): transcreve em português com o Whisper (`503 whisper_unavailable`) |
| GET | `/api/sessions/:id/agents/:toolUseId` | O que o subagente criado por essa chamada da ferramenta Agent fez, do transcript salvo (`?agentId=` poupa a busca; `404 agent_not_found`) |
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
| GET | `/api/git?cwd=` | Branch, upstream, página do repositório (`remote`) e arquivos alterados com +/- (`null` sem git) |
| GET | `/api/git/diff?cwd=&path=` | Diff do arquivo contra o último commit; novo = contra vazio |
| GET | `/api/sessions/:id/images/:key` | Imagem do chat (cache em memória, refeito a partir do histórico); `?thumb=1` devolve a miniatura em WebP, até 512 px |
| GET | `/api/files?cwd=&q=` | Busca de arquivos do projeto para a menção `@` |
| POST | `/api/sessions/:id/interrupt` | Interromper o turno |
| POST | `/api/sessions/:id/approvals/:requestId` | Aprovar ou negar ferramenta: `{allow, message?, always?}` |
| POST | `/api/sessions/:id/questions/:requestId` | Responder pergunta do Claude: `{answers: {"<pergunta>": "<opção>"}}` ou `{decline: true}` |
| GET | `/api/push/key` | Chave pública VAPID do PC, para o celular se inscrever |
| POST | `/api/push/subscribe` | `{subscription, prefs: {done, pc}}`: inscreve o aparelho ou muda as preferências (guardado em `~/.local/state/claude-remote/push.json`) |
| POST | `/api/push/unsubscribe` | `{endpoint}`: remove o aparelho |
| POST | `/api/push/test` | `{endpoint}`: manda um aviso de teste a esse aparelho |
| POST | `/api/push/relay` | `{payload, opts}`: aviso repassado por outra máquina sua, entregue aos aparelhos inscritos aqui (não repassa de novo) |
| GET | `/api/machines` | Nome desta máquina e as outras suas com o Claude Remote (`{name, machines: [{id, name, base}]}`) |
| GET | `/api/update` | Branch e commit do PC, novidades da `main` do GitHub, bloqueios e o andamento de uma atualização |
| POST | `/api/update` | Atualiza: troca para a `main`, avança, `pnpm install`, `pnpm build` e reinicia (`409` com mudança local, `main` divergente, conversa trabalhando ou já em dia) |
| POST | `/api/update/restart` | Reinício que ficou adiado porque uma conversa começou a trabalhar durante a compilação |
| WS | `/ws` | `subscribe {sessionId, sinceSeq}` → `snapshot`, `event`, `delta`, `catalog` |
