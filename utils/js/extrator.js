/* ==========================================================================
   EXTRATOR — lê o PDF no navegador (PDF.js) e encontra os campos no texto.
   Os padrões ficam em config-regras.js → "extracao" e "validacao".
   ========================================================================== */
(function (raiz) {
  "use strict";

  const CAMPOS = [
    "validade", "proprietario", "compromissario", "logradouro", "numero", "numeroAntigo",
    "lote", "quadra", "complemento", "loteamento", "area", "fracao", "inscricao"
  ];

  /* ---------- Leitura do PDF ---------- */
  async function lerPdf(arquivo) {
    const dados = new Uint8Array(await arquivo.arrayBuffer());
    const pdf = await raiz.pdfjsLib.getDocument({ data: dados, isEvalSupported: false }).promise;
    const linhas = [];
    try {
      for (let n = 1; n <= pdf.numPages; n++) {
        const pagina = await pdf.getPage(n);
        const conteudo = await pagina.getTextContent();
        linhas.push(...montarLinhas(conteudo.items));
        pagina.cleanup();
      }
    } finally {
      pdf.destroy();
    }
    return linhas.join("\n");
  }

  /* Remonta as linhas pela posição de cada pedaço de texto na página. */
  function montarLinhas(itens) {
    const lista = itens
      .filter(i => typeof i.str === "string" && i.str.length)
      .map(i => ({
        str: i.str,
        x: i.transform[4],
        y: i.transform[5],
        w: i.width || 0,
        h: Math.hypot(i.transform[2], i.transform[3]) || 10
      }))
      .sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x));

    const linhas = [];
    let atual = null;
    for (const it of lista) {
      if (!atual || Math.abs(it.y - atual.y) > Math.max(2, it.h * 0.4)) {
        atual = { y: it.y, itens: [] };
        linhas.push(atual);
      }
      atual.itens.push(it);
    }
    return linhas.map(l => {
      l.itens.sort((a, b) => a.x - b.x);
      let s = "", fim = null;
      for (const it of l.itens) {
        const separado = fim !== null && it.x - fim > it.h * 0.12;
        if (separado && !/\s$/.test(s) && !/^\s/.test(it.str)) s += " ";
        s += it.str;
        fim = it.x + it.w;
      }
      return s.trim();
    }).filter(Boolean);
  }

  /* ---------- Trava de segurança ---------- */
  function valido(regra, valor) {
    if (!regra) return true;
    if (regra.max && valor.length > regra.max) return false;
    if (regra.formato && !regra.formato.test(valor)) return false;
    if (regra.proibido && regra.proibido.test(valor)) return false;
    return true;
  }

  /* ---------- Busca dos campos ---------- */
  function extrair(texto, cfg) {
    const plano = String(texto || "").normalize("NFC").replace(/\s+/g, " ").trim();
    const E = cfg.extracao, V = cfg.validacao || {};
    const bruto = {}, rejeitados = [];

    CAMPOS.forEach(campo => {
      let valor = null, rejeitado = false;
      for (const re of E[campo] || []) {
        const m = plano.match(re);
        if (!m) continue;
        const v = (m[1] !== undefined ? m[1] : m[0]).trim().replace(/[,;]+$/, "").trim();
        if (v === "") { valor = null; rejeitado = false; break; }      // campo vazio na certidão
        if (valido(V[campo], v)) { valor = v; rejeitado = false; break; }
        rejeitado = true;                                              // tenta o próximo padrão
      }
      bruto[campo] = valor;
      if (rejeitado) rejeitados.push(campo);
    });

    return {
      plano,
      temTexto: plano.replace(/[^A-Za-zÀ-ú0-9]/g, "").length > 30,
      ehCertidao: (E.documento || []).some(re => re.test(plano)),
      bruto,
      rejeitados
    };
  }

  const api = { lerPdf, montarLinhas, extrair, CAMPOS };
  raiz.Extrator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
