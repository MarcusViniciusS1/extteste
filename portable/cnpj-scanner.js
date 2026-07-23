// cnpj-scanner.js — módulo portátil, sem dependências.
//
// Duas partes INDEPENDENTES:
//   1) Extração de CNPJ de um texto (extract / isValid / format / onlyDigits).
//   2) Scanner de DOM (createCnpjScanner) que observa a tela e dispara quando
//      aparece um CNPJ NOVO.
//
// Dá pra levar as duas — ou só a primeira — pra qualquer extensão.
// Exposto como window.CnpjScanner (e module.exports em ambiente CommonJS).
//
// ── Uso em outra extensão ──────────────────────────────────────────────
// manifest.json:
//   "content_scripts": [{
//     "matches": ["https://SEU-SITE/*"],
//     "js": ["cnpj-scanner.js", "seu-content.js"]
//   }]
//
// seu-content.js:
//   const scanner = CnpjScanner.createCnpjScanner({
//     root: () => document.querySelector('#chat') || document.body,
//     onNew: (novos) => alert('CNPJ novo detectado: ' + novos.join(', ')),
//   });
//   scanner.start();
//
// Só extração pontual:
//   CnpjScanner.extract("cliente 11.222.333/0001-81 e 04252011000110");
//   // => ["11.222.333/0001-81", "04.252.011/0001-10"]
//
// Compatibilidade: o regex RAW usa lookbehind (?<!\d), suportado em
// Chrome/Edge modernos. Para navegadores muito antigos existe uma variante
// sem lookbehind (peça se precisar).

(function (globalScope) {
  'use strict';

  // mascarado: XX.XXX.XXX/XXXX-XX
  const MASKED = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
  // cru: exatamente 14 dígitos, SEM fazer parte de um número maior
  const RAW = /(?<!\d)\d{14}(?!\d)/g;

  // Só os números de uma string.
  function onlyDigits(s) {
    return String(s == null ? '' : s).replace(/\D/g, '');
  }

  // Aplica a máscara XX.XXX.XXX/XXXX-XX. Devolve null se não houver 14 dígitos.
  function format(raw) {
    const d = onlyDigits(raw);
    if (d.length !== 14) return null;
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  // Valida os dois dígitos verificadores do CNPJ (opcional — use só pra marcar
  // ✅/⚠️; a detecção em si é por formato).
  function isValid(cnpj) {
    const d = onlyDigits(cnpj);
    if (d.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(d)) return false; // rejeita 00000000000000, 11111111111111...

    const dv = (base) => {
      const len = base.length;
      let pos = len - 7;
      let sum = 0;
      for (let i = 0; i < len; i++) {
        sum += Number(base[i]) * pos--;
        if (pos < 2) pos = 9;
      }
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };

    const base12 = d.slice(0, 12);
    const dv1 = dv(base12);
    const dv2 = dv(base12 + dv1);
    return d.slice(12) === String(dv1) + String(dv2);
  }

  // Junta os dois regex num Set e devolve a lista única, tudo mascarado
  // (00000000000000 e 00.000.000/0000-00 viram a mesma string → dedup).
  function extract(text) {
    const t = String(text == null ? '' : text);
    const set = new Set();
    let m;
    MASKED.lastIndex = 0;
    while ((m = MASKED.exec(t)) !== null) {
      const f = format(m[0]);
      if (f) set.add(f);
    }
    RAW.lastIndex = 0;
    while ((m = RAW.exec(t)) !== null) {
      const f = format(m[0]);
      if (f) set.add(f);
    }
    return [...set];
  }

  // Scanner de DOM: MutationObserver (com debounce) + raiz limitada +
  // Set de "já vistos". Só dispara onNew quando surge um CNPJ inédito.
  function createCnpjScanner(opts) {
    opts = opts || {};
    const getRoot = typeof opts.root === 'function'
      ? opts.root
      : function () { return opts.root || document.body; };
    const onNew = typeof opts.onNew === 'function' ? opts.onNew : function () {};
    const onScan = typeof opts.onScan === 'function' ? opts.onScan : null;
    const debounceMs = typeof opts.debounceMs === 'number' ? opts.debounceMs : 800;

    const seen = new Set();
    let observer = null;
    let timer = null;

    function scan() {
      const rootEl = getRoot() || document.body;
      if (!rootEl) return [];
      const text = rootEl.innerText || rootEl.textContent || '';
      const all = extract(text);
      const fresh = all.filter(function (c) { return !seen.has(c); });
      for (const c of all) seen.add(c);
      if (onScan) { try { onScan(all); } catch (e) {} }
      if (fresh.length) { try { onNew(fresh, all); } catch (e) {} }
      return all;
    }

    function scheduleScan() {
      clearTimeout(timer);
      timer = setTimeout(scan, debounceMs);
    }

    return {
      // Começa a observar e faz uma varredura inicial.
      start: function () {
        const rootEl = getRoot() || document.body;
        if (rootEl) {
          if (observer) observer.disconnect();
          observer = new MutationObserver(scheduleScan);
          observer.observe(rootEl, { childList: true, subtree: true, characterData: true });
        }
        scan();
        return this;
      },
      // Para de observar.
      stop: function () {
        if (observer) observer.disconnect();
        observer = null;
        clearTimeout(timer);
        return this;
      },
      // Zera a memória de "já vistos" (ex.: ao trocar de conversa/contexto).
      reset: function () {
        seen.clear();
        return this;
      },
      // Força uma varredura imediata (ignora o debounce).
      scan: scan
    };
  }

  const api = { MASKED, RAW, onlyDigits, format, isValid, extract, createCnpjScanner };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalScope) globalScope.CnpjScanner = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
