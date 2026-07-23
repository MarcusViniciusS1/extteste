# Guia completo — Plugin Crisp "Salvar contato" (do zero)

Este guia é para quem **nunca fez** um plugin de Crisp. Ele explica cada conceito e cada clique. Feito para **Windows 11** (seu caso), mas os comandos são quase iguais em Mac/Linux.

> Leva ~1 hora na primeira vez. Vá com calma e faça uma etapa por vez.

---

## Índice

1. [Entendendo o que estamos construindo](#1-entendendo-o-que-estamos-construindo)
2. [Conceitos que você precisa saber](#2-conceitos-que-você-precisa-saber)
3. [Instalar o Node.js](#3-instalar-o-nodejs)
4. [Criar o plugin no Crisp Marketplace](#4-criar-o-plugin-no-crisp-marketplace)
5. [Configurar o projeto no seu PC](#5-configurar-o-projeto-no-seu-pc)
6. [Rodar e testar localmente com ngrok](#6-rodar-e-testar-localmente-com-ngrok)
7. [Registrar o widget no plugin](#7-registrar-o-widget-no-plugin)
8. [Ver o botão funcionando no Crisp](#8-ver-o-botão-funcionando-no-crisp)
9. [Colocar no ar de verdade (deploy no Render)](#9-colocar-no-ar-de-verdade-deploy-no-render)
10. [Publicar no Marketplace](#10-publicar-no-marketplace)
11. [Solução de problemas](#11-solução-de-problemas)
12. [Glossário](#12-glossário)

---

## 1. Entendendo o que estamos construindo

Imagine o operador de atendimento com uma conversa aberta no Crisp. Do lado direito (a "barra lateral"), vai aparecer um **botão**: *Salvar contato*.

Quando ele clica:

1. O sistema olha os dados do cliente naquela conversa (e-mail, telefone, nome).
2. Verifica se esse cliente **já está cadastrado** na lista de Contatos (People) do Crisp.
3. Se **não** estiver, **cadastra** automaticamente.

Simples de usar. Mas por baixo, o Crisp exige uma estrutura específica. É o que a próxima seção explica.

---

## 2. Conceitos que você precisa saber

Leia com atenção — entender isto evita 90% da confusão.

### 2.1. O Marketplace NÃO hospeda seu código

O **Crisp Marketplace** (marketplace.crisp.chat) é onde você **registra** o plugin e pega as **chaves de acesso** (tokens). Mas o código do botão (a página HTML) e a lógica precisam rodar **num servidor seu**, com um endereço na internet (uma URL que começa com `https://`).

Ou seja, você precisa de **duas coisas separadas**:

| Onde | O que fica lá |
| --- | --- |
| Crisp Marketplace | O "cadastro" do plugin + os tokens + a configuração do widget |
| Seu servidor (na nuvem) | O código que roda de verdade (este projeto Node.js) |

### 2.2. Por que existe um "backend"?

O plugin tem duas partes no nosso código:

- **Widget** (`public/widget.html`): a telinha com o botão. Roda **dentro** do Crisp, na tela do operador. Qualquer pessoa consegue ver o código dele (é HTML no navegador).
- **Backend** (`server.js`): um programa que roda **no servidor**, escondido. Só ele conhece o **token secreto** do plugin.

**Por que separar?** Porque o token secreto dá acesso total à conta do Crisp. Se ele estivesse no `widget.html`, qualquer pessoa que abrisse o "inspecionar" do navegador roubaria o token. Então:

```
Widget (público)  →  Backend (secreto)  →  API do Crisp
   o botão            guarda o token         faz o trabalho
```

O widget só diz ao backend "salva o contato desta conversa aqui"; o backend, que tem o token, faz o serviço.

### 2.3. O que é "API REST do Crisp"

É o "telefone" pelo qual programas conversam com o Crisp. Você faz um pedido (ex.: "esse contato existe?") e o Crisp responde. Nosso `server.js` faz esses pedidos por você. Você não precisa decorar nada disso — já está pronto no código.

### 2.4. O que são "tokens" e "scopes"

- **Token** = a senha do plugin. Tem duas partes: `identifier` (usuário) e `key` (senha). Vêm em dois tipos:
  - **Development token**: para testar, só funciona no seu próprio workspace.
  - **Production token**: para valer de verdade, quando publicar.
- **Scopes** (escopos) = permissões. Você diz ao Crisp "meu plugin só precisa ler conversas e criar contatos", e ele libera só isso. Mais seguro.

---

## 3. Instalar o Node.js

O `server.js` roda em cima do **Node.js**. Vamos instalar.

1. Abra https://nodejs.org
2. Baixe a versão **LTS** (o botão da esquerda, recomendado).
3. Rode o instalador. Pode ir clicando **Next** e aceitar tudo. Deixe marcada a opção de adicionar ao PATH (vem marcada por padrão).
4. **Feche e reabra** qualquer terminal/PowerShell que estiver aberto.

### Conferir se instalou

Abra o **PowerShell** (tecla Windows → digite "PowerShell" → Enter) e digite:

```powershell
node --version
```

Deve aparecer algo como `v20.x.x` (qualquer número **18 ou maior** serve). Se aparecer erro "não reconhecido", reinicie o PC e tente de novo.

---

## 4. Criar o plugin no Crisp Marketplace

1. Acesse **https://marketplace.crisp.chat/** e faça login (mesma conta do seu Crisp).
2. Clique em **New Plugin** (Novo Plugin).
3. Preencha:
   - **Name**: `Salvar contato`
   - **Description**: `Salva o contato do cliente no People se ainda não existir.`
   - **Visibility**: deixe **Private** (privado) por enquanto.
4. Clique em criar. Você cai na página do plugin.

### 4.1. Pegar os tokens

1. No menu do plugin, procure a seção **Tokens** (ou **Settings → Tokens**).
2. Você verá o **Development token** com dois valores:
   - **Identifier** (algo como `abc123...`)
   - **Key** (algo como `xyz789...`)
3. **Copie os dois** para um bloco de notas temporário. Vamos usá-los no passo 5.

> 🔒 Nunca poste esses valores em lugar público (GitHub, WhatsApp, print). É a senha do plugin.

### 4.2. Ativar os scopes (permissões)

1. Procure a seção **Scopes** ou **Permissions**.
2. Ative (marque) estas duas:
   - ✅ `website:conversation:sessions` → ler os dados da conversa e receber o `session_id`.
   - ✅ `website:people:profiles` → verificar e criar contatos.
3. Salve.

> Se você não ativar `website:conversation:sessions`, o widget **não recebe** o `session_id` e o botão não sabe de qual conversa se trata.

---

## 5. Configurar o projeto no seu PC

O projeto já está na pasta `D:\Documentos\Marcus\cripsS1`. Vamos prepará-lo.

### 5.1. Abrir o PowerShell na pasta certa

No PowerShell, rode:

```powershell
cd "D:\Documentos\Marcus\cripsS1"
```

(O terminal deve passar a mostrar esse caminho.)

### 5.2. Instalar as dependências

```powershell
npm install
```

Isso baixa o Express e o dotenv (as "peças" que o `server.js` usa). Cria a pasta `node_modules`. Espere terminar.

### 5.3. Criar o arquivo `.env` com seus tokens

O `.env` é onde ficam os tokens **no seu servidor** — ele **nunca** vai para o GitHub (o `.gitignore` já bloqueia).

Crie a partir do modelo:

```powershell
copy .env.example .env
```

Agora abra o `.env` (pode usar o Bloco de Notas):

```powershell
notepad .env
```

Preencha com os valores que você copiou no passo 4.1:

```
CRISP_PLUGIN_IDENTIFIER=cole_aqui_o_identifier
CRISP_PLUGIN_KEY=cole_aqui_o_key
PORT=3000
```

Salve e feche o Bloco de Notas.

---

## 6. Rodar e testar localmente com ngrok

### 6.1. Ligar o servidor

```powershell
npm start
```

Deve aparecer:

```
Plugin "Salvar contato" rodando na porta 3000
Widget:  http://localhost:3000/widget.html
```

**Deixe essa janela do PowerShell aberta** — é o servidor rodando. Para parar, é `Ctrl + C`.

Teste no navegador: abra http://localhost:3000/widget.html — você verá o botão (ele vai dizer "Abra este botão dentro de uma conversa do Crisp", porque fora do Crisp não há conversa; isso é normal).

### 6.2. Por que preciso do ngrok?

O Crisp roda na internet e precisa acessar seu widget por um endereço `https://` público. Seu `localhost:3000` só existe no seu PC. O **ngrok** cria um "túnel": um endereço público que aponta para o seu PC.

> É só para testar. Depois, no passo 9, vamos para um servidor de verdade e o ngrok deixa de ser necessário.

### 6.3. Instalar e rodar o ngrok

1. Crie conta grátis em https://ngrok.com e baixe o programa para Windows.
2. Siga a instrução do site para conectar seu "authtoken" (um comando que eles te mostram, tipo `ngrok config add-authtoken SEU_TOKEN`).
3. **Abra um SEGUNDO PowerShell** (deixe o primeiro rodando o `npm start`) e digite:

```powershell
ngrok http 3000
```

4. O ngrok mostra uma linha **Forwarding** com um endereço, tipo:

```
Forwarding  https://a1b2-c3d4.ngrok-free.app -> http://localhost:3000
```

**Copie esse `https://a1b2-c3d4.ngrok-free.app`** — é a sua URL pública temporária. Deixe o ngrok aberto também.

---

## 7. Registrar o widget no plugin

Agora dizemos ao Crisp onde está o botão.

1. Volte ao Marketplace, na página do seu plugin.
2. Procure a seção **Widgets** (ou **URLs / iFrame**).
3. Adicione um **iFrame Widget** com esta configuração (troque pela SUA URL do ngrok, e note o `/widget.html` no final):

```json
{
  "version": "1.0",
  "url": "https://a1b2-c3d4.ngrok-free.app/widget.html"
}
```

4. Salve.

> O Crisp vai, sozinho, acrescentar `?website_id=...&session_id=...&token=...&locale=pt` no final dessa URL quando abrir o widget. O nosso `widget.html` já lê esses valores.

### 7.1. Instalar o plugin no seu workspace

1. Ainda no plugin, procure o botão **Install** / **Install on a website** (ou vá em **Crisp → Settings → Plugins**).
2. Escolha o seu website/workspace de teste e instale.

---

## 8. Ver o botão funcionando no Crisp

1. Abra o Crisp normal (app.crisp.chat) → **Inbox**.
2. Abra **uma conversa** que tenha e-mail ou telefone do cliente (se não tiver, o botão avisa que faltam dados).
3. Na **barra lateral direita**, role até achar o widget do seu plugin com o botão **Salvar contato**.
4. Clique. Deve aparecer:
   - "Contato salvo com sucesso!" (se era novo), ou
   - "Este contato já estava salvo." (se já existia).
5. Confira em **Contacts / People** no Crisp — o contato deve estar lá.

🎉 Se chegou aqui, seu plugin **funciona**.

> Enquanto usar ngrok, sempre que reiniciar o ngrok a URL muda — aí você precisa atualizar a URL no passo 7. Por isso o próximo passo (deploy) é importante.

---

## 9. Colocar no ar de verdade (deploy no Render)

O ngrok é só para teste. Para deixar o plugin **sempre no ar** (mesmo com seu PC desligado), publique num servidor grátis. Exemplo: **Render**.

### 9.1. Subir o código para o GitHub

1. Crie conta em https://github.com (se não tiver).
2. Crie um repositório novo (pode ser **Private**), ex.: `crisp-salvar-contato`.
3. No PowerShell, dentro da pasta do projeto:

```powershell
git init
git add .
git commit -m "Plugin Crisp salvar contato"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/crisp-salvar-contato.git
git push -u origin main
```

> O `.env` **não** sobe (está no `.gitignore`) — isso é o correto. Os tokens vão direto no Render no próximo passo.

### 9.2. Criar o serviço no Render

1. Acesse https://render.com e faça login (dá para entrar com o GitHub).
2. **New → Web Service**.
3. Conecte e escolha o repositório `crisp-salvar-contato`.
4. Configure:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Em **Environment Variables**, adicione (com os mesmos valores do seu `.env`):
   - `CRISP_PLUGIN_IDENTIFIER` = seu identifier
   - `CRISP_PLUGIN_KEY` = seu key
6. Clique em **Create Web Service** e aguarde o deploy (alguns minutos).
7. No topo aparece a URL final, tipo `https://crisp-salvar-contato.onrender.com`.

### 9.3. Trocar a URL do widget

Volte ao passo 7 e troque a URL do ngrok pela do Render:

```json
{
  "version": "1.0",
  "url": "https://crisp-salvar-contato.onrender.com/widget.html"
}
```

Pronto — agora o plugin funciona sem depender do seu PC.

> ℹ️ No plano grátis do Render, o serviço "dorme" após um tempo sem uso e demora alguns segundos para acordar no primeiro clique. Normal.

---

## 10. Publicar no Marketplace

Quando estiver tudo redondo e você quiser disponibilizar para outras contas:

1. No Marketplace, gere um **Production token** (mesmos scopes do passo 4.2).
2. Atualize as variáveis `CRISP_PLUGIN_IDENTIFIER` e `CRISP_PLUGIN_KEY` no **Render** com os valores de produção e faça um novo deploy.
3. Na página do plugin, preencha: ícone, descrição completa, categoria e capturas de tela.
4. Envie para **revisão** do Crisp. Eles analisam e aprovam.
5. Depois de aprovado, o plugin fica público no Marketplace.

---

## 11. Solução de problemas

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `node` não é reconhecido no PowerShell | Node não instalado ou terminal não reiniciado | Reinstale o Node (passo 3) e reabra o PowerShell |
| `npm install` dá erro de rede | Sem internet / proxy | Tente de novo; verifique a conexão |
| O widget mostra "Abra este botão dentro de uma conversa" | Você abriu direto no navegador (sem o Crisp) | Normal fora do Crisp; teste dentro do Inbox |
| Botão diz "Esta conversa não tem email nem telefone" | O cliente não informou contato | Peça o contato ao cliente; o Crisp precisa ter e-mail ou telefone |
| "Não consegui ler a conversa (status 401/403)" | Token errado ou scope faltando | Confira `.env`/variáveis no Render e os scopes (passo 4.2) |
| "Falha ao criar o contato (status 403)" | Falta o scope `website:people:profiles` | Ative o scope e reinstale o plugin |
| O widget nem aparece na barra lateral | URL do widget errada, ou plugin não instalado | Confira o passo 7 (com `/widget.html`) e o 7.1 |
| Funcionava com ngrok e parou | A URL do ngrok mudou ao reiniciar | Atualize a URL no passo 7, ou vá para o Render (passo 9) |

### Como ver os erros do servidor

- **Local**: olhe a janela do PowerShell onde rodou `npm start` — os erros aparecem lá.
- **Render**: no painel do serviço, aba **Logs**.

---

## 12. Glossário

- **Widget**: a telinha com o botão, embutida no Crisp.
- **Backend / servidor**: o programa (`server.js`) que roda escondido e guarda o token.
- **API REST**: o jeito de programas conversarem com o Crisp.
- **Token (identifier + key)**: a "senha" do plugin.
- **Scope (escopo)**: permissão específica que o plugin pede.
- **Deploy**: colocar o código para rodar num servidor da internet.
- **ngrok**: túnel que expõe seu PC na internet temporariamente (só para teste).
- **`.env`**: arquivo com segredos que fica só no servidor, nunca no GitHub.
- **People / Contacts**: a lista de contatos dentro do Crisp.
- **session_id**: identificador da conversa aberta.
- **website_id**: identificador do seu workspace/site no Crisp.

---

Qualquer passo que travar, me diga **em qual número** você está e o que apareceu na tela — a gente resolve.
