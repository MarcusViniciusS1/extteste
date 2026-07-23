/**
 * Plugin Crisp — "Salvar contato"  (modelo Generic Widget)
 * ============================================================
 * Neste modelo NAO existe pagina HTML de widget. O botao e definido
 * por um JSON (veja widget-schema.json) que voce cola no painel do
 * plugin. Quando o operador clica no botao, o Crisp faz um POST na
 * ACTION URL abaixo, e este servidor faz o trabalho.
 *
 * Endpoints:
 *   POST /crisp/action   -> ACTION URL (recebe o clique do botao)
 *   GET  /crisp/widget   -> (opcional) serve o JSON do widget, caso
 *                           voce prefira usar a Settings URL em vez de
 *                           colar o JSON estatico no painel
 *   POST /crisp/callback -> (opcional) CALLBACK URL (instalacao)
 *   GET  /api/conversas  -> auxiliar SO PARA TESTE local
 *   GET  /health         -> healthcheck
 */

require("dotenv").config();
const express = require("express");
const crypto = require("crypto");

const app = express();

// Precisamos do corpo CRU (raw) para conferir a assinatura HMAC.
// Por isso guardamos req.rawBody antes do parse do JSON.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

const CRISP_API = "https://api.crisp.chat/v1";
const IDENTIFIER = process.env.CRISP_PLUGIN_IDENTIFIER;
const KEY = process.env.CRISP_PLUGIN_KEY;
const SIGNING_SECRET = process.env.CRISP_SIGNING_SECRET || "";

// Enquanto voce nao confirmar a formula exata da assinatura,
// deixe VERIFY_SIGNATURE=false no .env para o botao funcionar.
// Depois de confirmar (ver README), mude para true.
const VERIFY_SIGNATURE = process.env.VERIFY_SIGNATURE === "true";

// URL publica deste backend (usada no JSON do widget servido por /crisp/widget).
const PUBLIC_URL = process.env.PUBLIC_URL || "";

if (!IDENTIFIER || !KEY) {
  console.warn(
    "[AVISO] CRISP_PLUGIN_IDENTIFIER / CRISP_PLUGIN_KEY nao definidos. " +
      "Copie .env.example para .env e preencha."
  );
}

/* ----------------------------------------------------------------
 * 1) Autenticacao do plugin na REST API do Crisp
 * ---------------------------------------------------------------- */
function crispHeaders() {
  const basic = Buffer.from(`${IDENTIFIER}:${KEY}`).toString("base64");
  return {
    Authorization: `Basic ${basic}`,
    "X-Crisp-Tier": "plugin",
    "Content-Type": "application/json",
  };
}

async function crispFetch(pathName, options = {}) {
  const res = await fetch(`${CRISP_API}${pathName}`, {
    ...options,
    headers: { ...crispHeaders(), ...(options.headers || {}) },
  });
  if (options.method === "HEAD") return { status: res.status, data: null };
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  return { status: res.status, data };
}

/* ----------------------------------------------------------------
 * 2) Logica de contato (ler conversa / checar / criar)
 * ---------------------------------------------------------------- */
async function lerConversa(websiteId, sessionId) {
  const { status, data } = await crispFetch(
    `/website/${websiteId}/conversation/${sessionId}/meta`
  );
  if (status !== 200) {
    const e = new Error(`Nao consegui ler a conversa (status ${status}).`);
    e.status = status;
    throw e;
  }
  return data && data.data ? data.data : data;
}

async function contatoExistePorEmail(websiteId, email) {
  const { status } = await crispFetch(
    `/website/${websiteId}/people/profile/${encodeURIComponent(email)}`,
    { method: "HEAD" }
  );
  return status === 200;
}

async function contatoExistePorTelefone(websiteId, telefone) {
  const { status, data } = await crispFetch(
    `/website/${websiteId}/people/profiles/1?search_text=${encodeURIComponent(
      telefone
    )}&search_type=phone`
  );
  if (status !== 200 || !data) return false;
  const lista = Array.isArray(data.data) ? data.data : [];
  return lista.length > 0;
}

async function criarContato(websiteId, { email, telefone, nome }) {
  const body = { person: {} };
  if (email) body.email = email;
  if (nome) body.person.nickname = nome;
  if (telefone) body.person.phone = telefone;
  const { status, data } = await crispFetch(
    `/website/${websiteId}/people/profile`,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (status !== 201 && status !== 200) {
    const e = new Error(`Falha ao criar contato (status ${status}).`);
    e.status = status;
    e.detalhe = data;
    throw e;
  }
  return data && data.data ? data.data : data;
}

// Fluxo completo usado pela Action URL.
async function salvarContatoDaConversa(websiteId, sessionId) {
  const conversa = await lerConversa(websiteId, sessionId);
  const email = conversa.email || null;
  const telefone = conversa.phone || null;
  const nome = conversa.nickname || null;

  if (!email && !telefone) {
    return {
      ok: false,
      mensagem: "A conversa nao tem email nem telefone.",
    };
  }

  let jaExiste = false;
  if (email) jaExiste = await contatoExistePorEmail(websiteId, email);
  else if (telefone) jaExiste = await contatoExistePorTelefone(websiteId, telefone);

  if (jaExiste) {
    return { ok: true, criado: false, mensagem: "Contato ja estava salvo." };
  }

  const novo = await criarContato(websiteId, { email, telefone, nome });
  return { ok: true, criado: true, mensagem: "Contato salvo!", contato: novo };
}

/* ----------------------------------------------------------------
 * 3) Verificacao da assinatura (Signing Secret)
 * ----------------------------------------------------------------
 * O Crisp envia dois headers:
 *   X-Crisp-Request-Timestamp
 *   X-Crisp-Signature
 * A assinatura e um HMAC-SHA256. A formula EXATA (o que exatamente
 * entra no HMAC) deve ser confirmada — por isso logamos os valores
 * quando VERIFY_SIGNATURE=false, para voce comparar e travar depois.
 */
function assinaturaValida(req) {
  const timestamp = req.header("X-Crisp-Request-Timestamp");
  const recebida = req.header("X-Crisp-Signature");
  if (!SIGNING_SECRET || !timestamp || !recebida) return false;

  // Tentativa 1: HMAC sobre  `${timestamp}\n${rawBody}`
  const base1 = `${timestamp}\n${req.rawBody}`;
  // Tentativa 2: HMAC sobre apenas o rawBody
  const base2 = req.rawBody;

  const calc = (base) =>
    crypto.createHmac("sha256", SIGNING_SECRET).update(base).digest("hex");

  const c1 = calc(base1);
  const c2 = calc(base2);

  if (!VERIFY_SIGNATURE) {
    console.log("[assinatura] recebida =", recebida);
    console.log("[assinatura] calc(timestamp+body) =", c1);
    console.log("[assinatura] calc(body) =", c2);
  }
  return recebida === c1 || recebida === c2;
}

/* ----------------------------------------------------------------
 * 4) ACTION URL — recebe o clique do botao
 * ---------------------------------------------------------------- */
app.post("/crisp/action", async (req, res) => {
  console.log("[action] corpo recebido:", JSON.stringify(req.body, null, 2));

  if (VERIFY_SIGNATURE && !assinaturaValida(req)) {
    console.warn("[action] assinatura invalida — pedido recusado.");
    return res.status(401).json({ ok: false, mensagem: "Assinatura invalida." });
  }

  try {
    const origin = req.body.origin || {};
    const websiteId = origin.website_id;
    const sessionId = origin.session_id;
    // Qual botao foi clicado (caso voce tenha mais de um):
    const itemId = req.body.widget && req.body.widget.item_id;

    if (itemId && itemId !== "salvar_contato") {
      return res.status(200).json({ ok: true, ignorado: itemId });
    }
    if (!websiteId || !sessionId) {
      return res
        .status(200)
        .json({ ok: false, mensagem: "Faltou website_id/session_id." });
    }

    const resultado = await salvarContatoDaConversa(websiteId, sessionId);
    console.log("[action] resultado:", resultado);
    // O Crisp espera 200 para confirmar o recebimento.
    return res.status(200).json(resultado);
  } catch (err) {
    console.error("[action] erro:", err);
    // Ainda respondemos 200 para o Crisp nao ficar re-tentando.
    return res.status(200).json({ ok: false, mensagem: err.message });
  }
});

/* ----------------------------------------------------------------
 * 5) (Opcional) Servir o JSON do widget pela Settings URL
 * ---------------------------------------------------------------- */
function widgetSchema() {
  const actionUrl = PUBLIC_URL ? `${PUBLIC_URL}/crisp/action` : "/crisp/action";
  return {
    version: "1.0",
    sections: [
      {
        id: "zorte",
        title: "Zorte",
        items: [
          {
            type: "button",
            id: "salvar_contato",
            value: {
              type: "hook",
              label: "Salvar contato",
              color: "blue",
              url: actionUrl,
            },
          },
        ],
      },
    ],
  };
}
app.get("/crisp/widget", (_req, res) => res.json(widgetSchema()));
app.post("/crisp/settings", (_req, res) => res.json(widgetSchema()));

/* ----------------------------------------------------------------
 * 6) (Opcional) CALLBACK URL — instalacao do plugin
 * ---------------------------------------------------------------- */
app.post("/crisp/callback", (req, res) => {
  console.log("[callback] instalacao:", JSON.stringify(req.body));
  res.status(200).json({ ok: true });
});

/* ----------------------------------------------------------------
 * 7) Auxiliar SO PARA TESTE local — listar conversas
 *    >> Remova/proteja antes de producao. <<
 * ---------------------------------------------------------------- */
app.get("/api/conversas", async (req, res) => {
  const websiteId = req.query.website_id;
  if (!websiteId) {
    return res.status(400).json({ ok: false, mensagem: "Passe ?website_id=..." });
  }
  try {
    const { status, data } = await crispFetch(
      `/website/${websiteId}/conversations/1`
    );
    if (status !== 200) {
      return res.status(status).json({ ok: false, mensagem: `Crisp retornou ${status}.` });
    }
    const conversas = (data && data.data ? data.data : []).map((c) => ({
      session_id: c.session_id,
      nome: c.meta && c.meta.nickname,
      email: c.meta && c.meta.email,
      telefone: c.meta && c.meta.phone,
    }));
    return res.json({ ok: true, website_id: websiteId, conversas });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Plugin "Salvar contato" (Generic Widget) na porta ${PORT}`);
  console.log(`Action URL:  /crisp/action`);
  console.log(`Widget JSON: /crisp/widget`);
});
