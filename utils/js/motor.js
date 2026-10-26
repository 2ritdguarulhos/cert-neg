/* ==========================================================================
   MOTOR DE REGRAS — normaliza os campos e monta o texto final.
   Funções puras (não mexem na tela), testáveis isoladamente.
     normalizar()    dados brutos do PDF → campos editáveis + avisos
     aplicarRegras() campos → regras R1 a R8 → texto final
   ========================================================================== */
(function (raiz) {
  "use strict";

  /* ---------- utilidades ---------- */
  const preencher = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ""));
  const semAcento = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const chave = s => semAcento(s).trim().toUpperCase();
  const vazio = v => v === null || v === undefined || String(v).trim() === "";
  const ROMANO = /^(?=[IVXLC]+$)(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;
  const limparAspas = v => String(v ?? "").trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "");

  function ausente(v, cfg) {
    return vazio(v) || cfg.regras.ausencia.map(chave).includes(chave(v));
  }
  function ausenteNumero(v, cfg) {
    return ausente(v, cfg) || cfg.regras.ausenciaNumero.map(chave).includes(chave(v));
  }
  function aviso(lista, msg) { lista.push({ nivel: "aviso", msg }); }
  function info(lista, msg) { lista.push({ nivel: "info", msg }); }

  /* ---------- R5 + R6: abreviações ---------- */
  function expandirAbreviacoes(texto, campo, cfg, alertas) {
    if (vazio(texto)) return texto;
    const A = cfg.regras.abreviacoes, M = cfg.mensagens;
    const tabela = {};
    Object.keys(A.tabela).forEach(k => (tabela[chave(k)] = A.tabela[k]));
    const primeira = A.somentePrimeiraPalavra.map(chave);
    const ambLot = A.ambiguasNoLoteamento.map(chave);
    const fora = A.conhecidasForaDaTabela.map(chave);

    return String(texto).trim().split(/\s+/).map((tok, i) => {
      const semPonto = tok.replace(/\.$/, "");
      const k = chave(semPonto);
      if (tabela[k]) {
        if (primeira.includes(k) && i > 0) {
          aviso(alertas, preencher(M.alertaAbrevAmbigua, { token: tok, campo, motivo: k === "V" ? "pode ser numeral romano" : "só é expandida no início do nome" }));
          return tok;
        }
        if (campo === "loteamento" && ambLot.includes(k)) {
          aviso(alertas, preencher(M.alertaAbrevAmbigua, { token: tok, campo, motivo: "pode ser Estrada ou Estância" }));
          return tok;
        }
        return tabela[k];
      }
      const pareceAbrev = A.avisarPalavraComPonto && /\.$/.test(tok) && semPonto.length <= 6 && !/\d/.test(semPonto);
      if (fora.includes(k) || pareceAbrev) {
        aviso(alertas, preencher(M.alertaAbrevForaTabela, { token: tok, campo }));
      }
      return tok;
    }).join(" ");
  }

  /* ---------- F1: formatação ---------- */
  function emTitulo(texto, cfg) {
    if (vazio(texto)) return texto;
    const min = cfg.regras.formatacao.palavrasMinusculas;
    const ps = String(texto).toLocaleLowerCase("pt-BR").split(/\s+/);
    return ps.map((w, i) => {
      if (i > 0 && w.length === 1 && i === ps.length - 1) return w.toLocaleUpperCase("pt-BR"); // "Rua E"
      if (i > 0 && min.includes(w)) return w;
      if (i > 0 && ROMANO.test(w)) return w.toUpperCase();
      return w.split("-").map(p => p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)).join("-");
    }).join(" ");
  }

  function formatarArea(v, cfg) {
    if (vazio(v)) return "";
    const s = String(v).replace(/m\s*[²2]/gi, "").trim();
    const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
    const casas = cfg.regras.formatacao.casasDecimaisArea;
    return isNaN(n) ? s + "m²" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "m²";
  }

  function lerFracao(v) {
    if (vazio(v)) return null;
    const n = parseFloat(String(v).replace("%", "").replace(/\./g, "").replace(",", ".").trim());
    return isNaN(n) ? null : n;
  }

  /* ---------- R4 + R7 + R8: numeração ---------- */
  function montarNumeracao(numero, antigo, cfg) {
    const N = cfg.regras.numeracao;
    const temNumero = !ausenteNumero(numero, cfg);
    const temAntigo = !ausente(antigo, cfg);
    const caso = temNumero && temAntigo ? "numeroEAntigo" : temNumero ? "soNumero" : temAntigo ? "soAntigo" : "nenhum";
    return {
      caso,
      texto: preencher(N[caso], { numero: String(numero ?? "").trim(), antigo: String(antigo ?? "").trim() })
    };
  }

  /* ========================================================================
     ETAPA 1 — dados brutos do PDF → campos editáveis
     ======================================================================== */
  function normalizar(b, cfg, rejeitados) {
    const R = cfg.regras, M = cfg.mensagens, alertas = [];
    const up = v => (vazio(v) ? null : String(v).trim().toLocaleUpperCase("pt-BR"));
    const limpo = v => (ausente(v, cfg) ? null : String(v).trim());

    let logradouro = expandirAbreviacoes(limpo(b.logradouro), "logradouro", cfg, alertas);
    if (R.formatacao.logradouro === "titulo") logradouro = emTitulo(logradouro, cfg);

    let loteamento = expandirAbreviacoes(limpo(b.loteamento), "loteamento", cfg, alertas);
    if (R.formatacao.loteamento === "maiusculas") loteamento = up(loteamento);

    const proprietario = R.formatacao.proprietario === "maiusculas" ? up(limpo(b.proprietario)) : limpo(b.proprietario);

    // Avisos [ADC A6]
    if (R.avisos.compromissario && !ausente(b.compromissario, cfg)) {
      aviso(alertas, preencher(M.alertaCompromissario, { nome: up(b.compromissario) }));
    }
    if (R.avisos.complemento && !ausente(b.complemento, cfg)) {
      aviso(alertas, preencher(M.alertaComplemento, { valor: String(b.complemento).trim() }));
    }
    const lote = limpo(b.lote);
    if (lote) {
      // "P371 P379" = dois lotes; "FNE 4" ou "P/ 9" = um lote só
      if (R.avisos.maisDeUmLote && lote.split(/\s+|\s*[,;]\s*/).filter(t => /\d/.test(t)).length > 1) {
        aviso(alertas, preencher(M.alertaMaisDeUmLote, { valor: lote }));
      } else if (R.avisos.loteParte && /(^|\s)P\s*\//i.test(lote)) {
        aviso(alertas, preencher(M.alertaLoteParte, { valor: lote }));
      }
    }

    // Campos recusados pela trava de segurança [ADC A4]
    const NOMES = {
      validade: "Validade", proprietario: "Proprietário", compromissario: "Compromissário",
      logradouro: "Logradouro", numero: "Número", numeroAntigo: "Número antigo", lote: "Lote",
      quadra: "Quadra", complemento: "Complemento", loteamento: "Loteamento", area: "Área",
      fracao: "Fração ideal", inscricao: "Inscrição cadastral"
    };
    (rejeitados || []).forEach(c => aviso(alertas, preencher(M.alertaCampoRejeitado, { campo: NOMES[c] || c })));

    return {
      alertas,
      campos: {
        lote,
        quadra: ausente(b.quadra, cfg) ? null : limparAspas(b.quadra),
        area_m2: limpo(b.area),
        fracao_ideal: ausente(b.fracao, cfg) ? null : String(b.fracao).trim() + "%",
        logradouro: vazio(logradouro) ? null : logradouro,
        numero: ausenteNumero(b.numero, cfg) ? null : String(b.numero).trim(),
        numero_antigo: limpo(b.numeroAntigo),
        loteamento: vazio(loteamento) ? null : loteamento,
        inscricao_cadastral: limpo(b.inscricao),
        proprietario,
        ano_validade: limpo(b.validade)
      }
    };
  }

  /* ========================================================================
     ETAPA 2 — campos → regras → texto final
     meta = { ehCertidao, fraseValidade, alertas }
     ======================================================================== */
  function aplicarRegras(d, meta, cfg, anoVigente) {
    const R = cfg.regras, M = cfg.mensagens, alertas = [];
    const bloqueio = msg => ({ status: "bloqueado", texto: "", alertas: [{ nivel: "erro", msg }], faltando: [], modelo: null, numeracao: null });

    // A3 — documento
    if (R.validade.bloquearSeOutroDocumento && meta.ehCertidao === false) return bloqueio(M.bloqueioOutroDocumento);
    // R1 + A2 — validade
    if (R.validade.bloquearSeFraseAusente && meta.fraseValidade === false) return bloqueio(M.bloqueioFraseAusente);
    const ano = parseInt(String(d.ano_validade ?? "").replace(/\D/g, ""), 10);
    if (isNaN(ano)) return bloqueio(M.bloqueioAnoAusente);
    if (ano !== anoVigente) return bloqueio(preencher(M.bloqueioValidade, { anoCertidao: ano, anoVigente }));

    // R3 + A5 — quadra e lote
    const semLote = ausente(d.lote, cfg), semQuadra = ausente(d.quadra, cfg);
    const usarLote = !semLote && !semQuadra;
    if (semLote !== semQuadra) aviso(alertas, M.alertaApenasUmAusente);

    // R4 + R7 + R8 — numeração
    const num = montarNumeracao(d.numero, d.numero_antigo, cfg);
    if (R.avisos.numeracao && num.caso === "nenhum") info(alertas, M.infoSemNumero);
    if (R.avisos.numeracao && num.caso === "soAntigo") info(alertas, M.infoSoAntigo);

    // R2 — fração ideal
    let alertaFracao = "";
    const fracao = lerFracao(d.fracao_ideal);
    if (vazio(d.fracao_ideal)) {
      aviso(alertas, M.alertaFracaoAusente);
    } else if (fracao === null || !R.fracaoIdeal.valoresIntegrais.includes(fracao)) {
      alertaFracao = " " + R.fracaoIdeal.mensagemNoTexto;
      aviso(alertas, preencher(M.alertaFracao, { fracao: String(d.fracao_ideal).trim() }));
    }

    // A6 — campos obrigatórios
    const MARC = R.marcadorCampoFaltando;
    const NOMES = { area: "Área", logradouro: "Logradouro", loteamento: "Loteamento", inscricao: "Inscrição cadastral", proprietario: "Proprietário" };
    const v = {
      lote: String(d.lote ?? "").trim(),
      quadra: limparAspas(d.quadra),
      area: formatarArea(d.area_m2, cfg),
      logradouro: String(d.logradouro ?? "").trim(),
      loteamento: String(d.loteamento ?? "").trim(),
      inscricao: String(d.inscricao_cadastral ?? "").trim(),
      proprietario: String(d.proprietario ?? "").trim()
    };
    const faltando = [];
    R.camposObrigatorios.forEach(k => {
      if (ausente(v[k], cfg)) {
        v[k] = MARC; faltando.push(k);
        aviso(alertas, preencher(M.alertaCampoFaltando, { campo: NOMES[k] || k }));
      }
    });

    // R5 — conferência final: abreviação da tabela que ficou sem expandir
    const A = R.abreviacoes;
    const tabela = Object.keys(A.tabela).map(chave);
    const primeira = A.somentePrimeiraPalavra.map(chave);
    const ambLot = A.ambiguasNoLoteamento.map(chave);
    ["logradouro", "loteamento"].forEach(k => {
      if (v[k] === MARC) return;
      v[k].split(/\s+/).forEach((tok, i) => {
        const t = chave(tok.replace(/\.$/, ""));
        if (!tabela.includes(t)) return;
        if (i > 0 && primeira.includes(t)) return;
        if (k === "loteamento" && ambLot.includes(t)) return;
        aviso(alertas, preencher(M.alertaAbreviacaoRestante, { token: tok, campo: k }));
      });
    });

    // Avisos da leitura do PDF (normalizar)
    (meta.alertas || []).forEach(a => alertas.push(a));

    const modelo = usarLote ? cfg.modelos.comQuadraELote : cfg.modelos.semQuadraELote;
    return {
      status: alertas.some(a => a.nivel === "aviso") ? "revisar" : "ok",
      texto: preencher(modelo, { ...v, numeracao: num.texto, alertaFracao }),
      alertas,
      faltando,
      modelo: usarLote ? "lote" : "area",
      numeracao: num.caso
    };
  }

  const api = { normalizar, aplicarRegras, montarNumeracao, expandirAbreviacoes, emTitulo, formatarArea, lerFracao, ausente, ausenteNumero };
  raiz.Motor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
