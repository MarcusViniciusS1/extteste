# Extensão Z-Ticket · Enriquecimento Crisp (CNPJ)

Lê o cabeçalho da conversa aberta no Crisp (`Contato - Empresa`), busca o CNPJ da
empresa no banco do Z-Ticket (via backend) e grava a etiqueta **CNPJ** nos dados
da conversa no Crisp — em tempo real.

## Arquitetura (importante)

Uma extensão de navegador **não conecta direto no Postgres**. O caminho é:

```
Crisp (extensão)  →  Backend Z-Ticket (tem a conexão com o banco)  →  Postgres
                                     └→  API REST do Crisp (grava o CNPJ)
```

A senha do banco e o token do Crisp ficam **só no backend** (`backend/.env`),
nunca dentro da extensão.

## Pré-requisitos

1. **Backend do Z-Ticket rodando** (`cd backend && npm run dev`, porta 3001).
2. **Token de plugin do Crisp** (para gravar dados na conversa):
   - Acesse https://marketplace.crisp.chat/ → crie um plugin.
   - Gere um token de **produção** com escopo de escrita em *Conversation data*.
   - O token vem como `identifier:key`. Coloque no `backend/.env`:
     ```
     CRISP_IDENTIFIER=seu_identifier
     CRISP_KEY=sua_key
     ```
   - Reinicie o backend.

## Instalar a extensão (Chrome/Edge)

1. Abra `chrome://extensions/`.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/`.
4. Clique no ícone da extensão para abrir o popup e configurar:
   - **URL do backend**: `http://localhost:3001` (ou o endereço onde o backend está).
   - **Seletor CSS do cabeçalho** (opcional): veja abaixo.
   - **Website ID** (opcional): normalmente é detectado pela URL do Crisp.

## Ajustar o seletor do cabeçalho

O DOM do Crisp muda com o tempo, então talvez seja preciso indicar o seletor
exato do elemento que mostra o nome do contato:

1. Abra uma conversa no `app.crisp.chat`.
2. No popup da extensão, clique em **Detectar agora**. Ele mostra o que foi lido
   (cabeçalho, contato, empresa, website_id, session_id).
3. Se o cabeçalho vier vazio: inspecione o elemento do nome no Crisp (F12),
   copie um seletor estável (ex: uma classe) e cole em **Seletor CSS do cabeçalho**.
4. Salve e clique em **Detectar agora** de novo para confirmar.

## Testar sem Crisp

No popup, campo **Testar CNPJ por empresa**: digite o nome de uma empresa e
clique em **Buscar CNPJ** — ele consulta o backend e mostra o CNPJ encontrado.
Isso valida a conexão backend ↔ banco sem depender do Crisp.

## Como funciona o texto

- Formato esperado no cabeçalho: `Nome do Contato - Empresa` (traço com espaços).
  Também aceita en-dash `–` e em-dash `—`.
- A parte depois do traço é tratada como o nome da empresa.
- A busca no banco é por nome (contém, sem diferenciar maiúsculas). Se houver
  correspondência exata, ela tem prioridade.

## Endpoints usados (backend)

- `GET  /api/crisp/status` — diz se o Crisp está configurado.
- `GET  /api/lookup/cnpj?company=NOME` — só consulta o CNPJ.
- `POST /api/crisp/enrich` — consulta e grava o CNPJ na conversa do Crisp.
