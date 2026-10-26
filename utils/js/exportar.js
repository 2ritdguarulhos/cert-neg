/* ==========================================================================
   EXPORTAR — gera o documento da certidão em .rtf ou .odt, sem bibliotecas.

   Usa o modelo de utils/js/modelo-certidao.js (gerado a partir de
   ferramentas/modelo-original.odt). No lugar do bloco que vai de
   <INSERÇÃO DA DESCRIÇÃO> até </TROCA_73_77> entram, nesta ordem:
       linha em branco
       A) ...                       (texto gerado)
       linha em branco
       B) ...
       linha em branco
       CERTIFICA MAIS ...           (opção 73 ou 77)
   Fonte, negrito, margens e o restante do documento vêm do próprio modelo.
   No texto, **assim** = negrito.
   ========================================================================== */
(function (raiz) {
  "use strict";

  const MIME = {
    rtf: "application/rtf",
    odt: "application/vnd.oasis.opendocument.text"
  };

  /* ---------- **negrito** → trechos ---------- */
  function trechos(linha) {
    return String(linha).split("**")
      .map((t, i) => ({ t, negrito: i % 2 === 1 }))
      .filter(r => r.t !== "");
  }

  /* Lista de parágrafos que substitui o bloco do modelo. */
  function paragrafosDoBloco(textoFormatado, textoTroca) {
    const lista = [{ vazio: true }];
    String(textoFormatado).replace(/\r\n?/g, "\n").split("\n").forEach(l => {
      lista.push(l.trim() === "" ? { vazio: true } : { tipo: "descricao", trechos: trechos(l) });
    });
    lista.push({ vazio: true });
    lista.push({ tipo: "troca", trechos: trechos(textoTroca) });
    return lista;
  }

  /* ======================================================================
     ODT
     ====================================================================== */
  const xml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // Espaços repetidos precisam de <text:s/> no ODT para não sumirem
  const textoOdt = s => xml(s).replace(/ {2,}/g, m => " <text:s text:c=\"" + (m.length - 1) + "\"/>");

  function blocoOdt(paragrafos, E) {
    const span = r => {
      const interno = '<text:span text:style-name="' + xml(r.negrito ? E.negrito : E.normal) + '">' + textoOdt(r.t) + "</text:span>";
      return E.envoltorio ? '<text:span text:style-name="' + xml(E.envoltorio) + '">' + interno + "</text:span>" : interno;
    };
    return paragrafos.map(p => p.vazio
      ? '<text:p text:style-name="' + xml(E.paragrafoVazio) + '"/>'
      : '<text:p text:style-name="' + xml(p.tipo === "troca" ? E.paragrafoTroca : E.paragrafo) + '">' + p.trechos.map(span).join("") + "</text:p>"
    ).join("");
  }

  function base64ParaBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function gerarOdt(paragrafos, modelo) {
    const arquivos = modelo.odt.map(([nome, conteudo]) => {
      if (conteudo && conteudo.b64) return [nome, base64ParaBytes(conteudo.b64)];
      if (nome === "content.xml") {
        if (!conteudo.includes(modelo.tokenOdt)) throw new Error("Marcador do modelo não encontrado (content.xml).");
        return [nome, conteudo.replace(modelo.tokenOdt, () => blocoOdt(paragrafos, modelo.estilos))];
      }
      return [nome, conteudo];
    });
    return zipar(arquivos);
  }

  /* ======================================================================
     RTF
     ====================================================================== */
  function escaparRtf(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i], c = s.charCodeAt(i);
      if (ch === "\\" || ch === "{" || ch === "}") out += "\\" + ch;
      else if (ch === "\t") out += "\\tab ";
      else if (c < 128) out += ch;
      else out += "\\u" + (c > 32767 ? c - 65536 : c) + "?";   // acentos, “ ”, ², º etc.
    }
    return out;
  }

  function gerarRtf(paragrafos, modelo) {
    if (!modelo.rtf.includes(modelo.tokenRtf)) throw new Error("Marcador do modelo não encontrado (.rtf).");
    // O marcador fica dentro de um parágrafo do modelo (mesma fonte e margens);
    // cada \par abre um novo parágrafo com a mesma formatação.
    const bloco = paragrafos.map(p => p.vazio
      ? ""
      : p.trechos.map(r => (r.negrito ? "\\b " : "\\b0 ") + escaparRtf(r.t)).join("") + "\\b0 "
    ).join("\\par ");
    return modelo.rtf.replace(modelo.tokenRtf, () => bloco);
  }

  /* ======================================================================
     ZIP mínimo (sem compressão) — o .odt é um pacote ZIP
     ====================================================================== */
  const TABELA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipar(arquivos, data) {
    const enc = new TextEncoder();
    const d = data || new Date();
    const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const locais = [], centrais = [];
    let deslocamento = 0;

    for (const [nome, conteudo] of arquivos) {
      const n = enc.encode(nome);
      const dados = typeof conteudo === "string" ? enc.encode(conteudo) : conteudo;
      const crc = crc32(dados);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);   // assinatura
      local.setUint16(4, 10, true);           // versão necessária
      local.setUint16(6, 0, true);            // flags
      local.setUint16(8, 0, true);            // método: sem compressão
      local.setUint16(10, hora, true);
      local.setUint16(12, dia, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, dados.length, true);
      local.setUint32(22, dados.length, true);
      local.setUint16(26, n.length, true);
      local.setUint16(28, 0, true);           // sem campo extra
      locais.push(new Uint8Array(local.buffer), n, dados);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);         // versão que criou
      central.setUint16(6, 10, true);         // versão necessária
      central.setUint16(8, 0, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, hora, true);
      central.setUint16(14, dia, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, dados.length, true);
      central.setUint32(24, dados.length, true);
      central.setUint16(28, n.length, true);
      central.setUint16(30, 0, true);
      central.setUint16(32, 0, true);
      central.setUint16(34, 0, true);
      central.setUint16(36, 0, true);
      central.setUint32(38, 0, true);
      central.setUint32(42, deslocamento, true);
      centrais.push(new Uint8Array(central.buffer), n);

      deslocamento += 30 + n.length + dados.length;
    }

    const tamCentral = centrais.reduce((s, p) => s + p.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true);
    fim.setUint16(8, arquivos.length, true);
    fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamCentral, true);
    fim.setUint32(16, deslocamento, true);

    const partes = [...locais, ...centrais, new Uint8Array(fim.buffer)];
    const total = partes.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) { out.set(p, pos); pos += p.length; }
    return out;
  }

  /* ======================================================================
     API
     ====================================================================== */
  function gerar(textoFormatado, textoTroca, formato, modelo) {
    if (!modelo) throw new Error("Modelo da certidão não carregado.");
    const paragrafos = paragrafosDoBloco(textoFormatado, textoTroca);
    if (formato === "odt") return new Blob([gerarOdt(paragrafos, modelo)], { type: MIME.odt });
    return new Blob([gerarRtf(paragrafos, modelo)], { type: MIME.rtf });
  }

  function nomeArquivo(inscricao, formato, cfg) {
    const X = cfg.exportacao;
    const hoje = new Date();
    const data = hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0") + "-" + String(hoje.getDate()).padStart(2, "0");
    const insc = String(inscricao || "").trim();
    const base = (insc ? X.nomeArquivo : X.nomeArquivoSemInscricao)
      .replace("{inscricao}", insc).replace("{data}", data);
    return base.replace(/[^\w.\-]+/g, "_") + "." + formato;
  }

  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const api = { gerar, gerarOdt, gerarRtf, paragrafosDoBloco, trechos, nomeArquivo, baixar, zipar, crc32, MIME };
  raiz.Exportar = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
