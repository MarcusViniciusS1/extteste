# Plugin Crisp — "Salvar contato"

Um plugin para o [Crisp](https://crisp.chat) que adiciona um **botão na barra lateral da conversa**. Ao clicar, ele:

1. Lê o e-mail / telefone / nome do cliente da conversa;
2. Verifica se esse contato **já está salvo** no People (Contatos) do Crisp;
3. Se **não** estiver, **cria** o contato automaticamente.

---

## Como funciona (arquitetura)

O Crisp Marketplace **não hospeda o código** — ele só registra e distribui o plugin. Você precisa de uma URL HTTPS sua no ar. Este projeto é **um único app Node.js** que faz as duas partes:

```
   Operador clica no botão
            │
            ▼
   widget.html  (dentro do Crisp, via iframe)
            │  POST /api/salvar-contato
            ▼
   server.js  (SEU backend — guarda o token secreto)
            │  Authorization: Basic ...  +  X-Crisp-Tier: plugin
            ▼
   REST API do Crisp  (lê a conversa / cria o contato)
```

> ⚠️ **Segurança:** o token secreto do plugin fica **só no backend** (`server.js`). O widget nunca o vê. Nunca coloque o token dentro do `widget.html`.

---

## Passo 1 — Criar o plugin no Marketplace

1. Acesse **https://marketplace.crisp.chat/** e faça login.
2. Clique em **New Plugin** → dê um nome (ex.: "Salvar contato") e deixe **Private** por enquanto.
3. Em **Tokens**, copie o **Development token** (`identifier` e `key`). Use ele durante os testes.
4. Em **Scopes / Permissions**, ative:
   - `website:conversation:sessions` — para ler os dados da conversa (e receber o `session_id` no widget);
   - `website:people:profiles` — para checar e criar contatos.

---

## Passo 2 — Rodar localmente (para testar)

Requer **Node.js 18 ou superior**.

```bash
# 1. Instale as dependências
npm install

# 2. Configure os tokens
cp .env.example .env      # no Windows PowerShell: copy .env.example .env
# abra o .env e cole o identifier e o key do Development token

# 3. Rode
npm start
```

Deve aparecer: `Plugin "Salvar contato" rodando na porta 3000`.

> Para o Crisp acessar o widget de dentro do app, a URL precisa ser **HTTPS e pública**. Em teste local, use um túnel como [ngrok](https://ngrok.com): `ngrok http 3000` — ele te dá uma URL `https://xxxx.ngrok-free.app`.

---

## Passo 3 — Colocar no ar (deploy grátis)

Qualquer provedor que rode Node serve. Exemplo com **Render**:

1. Suba este projeto para um repositório no GitHub (o `.env` **não** vai junto por causa do `.gitignore` — é o correto).
2. Em https://render.com → **New → Web Service** → conecte o repositório.
3. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Em **Environment**, adicione as variáveis `CRISP_PLUGIN_IDENTIFIER` e `CRISP_PLUGIN_KEY`.
5. Deploy. Você recebe uma URL tipo `https://seu-plugin.onrender.com`.

Sua URL do widget será: `https://seu-plugin.onrender.com/widget.html`

---

## Passo 4 — Registrar o widget no plugin

1. No Marketplace, abra seu plugin → seção **Widgets / URLs**.
2. Adicione um **iFrame Widget** com esta configuração:

```json
{
  "version": "1.0",
  "url": "https://seu-plugin.onrender.com/widget.html"
}
```

O Crisp adiciona automaticamente na URL os parâmetros `website_id`, `session_id`, `token` e `locale` — o widget já lê esses valores.

3. Instale o plugin no seu workspace de teste (**Settings → Plugins**, ou o botão de instalação no Marketplace).
4. Abra o Inbox → uma conversa. O botão **"Salvar contato"** aparece na barra lateral. 🎉

---

## Passo 5 — Publicar no Marketplace

Quando estiver funcionando:

1. Troque o **Development token** pelo **Production token** (gere-o no Marketplace, com os mesmos scopes) nas variáveis de ambiente do seu servidor.
2. No plugin, preencha ícone, descrição, capturas de tela e envie para **revisão** do Crisp.
3. Após aprovado, o plugin fica disponível publicamente.

---

## Escopos usados

| Escopo | Para quê |
| --- | --- |
| `website:conversation:sessions` | Ler e-mail/telefone/nome da conversa; receber `session_id` no widget |
| `website:people:profiles` | Verificar se o contato existe e criar o contato |

## Endpoints da API do Crisp usados

| Ação | Método | Rota |
| --- | --- | --- |
| Ler dados da conversa | `GET` | `/website/{id}/conversation/{session}/meta` |
| Contato existe? (por e-mail) | `HEAD` | `/website/{id}/people/profile/{email}` |
| Contato existe? (por telefone) | `GET` | `/website/{id}/people/profiles/1?search_text=...` |
| Criar contato | `POST` | `/website/{id}/people/profile` |

---

## Ponto a confirmar antes de produção

O Crisp envia um parâmetro `token` na URL do widget para você validar que a chamada veio mesmo do app do Crisp. Este projeto faz uma verificação **prática** (só consegue ler a conversa quem tem o token secreto do plugin e está autorizado no website). Antes de publicar, confirme na documentação do Crisp a validação formal desse `token` e, se quiser, reforce a checagem em `server.js` (função de verificação comentada no código).
