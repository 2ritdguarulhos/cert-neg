#!/usr/bin/env python3
"""
PREPARAR MODELO — transforma o modelo .odt da certidão no arquivo
utils/js/modelo-certidao.js, usado pelo site para gerar os downloads.

Uso (na pasta do site):
    python3 ferramentas/preparar_modelo.py ferramentas/modelo-original.odt

Requisitos: Python 3.8+ e LibreOffice instalado (comando "soffice"),
usado para criar a versão .rtf do modelo.

O que o modelo precisa ter:
  - Dois parágrafos com o marcador <INSERÇÃO DA DESCRIÇÃO>: tudo entre eles
    (o exemplo A/B) é trocado pelo texto gerado no site.
  - Um bloco <TROCA_73_77> ... </TROCA_73_77> depois da descrição: ele é
    trocado pelo parágrafo "CERTIFICA MAIS" escolhido (73 ou 77).
  - A formatação (fonte, negrito, margens) é copiada do próprio modelo:
      * parágrafo da descrição  = estilo do parágrafo "A)" do exemplo
      * parágrafo em branco     = estilo da linha vazia entre A) e B)
      * parágrafo CERTIFICA     = estilo do parágrafo dentro do bloco TROCA
      * negrito / normal        = estilos usados no parágrafo "A)" do exemplo
"""
import base64
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime

TOKEN_ODT = "{{BLOCO}}"
TOKEN_RTF = "ZZBLOCOZZ"
MARCA_DESCRICAO = "<INSERÇÃO DA DESCRIÇÃO>"
MARCA_TROCA_INI = "<TROCA_73_77>"
MARCA_TROCA_FIM = "</TROCA_73_77>"
IGNORAR = ("Thumbnails/", "Configurations2/")

RE_PARAGRAFO = re.compile(r"<text:(p|h)\b(?:[^>]*?/>|[^>]*>.*?</text:\1>)", re.S)


def falhar(msg):
    print("ERRO: " + msg)
    sys.exit(1)


def texto_puro(xml):
    return html.unescape(re.sub(r"<[^>]+>", "", xml))


def estilo_paragrafo(xml):
    m = re.search(r'text:style-name="([^"]+)"', xml)
    return m.group(1) if m else None


def estilos_negrito(content):
    """Nomes dos estilos de texto automáticos que são negrito."""
    negrito = set()
    for m in re.finditer(r'<style:style style:name="([^"]+)" style:family="text">(.*?)</style:style>', content, re.S):
        if 'fo:font-weight="bold"' in m.group(2):
            negrito.add(m.group(1))
    return negrito


def zipar_odt(arquivos, destino):
    with zipfile.ZipFile(destino, "w") as z:
        for nome, dados in arquivos:
            tipo = zipfile.ZIP_STORED if nome == "mimetype" else zipfile.ZIP_DEFLATED
            z.writestr(zipfile.ZipInfo(nome, date_time=datetime.now().timetuple()[:6]), dados, compress_type=tipo)


def main():
    if len(sys.argv) < 2:
        falhar("informe o arquivo .odt do modelo. Ex.: python3 ferramentas/preparar_modelo.py ferramentas/modelo-original.odt")
    origem = sys.argv[1]
    pasta_site = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    destino_js = os.path.join(pasta_site, "utils", "js", "modelo-certidao.js")

    with zipfile.ZipFile(origem) as z:
        entradas = [(i.filename, z.read(i.filename)) for i in z.infolist()]
    nomes = [n for n, _ in entradas]
    if "content.xml" not in nomes:
        falhar("o arquivo não parece ser um .odt (content.xml não encontrado).")
    content = dict(entradas)["content.xml"].decode("utf-8")
    if TOKEN_ODT in content:
        falhar("o modelo já contém " + TOKEN_ODT)

    # ---- localiza os parágrafos do corpo ----
    ini_corpo = content.index("<office:text")
    paras = [(m.start(), m.end(), m.group(0)) for m in RE_PARAGRAFO.finditer(content, ini_corpo)]
    textos = [texto_puro(p[2]).strip() for p in paras]

    desc = [i for i, t in enumerate(textos) if MARCA_DESCRICAO in t]
    troca_ini = next((i for i, t in enumerate(textos) if t.startswith(MARCA_TROCA_INI)), None)
    troca_fim = next((i for i, t in enumerate(textos) if t.startswith(MARCA_TROCA_FIM)), None)
    if len(desc) != 2:
        falhar("o modelo precisa ter exatamente 2 parágrafos com " + MARCA_DESCRICAO + f" (encontrados: {len(desc)}).")
    if troca_ini is None or troca_fim is None:
        falhar("bloco " + MARCA_TROCA_INI + " ... " + MARCA_TROCA_FIM + " não encontrado.")
    if not (desc[0] < desc[1] < troca_ini < troca_fim):
        falhar("a ordem esperada é: descrição, descrição, " + MARCA_TROCA_INI + ", " + MARCA_TROCA_FIM + ".")
    for i in range(desc[1] + 1, troca_ini):
        if textos[i]:
            falhar("há texto entre o fim da descrição e o bloco TROCA: '" + textos[i][:60] + "'")

    # ---- estilos copiados do próprio modelo ----
    exemplo = [i for i in range(desc[0] + 1, desc[1]) if textos[i]]
    vazios = [i for i in range(desc[0] + 1, troca_ini) if not textos[i]]
    troca = [i for i in range(troca_ini + 1, troca_fim) if textos[i]]
    if not exemplo or not troca:
        falhar("o modelo precisa ter o parágrafo de exemplo (A/B) e o parágrafo CERTIFICA dentro dos blocos.")
    xml_a = paras[exemplo[0]][2]
    negritos = estilos_negrito(content)
    internos = re.findall(r'<text:span text:style-name="([^"]+)">(?=[^<])', xml_a)
    est_negrito = next((s for s in internos if s in negritos), None)
    est_normal = next((s for s in internos if s not in negritos), None)
    externo = re.search(r'<text:span text:style-name="([^"]+)"><text:span', xml_a)
    if not est_negrito or not est_normal:
        falhar("não foi possível identificar os estilos negrito/normal no parágrafo de exemplo.")
    estilos = {
        "paragrafo": estilo_paragrafo(xml_a),
        "paragrafoVazio": estilo_paragrafo(paras[vazios[0]][2]) if vazios else estilo_paragrafo(xml_a),
        "paragrafoTroca": estilo_paragrafo(paras[troca[0]][2]),
        "negrito": est_negrito,
        "normal": est_normal,
        "envoltorio": externo.group(1) if externo else None
    }

    ini, fim = paras[desc[0]][0], paras[troca_fim][1]

    # ---- versão ODT: bloco trocado por um marcador ----
    content_odt = content[:ini] + TOKEN_ODT + content[fim:]

    manifest = dict(entradas)["META-INF/manifest.xml"].decode("utf-8")
    manifest = "\n".join(l for l in manifest.split("\n") if not any(('full-path="' + p) in l for p in IGNORAR))

    arquivos = []
    for nome, dados in entradas:
        if nome.endswith("/") or nome.startswith(IGNORAR):
            continue
        if nome == "content.xml":
            dados = content_odt.encode("utf-8")
        elif nome == "META-INF/manifest.xml":
            dados = manifest.encode("utf-8")
        arquivos.append((nome, dados))
    arquivos.sort(key=lambda a: a[0] != "mimetype")   # mimetype sempre primeiro

    # ---- versão RTF: o LibreOffice converte um ODT com um marcador de texto ----
    def span(texto):
        interno = f'<text:span text:style-name="{estilos["normal"]}">{texto}</text:span>'
        return f'<text:span text:style-name="{estilos["envoltorio"]}">{interno}</text:span>' if estilos["envoltorio"] else interno
    paragrafo_marca = f'<text:p text:style-name="{estilos["paragrafo"]}">{span(TOKEN_RTF)}</text:p>'
    content_rtf = content[:ini] + paragrafo_marca + content[fim:]

    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        falhar("LibreOffice (soffice) não encontrado — ele é necessário para gerar a versão .rtf.")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_odt = os.path.join(tmp, "modelo.odt")
        zipar_odt([(n, content_rtf.encode("utf-8") if n == "content.xml" else d) for n, d in arquivos], tmp_odt)
        subprocess.run([soffice, "--headless", "--convert-to", "rtf", tmp_odt, "--outdir", tmp],
                       check=True, capture_output=True, timeout=180)
        with open(os.path.join(tmp, "modelo.rtf"), "rb") as f:
            rtf = f.read().decode("latin-1")
    if rtf.count(TOKEN_RTF) != 1:
        falhar("a versão .rtf não ficou com o marcador intacto.")

    # ---- grava o arquivo usado pelo site ----
    def empacotar(nome, dados):
        try:
            return [nome, dados.decode("utf-8")]
        except UnicodeDecodeError:
            return [nome, {"b64": base64.b64encode(dados).decode("ascii")}]

    modelo = {
        "origem": os.path.basename(origem),
        "geradoEm": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "tokenOdt": TOKEN_ODT,
        "tokenRtf": TOKEN_RTF,
        "estilos": estilos,
        "odt": [empacotar(n, d) for n, d in arquivos],
        "rtf": rtf
    }
    with open(destino_js, "w", encoding="utf-8") as f:
        f.write("/* Gerado por ferramentas/preparar_modelo.py a partir de \"" + os.path.basename(origem) + "\".\n"
                "   Não edite à mão: altere o .odt e rode o script de novo. */\n")
        f.write("window.MODELO_CERTIDAO = " + json.dumps(modelo, ensure_ascii=False) + ";\n")

    print("Modelo preparado:", destino_js)
    print("Estilos detectados:", json.dumps(estilos, ensure_ascii=False))
    print("Arquivos no .odt:", [a[0] for a in arquivos])


if __name__ == "__main__":
    main()
