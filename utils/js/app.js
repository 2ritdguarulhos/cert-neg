/* ==========================================================================
   APP — liga a tela ao extrator, ao motor de regras e à exportação.
   O leitor de PDF (PDF.js) e o modelo da certidão só são carregados quando
   precisam ser usados, para a página abrir rápido.
   ========================================================================== */
(function () {
  "use strict";

  const C = window.CONFIG_REGRAS;
  const $ = id => document.getElementById(id);
  const ANO = new Date().getFullYear();
  const PDFJS = "utils/vendor/pdfjs/";
  const MODELO = "utils/js/modelo-certidao.js";
  const CHAVE_FORMATO = "certidao.formato";

  if (!C || !window.Extrator || !window.Motor || !window.Exportar) {
    document.body.innerHTML = '<p style="padding:32px;font-family:sans-serif">Arquivos da pasta <b>utils/js</b> não encontrados. Mantenha a pasta <b>utils</b> ao lado do index.html.</p>';
    return;
  }

  const inputs = Array.from(document.querySelectorAll(".fields input"));
  const opcoesFormato = Array.from(document.querySelectorAll('input[name="formato"]'));
  const opcoesTroca = Array.from(document.querySelectorAll('input[name="troca"]'));
  let meta = null;            // { ehCertidao, fraseValidade, alertas } da última leitura
  let ultimo = { texto: "", formatado: "", bloqueado: true };

  /* ---------- utilidades ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const negritoHtml = s => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const setState = s => (document.body.dataset.state = s);
  const guardar = {
    ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento: ignora */ } }
  };

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function lerCampos() {
    const d = {};
    inputs.forEach(i => (d[i.dataset.k] = i.value.trim() === "" ? null : i.value.trim()));
    return d;
  }
  function preencherCampos(d) {
    inputs.forEach(i => { const v = d[i.dataset.k]; i.value = v == null ? "" : v; });
  }
  function iniciais(nome) {
    const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
    return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() : "—";
  }
  function habilitarSaida(ativo) {
    $("btnCopiar").disabled = !ativo;
    $("btnBaixar").disabled = !ativo;
  }

  /* ---------- carregamento sob demanda ---------- */
  function carregarScript(src) {
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = () => erro(new Error("Não foi possível carregar " + src + "."));
      document.head.appendChild(s);
    });
  }

  let pdfjsPronto = null;
  function carregarPdfJs() {
    if (!pdfjsPronto) {
      // Aberto com dois cliques (file://) o navegador bloqueia "workers":
      // o leitor roda na própria página. Num servidor, usa worker (mais rápido).
      const local = location.protocol === "file:";
      pdfjsPronto = (local ? carregarScript(PDFJS + "pdf.worker.min.js") : Promise.resolve())
        .then(() => carregarScript(PDFJS + "pdf.min.js"))
        .then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; });
      pdfjsPronto.catch(() => (pdfjsPronto = null));
    }
    return pdfjsPronto;
  }

  let modeloPronto = null;
  function carregarModelo() {
    if (window.MODELO_CERTIDAO) return Promise.resolve(window.MODELO_CERTIDAO);
    if (!modeloPronto) {
      modeloPronto = carregarScript(MODELO).then(() => {
        if (!window.MODELO_CERTIDAO) throw new Error(C.mensagens.modeloAusente);
        return window.MODELO_CERTIDAO;
      });
      modeloPronto.catch(() => (modeloPronto = null));
    }
    return modeloPronto;
  }

  /* ---------- renderização ---------- */
  const MAPA_FALTANDO = { area: "area_m2", logradouro: "logradouro", loteamento: "loteamento", inscricao: "inscricao_cadastral", proprietario: "proprietario" };
  const ICONE = { ok: "✓", info: "i", aviso: "!", erro: "!" };

  function render() {
    if (!meta) return;
    const d = lerCampos();
    const r = Motor.aplicarRegras(d, meta, C, ANO);
    const bloqueado = r.status === "bloqueado";
    setState(bloqueado ? "bloqueado" : "pronto");

    // perfil
    $("nomeProp").textContent = d.proprietario || "Proprietário não informado";
    $("avatar").textContent = iniciais(d.proprietario);
    $("inscTopo").textContent = d.inscricao_cadastral ? "Inscrição " + d.inscricao_cadastral : "Inscrição não informada";

    // cartão preto
    const temLote = !Motor.ausente(d.lote, C), temQuadra = !Motor.ausente(d.quadra, C);
    $("sLote").textContent = temLote ? d.lote : "—";
    $("sQuadra").textContent = temQuadra ? String(d.quadra).replace(/^["“”']+|["“”']+$/g, "") : "—";
    $("sArea").textContent = d.area_m2 ? Motor.formatarArea(d.area_m2, C) : "—";
    const f = Motor.lerFracao(d.fracao_ideal);
    const integral = C.regras.fracaoIdeal.valoresIntegrais.includes(f);
    $("meterFill").style.width = (f == null ? 0 : f === 0 ? 100 : Math.min(f, 100)) + "%";
    $("meterFill").classList.toggle("warn", f != null && !integral);
    $("meterLbl").textContent = "Fração ideal · " + (d.fracao_ideal || "não informada") + (integral ? " (imóvel inteiro)" : "");
    $("blockedMsg").textContent = bloqueado ? r.alertas[0].msg : "";

    // selos
    const selos = [];
    if (bloqueado) {
      selos.push(["err", "Bloqueada"]);
    } else {
      selos.push(["ok", "Válida " + ANO]);
      selos.push(["dark", r.modelo === "lote" ? "Modelo: lote e quadra" : "Modelo: uma área"]);
      if (f != null) selos.push([integral ? "ok" : "warn", "Fração " + d.fracao_ideal]);
      const sNum = {
        numeroEAntigo: ["dark", "Nº " + d.numero + " · antigo " + d.numero_antigo],
        soNumero: ["dark", "Nº " + d.numero],
        soAntigo: ["info", "Só nº antigo " + d.numero_antigo],
        nenhum: ["info", "Sem número"]
      }[r.numeracao];
      if (sNum) selos.push(sNum);
    }
    $("selos").innerHTML = selos.map(([c, t]) => `<span class="pill ${c}">${esc(t)}</span>`).join("");

    // verificações
    let lista;
    if (bloqueado) {
      lista = meta.alertas.filter(a => a.msg === C.mensagens.pdfSemTexto)
        .concat([{ nivel: "erro", msg: C.mensagens.bloqueioResumo }]);
    } else {
      lista = r.alertas.slice();
      if (r.status === "ok") lista.unshift({ nivel: "ok", msg: C.mensagens.ok });
    }
    $("alertas").innerHTML = lista.map(a =>
      `<div class="alert ${a.nivel}"><div class="ic">${ICONE[a.nivel] || "!"}</div><p>${esc(a.msg)}</p></div>`).join("");

    // campos obrigatórios faltando
    const falt = (r.faltando || []).map(k => MAPA_FALTANDO[k]);
    inputs.forEach(i => i.classList.toggle("miss", falt.includes(i.dataset.k)));

    // texto final (na tela com negrito, igual ao download)
    ultimo = { texto: r.texto, formatado: r.textoFormatado, bloqueado };
    if (bloqueado) {
      $("texto").innerHTML = '<span class="empty">Texto não gerado — veja o motivo acima.</span>';
    } else {
      const marc = esc(C.regras.marcadorCampoFaltando);
      const att = negritoHtml(esc(C.regras.fracaoIdeal.mensagemNoTexto));
      $("texto").innerHTML = negritoHtml(esc(r.textoFormatado))
        .split(marc).join(`<mark>${marc}</mark>`)
        .replace(att, `<span class="att">${att}</span>`);
    }
    habilitarSaida(!bloqueado && !!r.texto);
  }

  function limparTroca() { opcoesTroca.forEach(o => (o.checked = false)); }

  function limpar() {
    meta = null;
    ultimo = { texto: "", formatado: "", bloqueado: true };
    inputs.forEach(i => { i.value = ""; i.classList.remove("miss"); });
    limparTroca();
    $("fileInput").value = "";
    $("fileName").textContent = "";
    $("textoBruto").textContent = "Nenhum PDF lido ainda.";
    $("nomeProp").textContent = "Nenhuma certidão";
    $("avatar").textContent = "—";
    $("inscTopo").textContent = "Envie um PDF para começar";
    ["sLote", "sQuadra", "sArea"].forEach(id => ($(id).textContent = "—"));
    $("meterFill").style.width = "0";
    $("meterFill").classList.remove("warn");
    $("meterLbl").textContent = "Fração ideal · —";
    $("blockedMsg").textContent = "";
    $("selos").innerHTML = "";
    $("alertas").innerHTML = '<div class="alert vazio"><div class="ic">·</div><p>As regras são conferidas depois que o PDF for lido.</p></div>';
    $("texto").innerHTML = '<span class="empty">O texto da certidão negativa aparece aqui.</span>';
    habilitarSaida(false);
    setState("vazio");
  }

  /* ---------- texto do PDF → campos → regras ---------- */
  function processarTexto(texto) {
    const x = Extrator.extrair(texto, C);
    $("textoBruto").textContent = x.plano || "(nenhum texto encontrado no PDF)";
    limparTroca();                                   // [A8] cada certidão pede nova escolha 73/77
    if (!x.temTexto) {
      meta = { ehCertidao: null, fraseValidade: null, alertas: [{ nivel: "aviso", msg: C.mensagens.pdfSemTexto }] };
      preencherCampos({});
    } else {
      const n = Motor.normalizar(x.bruto, C, x.rejeitados);
      meta = { ehCertidao: x.ehCertidao, fraseValidade: !!x.bruto.validade, alertas: n.alertas };
      preencherCampos(n.campos);
    }
    render();
  }

  async function processarArquivo(arquivo) {
    if (!arquivo) return;
    if (arquivo.type !== "application/pdf" && !/\.pdf$/i.test(arquivo.name)) {
      toast("Envie um arquivo PDF.");
      return;
    }
    $("fileName").textContent = arquivo.name + " · lendo…";
    setState("processando");
    try {
      await carregarPdfJs();
      const texto = await Extrator.lerPdf(arquivo);
      $("fileName").textContent = arquivo.name;
      processarTexto(texto);
    } catch (e) {
      const msg = e && e.name === "PasswordException" ? "O PDF está protegido por senha."
        : e && e.name === "InvalidPDFException" ? "O arquivo está corrompido ou não é um PDF válido."
        : (e && e.message) || "Não foi possível ler o PDF.";
      $("fileName").textContent = arquivo.name;
      setState(meta ? "pronto" : "vazio");
      $("alertas").innerHTML = `<div class="alert erro"><div class="ic">!</div><p>${esc(msg)}</p></div>`;
      toast(msg);
    }
  }

  /* ---------- download: formato + 73/77 ---------- */
  const marcado = lista => (lista.find(o => o.checked) || {}).value || null;

  (function iniciarOpcoes() {
    const salvo = guardar.ler(CHAVE_FORMATO);
    const inicial = C.exportacao.formatos.includes(salvo) ? salvo : C.exportacao.formatoPadrao;
    opcoesFormato.forEach(o => (o.checked = o.value === inicial));
    opcoesFormato.forEach(o => o.addEventListener("change", () => guardar.gravar(CHAVE_FORMATO, o.value)));
    // dicas (datas) vindas da configuração
    Object.entries(C.exportacao.troca.opcoes).forEach(([id, op]) => { const l = $("op" + id); if (l) l.title = op.dica; });
    opcoesTroca.forEach(o => o.addEventListener("change", () => $("segTroca").classList.remove("alerta")));
  })();

  function pedirTroca() {
    const seg = $("segTroca");
    seg.classList.remove("alerta");
    void seg.offsetWidth;            // reinicia a animação
    seg.classList.add("alerta");
    opcoesTroca[0].focus();
    toast(C.mensagens.escolherTroca);
  }

  $("btnBaixar").addEventListener("click", async () => {
    if (ultimo.bloqueado || !ultimo.texto) return;
    const troca = marcado(opcoesTroca);
    if (C.exportacao.troca.exigirEscolha && !troca) { pedirTroca(); return; }
    const formato = marcado(opcoesFormato) || C.exportacao.formatoPadrao;
    const opcao = C.exportacao.troca.opcoes[troca || Object.keys(C.exportacao.troca.opcoes)[0]];
    const nome = Exportar.nomeArquivo(lerCampos().inscricao_cadastral, formato, C);
    try {
      const modelo = await carregarModelo();
      Exportar.baixar(Exportar.gerar(ultimo.formatado, opcao.texto, formato, modelo), nome);
      toast(ultimo.texto.includes(C.regras.marcadorCampoFaltando)
        ? C.mensagens.downloadComPendencia
        : C.mensagens.downloadOk.replace("{arquivo}", nome));
    } catch (e) {
      toast((e && e.message) || "Não foi possível gerar o arquivo.");
    }
  });

  /* ---------- eventos ---------- */
  const drop = $("drop");
  $("fileInput").addEventListener("change", e => processarArquivo(e.target.files[0]));
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => processarArquivo(e.dataTransfer.files[0]));
  // Evita que o navegador abra o PDF se ele for solto fora da área
  window.addEventListener("dragover", e => e.preventDefault());
  window.addEventListener("drop", e => e.preventDefault());
  // Pré-carrega o leitor quando o usuário se aproxima da área de envio
  ["pointerenter", "focusin", "dragenter", "touchstart"].forEach(ev =>
    drop.addEventListener(ev, () => carregarPdfJs().catch(() => {}), { once: true, passive: true }));
  // Pré-carrega o modelo quando o usuário se aproxima da barra de download
  ["pointerenter", "focusin", "touchstart"].forEach(ev =>
    $("btnBaixar").parentElement.addEventListener(ev, () => carregarModelo().catch(() => {}), { once: true, passive: true }));

  let espera;
  inputs.forEach(i => i.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(render, 80); }));

  $("btnCopiar").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(ultimo.texto);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = ultimo.texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast("Texto copiado.");
  });
  $("btnNova").addEventListener("click", () => { limpar(); window.scrollTo({ top: 0, behavior: "smooth" }); });

  /* ---------- exemplo: mesmo caminho de um PDF real (sem número, com CD) ---------- */
  $("btnExemplo").addEventListener("click", () => {
    $("fileName").textContent = "Exemplo (nenhum PDF enviado)";
    processarTexto(
      "PREFEITURA DE GUARULHOS SECRETARIA DA FAZENDA CERTIDÃO DE VALOR VENAL " +
      "A Secretaria da Fazenda da Prefeitura de Guarulhos, na forma da lei, certifica que o imóvel cadastrado em nome de MARCIAL LOURENCO SERODIO, " +
      "tendo como compromissário NÃO HÁ, referente a um terreno localizado na RUA CANA VERDE, Nº Antigo NÃO HÁ, lote(s) 6, " +
      "quadra 67 Complemento NÃO HÁ, Bairro/Loteamento CD SERODIO, com área de 625,00 m2 (SEISCENTOS E VINTE E CINCO METROS QUADRADOS), " +
      "E FRAÇÃO IDEAL DE 0,00 % E A UM PRÉDIO DO TIPO DE EDIFICAÇÃO , E UTILIZADO PARA FINS , " +
      "INSCRITO NO CADASTRO IMOBILIÁRIO sob o nº 091.34.67.0095.00.000, possui valor venal ... " +
      "Esta certidão tem validade para todo o exercício - " + ANO + "."
    );
  });

  $("footRegras").textContent = "Regras v" + C.versao + " · ano vigente " + ANO;
  if (location.hash === "#exemplo") $("btnExemplo").click();
})();
