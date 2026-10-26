/* ==========================================================================
   CONFIGURAÇÃO DE REGRAS — Certidões Negativas a partir da Certidão de Valor Venal
   Versão 3.3.1 · 26/10/2026 · sem IA: regras fixas, tudo dentro do navegador.
   ==========================================================================

   Este é o ÚNICO arquivo que você precisa editar para mudar regras.
   Depois de salvar, recarregue a página (F5).

   Índice
     1. extracao    — onde cada dado é encontrado no texto do PDF
     2. validacao   — trava de segurança: o que cada campo pode conter
     3. regras      — regras do negativa-text.md + regras adicionais
     4. modelos     — o texto final A) e B)
     5. mensagens   — avisos mostrados na tela
     6. exportacao  — download no modelo da certidão (.rtf ou .odt, 73 ou 77)

   Origem de cada regra:
     [MD]  = regra do arquivo negativa-text.md
     [USR] = regra pedida depois do .md
     [ADC] = regra adicional de segurança
     [INF] = formatação deduzida dos exemplos

   LISTA COMPLETA DE REGRAS
     [MD]  R1  Validade: precisa ter "Esta certidão tem validade para todo o
               exercício - <ANO>" com o ano vigente. Senão, não gera o texto.
     [MD]  R2  Fração ideal 100% ou 0,00% = normal. Outro valor = inclui
               "ATENÇÃO. Podem haver mais inscrições cadastrais para serem
               relatadas." logo após o número da inscrição cadastral.
     [MD]  R3  Sem quadra e lote ("NÃO HÁ") = modelo "Uma área de ...".
     [MD]  R4  Número antigo informado = ", antigo 93B" logo após o número.
               "Antigo NÃO HÁ" = não inclui.
     [MD]  R5  Abreviações no loteamento e no logradouro são escritas por
               extenso (tabela em regras.abreviacoes). Fora da lista ou
               ambígua = mantém e avisa.
     [USR] R6  CD = Cidade.
     [USR] R7  Sem número atual e sem número antigo = a numeração é omitida:
               "localizado na Rua X, no local denominado ...".
     [USR] R8  Só o número antigo informado = mostra só o antigo:
               "localizado na Rua X, antigo 93B, no local denominado ...".
     [USR] R9  Download em .rtf ou .odt, no modelo da certidão
               (ferramentas/modelo-original.odt): o texto gerado entra no
               lugar de <INSERÇÃO DA DESCRIÇÃO> e os marcadores somem.
     [USR] R10 Protocolo e data saem como "[INSERIR]" (o arquivo é só para
               arquivo, não é a certidão final).
     [USR] R11 Seletor 73 / 77: o parágrafo "CERTIFICA MAIS" escolhido entra
               logo abaixo da descrição, no lugar do bloco <TROCA_73_77>.
     [ADC] A1  Ano vigente lido do relógio do computador.
     [ADC] A2  Sem a frase de validade = bloqueia.
     [ADC] A3  Arquivo que não é certidão de valor venal = bloqueia.
     [ADC] A4  Trava de segurança: valor fora do formato esperado fica em
               branco, com aviso (nada que não foi pedido entra no texto).
     [ADC] A5  Só lote OU só quadra = modelo "Uma área" + aviso.
     [ADC] A6  Avisos: compromissário, complemento preenchido, mais de um
               lote, lote "P/" (parte), campo obrigatório faltando.
     [ADC] A7  PDF escaneado (sem texto) = aviso para digitar os dados.
     [ADC] A8  O download só é liberado depois de escolher 73 ou 77; a
               escolha volta a ficar em branco a cada nova certidão.
     [INF] F1  Quadra entre aspas curvas “E-5”; área "250,00m²"; logradouro
               com iniciais maiúsculas; loteamento e proprietário em
               MAIÚSCULAS; acentos mantidos como na certidão.
     [INF] F2  Negrito no download igual ao modelo: rótulos A) e B), "lote",
               "quadra", loteamento, proprietário e "CERTIFICA MAIS".
               Nos modelos de texto, **assim** = negrito.
   ========================================================================== */

window.CONFIG_REGRAS = {
  versao: "3.3.1",
  atualizadoEm: "2026-10-26",

  /* ========================================================================
     1. EXTRAÇÃO
     ------------------------------------------------------------------------
     Parágrafo da certidão de Guarulhos (layout de 2026):
       "... imóvel cadastrado em nome de RODOLPHO MAERZ, tendo como
        compromissário GERALDO ALVES BARBOSA E OUTRO, referente a um terreno
        localizado na ESTRADA GUARULHOS-NAZARE, Nº 2040 Antigo 55, lote(s) 53,
        quadra 8 Complemento NÃO HÁ, Bairro/Loteamento CUMBICA, com área de
        273,00 m2 (...), E FRAÇÃO IDEAL DE 49,94 % E A UM PRÉDIO ...
        INSCRITO NO CADASTRO IMOBILIÁRIO sob o nº 091.64.58.0090.01.000 ...
        Esta certidão tem validade para todo o exercício - 2026."

     - Antes da busca o texto vira uma linha só, com espaços simples.
     - Cada campo tem uma lista de padrões; vale o primeiro que encontrar
       um valor aprovado pela trava de segurança (seção 2).
     - O valor é o trecho entre parênteses ( ) de cada padrão.
     - O painel "Texto lido do PDF" da página mostra o texto exato da busca.
     ======================================================================== */
  extracao: {
    documento: [/CERTID[ÃA]O\s+(?:DE\s+)?VALOR\s+VENAL/i],

    validade: [/validade\s+para\s+todo\s+o\s+exerc[íi]cio\s*[-–—:]?\s*(\d{4})/i],

    proprietario: [
      /cadastrado\s+em\s+nome\s+de\s+(.+?)\s*,\s*tendo\s+como/i,
      /cadastrado\s+em\s+nome\s+de\s+(.+?)\s*,\s*referente/i
    ],

    compromissario: [/tendo\s+como\s+compromiss[áa]rio\s+(.+?)\s*,\s*referente/i],

    // "localizado na ESTRADA GUARULHOS-NAZARE, Nº ..." (ou direto ", lote(s)")
    logradouro: [/localizado\s+n[ao]\s+(.+?)\s*,\s*(?:N\s*(?:[º°]|o\.)|lote\s*\(\s*s\s*\))/i],

    // ", Nº 2040 Antigo 55"  → "2040"   |   ", Nº Antigo 55" → vazio
    numero: [
      /,\s*N\s*(?:[º°]|o\.)\s*(.*?)\s*,?\s*Antigo\b/i,
      /,\s*N\s*(?:[º°]|o\.)\s*([^,]*?)\s*,\s*lote\s*\(/i
    ],

    // "Antigo 55, lote(s)" → "55"   |   "Antigo NÃO HÁ, lote(s)" → ausente
    numeroAntigo: [/\bAntigo\s*(.*?)\s*,\s*lote\s*\(/i],

    lote: [/lote\s*\(\s*s\s*\)\s*(.*?)\s*,\s*quadra\b/i],

    quadra: [
      /\bquadra\s*(.*?)\s*,?\s*Complemento\b/i,
      /\bquadra\s*(.*?)\s*,?\s*Bairro\s*\/\s*Loteamento/i
    ],

    complemento: [/Complemento\s*(.*?)\s*,?\s*Bairro\s*\/\s*Loteamento/i],

    loteamento: [/Bairro\s*\/\s*Loteamento\s+(.+?)\s*,\s*com\s+[áa]rea\b/i],

    area: [/com\s+[áa]rea\s+de\s+([\d.]+(?:,\d+)?)\s*m\s*[²2]/i],

    fracao: [/fra[çc][ãa]o\s+ideal\s+de\s+([\d.]+(?:,\d+)?)\s*%/i],

    inscricao: [
      /Cadastro\s+Imobili[áa]rio\s+sob\s+o\s+n\s*[º°o]\.?\s*(\d[\d.]*\d)/i,
      /\b(\d{3}\.\d{2}\.\d{2}\.\d{4}\.\d{2}\.\d{3})\b/
    ]
  },

  /* ========================================================================
     2. VALIDAÇÃO — trava de segurança [ADC A4]
     ------------------------------------------------------------------------
     Se o valor encontrado não tiver o formato esperado, o campo fica em
     branco e a tela pede para conferir no PDF.
       max      = número máximo de caracteres
       formato  = o valor PRECISA casar com este padrão
       proibido = o valor NÃO pode conter este padrão
     ======================================================================== */
  validacao: {
    validade:       { formato: /^\d{4}$/ },
    proprietario:   { max: 120, proibido: /compromiss|referente|terreno|localizado/i },
    compromissario: { max: 120, proibido: /referente|terreno|localizado/i },
    logradouro:     { max: 80, proibido: /,|\bN\s*[º°]|\blote\s*\(|\bantigo\b|\bquadra\b/i },
    numero:         { max: 15, formato: /^(?:\d[0-9A-Z\/\-]{0,9}|S\/?N[º°]?|N[ÃA]O\s+H[ÁA])$/i },
    numeroAntigo:   { max: 15, proibido: /,|\blote\b|\bquadra\b/i },
    lote:           { max: 20, proibido: /,|\bquadra\b|\bcomplemento\b|\bbairro\b/i },
    quadra:         { max: 15, proibido: /,|\bcomplemento\b|\bbairro\b|\blote\b/i },
    complemento:    { max: 60, proibido: /\bbairro\b|\bloteamento\b/i },
    loteamento:     { max: 60, proibido: /,|\b[áa]rea\b|\bm2\b|fra[çc][ãa]o|pr[ée]dio|cadastro|\bsob\s+o\b|\bN\s*[º°]\s*\d/i },
    area:           { formato: /^\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^\d+(?:,\d+)?$/ },
    fracao:         { formato: /^\d{1,3}(?:,\d+)?$/ },
    inscricao:      { formato: /^\d[\d.]{6,}\d$/ }
  },

  /* ========================================================================
     3. REGRAS
     ======================================================================== */
  regras: {

    /* [MD R1] + [ADC A1, A2, A3] */
    validade: {
      anoVigente: "automatico",
      bloquearSeFraseAusente: true,
      bloquearSeOutroDocumento: true
    },

    /* [MD R2]  (**...** = negrito no download) */
    fracaoIdeal: {
      valoresIntegrais: [100, 0],
      mensagemNoTexto: "**ATENÇÃO.** Podem haver mais inscrições cadastrais para serem relatadas."
    },

    /* [MD R3, R4] Valores que significam "não informado" em qualquer campo */
    ausencia: ["NÃO HÁ", "NAO HA", "NÃO HA", "NAO HÁ", "N/A", "-", "--", ""],

    /* [USR R7] Valores que significam "sem número" no número atual */
    ausenciaNumero: ["0", "00", "000", "0000", "S/N", "SN", "S/Nº", "S/N°", "SEM NUMERO", "SEM NÚMERO"],

    /* [MD R4] + [USR R7, R8] Como a numeração entra no texto.
       Fica entre "localizado na {logradouro}" e ", no local denominado". */
    numeracao: {
      numeroEAntigo: ", número {numero}, antigo {antigo}",
      soNumero:      ", número {numero}",
      soAntigo:      ", antigo {antigo}",
      nenhum:        ""
    },

    /* [MD R5] + [USR R6] Abreviações (logradouro e loteamento) */
    abreviacoes: {
      tabela: {
        "JD": "Jardim",
        "PQ": "Parque",
        "V": "Vila",
        "R": "Rua",
        "AV": "Avenida",
        "CID": "Cidade",
        "CD": "Cidade",          // [USR R6]
        "EST": "Estrada",
        "AL": "Alameda",
        "TV": "Travessa",
        "PÇ": "Praça",
        "PC": "Praça",           // [ADC] mesma abreviação sem cedilha
        "CONJ": "Conjunto",
        "RES": "Residencial",
        "STO": "Santo",
        "STA": "Santa"
      },
      // [ADC] Só expandidas quando são a 1ª palavra. No meio do nome "V" pode
      // ser numeral romano (PARQUE SÃO JOÃO V) e "R" pode ser uma letra.
      somentePrimeiraPalavra: ["V", "R"],
      // [ADC] No loteamento "EST" pode ser Estrada ou Estância: mantém e avisa.
      ambiguasNoLoteamento: ["EST"],
      // [ADC] Abreviações comuns que NÃO estão na tabela: mantém e avisa.
      conhecidasForaDaTabela: [
        "DR", "DRA", "PROF", "PROFA", "CEL", "GAL", "GEN", "ENG", "PE", "PDE", "SR", "SRA",
        "NSA", "MAL", "BRIG", "CAP", "TEN", "SGT", "DEP", "VER", "PREF", "GOV", "PRES",
        "CDE", "VISC", "BAR", "MONS", "CMTE", "ALM", "DES", "MIN", "SEN", "FR",
        "VL", "JARD", "PQE", "LGO", "ROD", "VD", "BC", "ESTR", "CJ", "CH", "SIT", "FAZ"
      ],
      // [ADC] Palavra curta terminada em ponto e fora da tabela: mantém e avisa.
      avisarPalavraComPonto: true
    },

    /* [INF F1] Formatação */
    formatacao: {
      logradouro: "titulo",              // "RUA AUGUSTO HOG" → "Rua Augusto Hog"
      palavrasMinusculas: ["de", "da", "do", "das", "dos", "e"],
      loteamento: "maiusculas",          // "JD PRESIDENTE DUTRA" → "JARDIM PRESIDENTE DUTRA"
      proprietario: "maiusculas",
      casasDecimaisArea: 2               // "273,2" → "273,20m²"
    },

    /* [ADC A6] Campos que precisam existir. O número NÃO está aqui porque a
       certidão pode não ter número (regras R7 e R8). */
    camposObrigatorios: ["area", "logradouro", "loteamento", "inscricao", "proprietario"],
    marcadorCampoFaltando: "[PREENCHER]",

    /* [ADC A6] Avisos opcionais (true = mostra) */
    avisos: {
      compromissario: true,
      complemento: true,
      maisDeUmLote: true,
      loteParte: true,
      numeracao: true          // informa quando R7 ou R8 foi aplicada
    }
  },

  /* ========================================================================
     4. MODELOS DE TEXTO
       {numeracao}    → resultado da regra de numeração (ver regras.numeracao)
       {alertaFracao} → " ATENÇÃO. Podem haver ..." ou vazio
       **texto**      → negrito no download (.rtf/.odt) e na tela; o botão
                        Copiar leva o texto sem os asteriscos
     ======================================================================== */
  modelos: {
    comQuadraELote:
      "**A) IDENTIFICAÇÃO DO LOTE**: O **lote {lote},** da **quadra “{quadra}”**, com a área de {area}, " +
      "localizado na {logradouro}{numeracao}, no local denominado **{loteamento}**. " +
      "Inscrição Cadastral: {inscricao}.{alertaFracao}\n\n" +
      "**B) PROPRIETÁRIA INDICADA PELO SOLICITANTE**: **{proprietario}.**",

    // O .md usa "Uma área ... localizado". Para "localizada", troque só essa palavra.
    semQuadraELote:
      "**A) IDENTIFICAÇÃO DO LOTE**: Uma área de {area}, " +
      "localizado na {logradouro}{numeracao}, no local denominado **{loteamento}**. " +
      "Inscrição Cadastral: {inscricao}.{alertaFracao}\n\n" +
      "**B) PROPRIETÁRIA INDICADA PELO SOLICITANTE**: **{proprietario}.**"
  },

  /* ========================================================================
     5. MENSAGENS DA TELA
     ======================================================================== */
  mensagens: {
    bloqueioValidade: "Não é possível gerar o texto da certidão: a validade informada é do exercício {anoCertidao} e o ano vigente é {anoVigente}.",
    bloqueioAnoAusente: "Não é possível gerar o texto da certidão: o ano de validade (exercício) não foi informado.",
    bloqueioFraseAusente: "Não é possível gerar o texto da certidão: a frase \"Esta certidão tem validade para todo o exercício\" não foi encontrada.",
    bloqueioOutroDocumento: "Não é possível gerar o texto: o arquivo não parece ser uma certidão de valor venal.",
    bloqueioResumo: "Geração bloqueada pela regra indicada no cartão acima. Envie outra certidão ou corrija os dados.",
    pdfSemTexto: "Este PDF não tem texto selecionável (provavelmente foi escaneado). Digite os dados nos campos manualmente.",

    alertaFracao: "Fração ideal de {fracao}: podem haver mais inscrições cadastrais. A mensagem de atenção foi incluída no texto.",
    alertaFracaoAusente: "Fração ideal não encontrada. Confira no documento antes de usar o texto.",
    alertaApenasUmAusente: "A certidão informa só o lote ou só a quadra. Foi usado o modelo \"Uma área\" — confira.",
    alertaCampoFaltando: "Campo \"{campo}\" não encontrado. Preencha manualmente.",
    alertaCampoRejeitado: "O campo \"{campo}\" não foi reconhecido com segurança e ficou em branco. Confira no PDF (painel \"Texto lido do PDF\").",
    alertaAbreviacaoRestante: "\"{token}\" em {campo} parece uma abreviação não expandida. Confira.",
    alertaAbrevForaTabela: "\"{token}\" em {campo} parece uma abreviação fora da lista. Foi mantida como está — confira.",
    alertaAbrevAmbigua: "\"{token}\" em {campo} é ambígua ({motivo}). Foi mantida como está — confira.",
    alertaCompromissario: "A certidão indica o compromissário {nome}. Confira qual nome deve constar no item B.",
    alertaComplemento: "Complemento informado na certidão: {valor} (não entra no texto).",
    alertaMaisDeUmLote: "Mais de um lote informado ({valor}). Confira a redação do item A.",
    alertaLoteParte: "Lote informado como \"{valor}\" (possível parte de lote). Confira a redação do item A.",

    infoSemNumero: "A certidão não informa número nem número antigo: a numeração foi omitida do texto.",
    infoSoAntigo: "A certidão informa só o número antigo: foi usado apenas o antigo.",

    ok: "Tudo certo. Texto pronto para copiar ou baixar.",

    escolherTroca: "Escolha 73 ou 77 antes de baixar.",
    downloadOk: "Arquivo {arquivo} baixado.",
    downloadComPendencia: "Arquivo baixado, mas o texto ainda tem [PREENCHER]. Complete antes de usar.",
    modeloAusente: "Modelo da certidão não encontrado (utils/js/modelo-certidao.js)."
  },

  /* ========================================================================
     6. EXPORTAÇÃO [USR R9, R10, R11] — download no modelo da certidão
     ------------------------------------------------------------------------
     O documento vem de utils/js/modelo-certidao.js, gerado a partir de
     ferramentas/modelo-original.odt (fonte, negrito e margens do modelo).
     Para trocar o modelo: edite o .odt e rode
        python3 ferramentas/preparar_modelo.py ferramentas/modelo-original.odt
     .rtf abre no Word, WordPad e LibreOffice.
     .odt abre no LibreOffice, no Word e no Google Docs.
     ======================================================================== */
  exportacao: {
    formatos: ["rtf", "odt"],
    formatoPadrao: "rtf",
    // {inscricao} e {data} (AAAA-MM-DD) são preenchidos automaticamente
    nomeArquivo: "negativa_{inscricao}",
    nomeArquivoSemInscricao: "negativa_{data}",

    /* [USR R11] Bloco <TROCA_73_77>: o parágrafo escolhido entra logo abaixo
       da descrição. Texto do 73 copiado do modelo; no 77 o ano é 1.977
       (ajuste feito no site publicado). Atenção às aspas e vírgulas ao editar. */
    troca: {
      exigirEscolha: true,     // [ADC A8] sem escolha, o download não sai
      opcoes: {
        "73": {
          dica: "desde 31 de agosto de 1.973",
          texto: "**CERTIFICA MAIS** e finalmente, que o imóvel supra, está compreendido nesta circunscrição, desde 31 de agosto de 1.973, sendo anteriormente da competência do 1º Oficial de Registro de Imóveis local."
        },
        "77": {
          dica: "desde 01 de janeiro de 1.977",
          texto: "**CERTIFICA MAIS** e finalmente, que o imóvel supra, está compreendido nesta circunscrição, desde 01 de janeiro de 1.977, sendo anteriormente da competência do 1º Oficial de Registro de Imóveis local."
        }
      }
    }
  }
};
