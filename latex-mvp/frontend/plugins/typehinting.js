/**
 * typehinting.js - Local deterministic typehinting and tooltip hovers for CodeMirror 6.
 * Displays syntax signatures, parameters, package requirements, and typography hints
 * on mouse hover over LaTeX commands without making network requests.
 */

export const TYPEHINT_DATABASE = {
  "\\documentclass": {
    syntax: "\\documentclass[opções]{classe}",
    package: "Núcleo LaTeX",
    description: "Define a estrutura geral do documento.",
    example: "\\documentclass[11pt,a4paper]{article}"
  },
  "\\usepackage": {
    syntax: "\\usepackage[opções]{pacote}",
    package: "Núcleo LaTeX",
    description: "Carrega extensões e pacotes de funcionalidades no preâmbulo.",
    example: "\\usepackage{graphicx, amsmath, booktabs}"
  },
  "\\cite": {
    syntax: "\\cite[página/nota]{chave_bibtex}",
    package: "BibTeX / natbib",
    description: "Cita uma entrada bibliográfica cadastrada no arquivo references.bib.",
    example: "\\cite{vaswani2017attention} ou \\cite[p. 42]{feynman1963}"
  },
  "\\citep": {
    syntax: "\\citep[prefixo][sufixo]{chave}",
    package: "natbib",
    description: "Citação parentética (Autor, Ano) comum em ciências exatas e naturais.",
    example: "\\citep{einstein1905}"
  },
  "\\citet": {
    syntax: "\\citet{chave}",
    package: "natbib",
    description: "Citação textual em que o autor faz parte da frase: Autor (Ano).",
    example: "\\citet{turing1936} provou que..."
  },
  "\\ref": {
    syntax: "\\ref{label_key}",
    package: "Núcleo LaTeX",
    description: "Referência cruzada ao número de uma seção, figura ou tabela marcada com \\label.",
    example: "Conforme ilustrado na Figura~\\ref{fig:diagrama}."
  },
  "\\eqref": {
    syntax: "\\eqref{eq_label}",
    package: "amsmath",
    description: "Referência cruzada para equações com parênteses automáticos: (1).",
    example: "Pela Equação~\\eqref{eq:maxwell}..."
  },
  "\\label": {
    syntax: "\\label{prefixo:identificador}",
    package: "Núcleo LaTeX",
    description: "Define uma âncora para referências cruzadas. Coloque sempre após \\caption em figuras/tabelas.",
    example: "\\label{fig:resultado_experimento}"
  },
  "\\toprule": {
    syntax: "\\toprule[espessura]",
    package: "booktabs",
    description: "Linha horizontal superior pesada de abertura de tabelas profissionais. Evite linhas verticais.",
    example: "\\begin{tabular}{llr}\n\\toprule\nItem & Nome & Valor \\\\\n\\midrule"
  },
  "\\midrule": {
    syntax: "\\midrule[espessura]",
    package: "booktabs",
    description: "Linha horizontal intermediária separando o cabeçalho dos dados.",
    example: "\\midrule"
  },
  "\\bottomrule": {
    syntax: "\\bottomrule[espessura]",
    package: "booktabs",
    description: "Linha horizontal inferior de fechamento de tabela.",
    example: "\\bottomrule\n\\end{tabular}"
  },
  "\\cmidrule": {
    syntax: "\\cmidrule(opções){coluna_inicio-coluna_fim}",
    package: "booktabs",
    description: "Linha horizontal parcial para cabeçalhos combinados. Use (lr) para aparar bordas.",
    example: "\\cmidrule(lr){2-3}"
  },
  "\\includegraphics": {
    syntax: "\\includegraphics[largura,escala]{caminho_imagem}",
    package: "graphicx",
    description: "Insere imagem raster (PNG, JPG) ou vetorial (PDF). Prefira larguras relativas.",
    example: "\\includegraphics[width=0.85\\linewidth]{grafico.png}"
  },
  "\\centering": {
    syntax: "\\centering",
    package: "Núcleo LaTeX",
    description: "Alinha o conteúdo ao centro no escopo atual. Mais limpo que o ambiente \\begin{center}.",
    example: "\\begin{figure}[!htbp]\n  \\centering"
  },
  "\\caption": {
    syntax: "\\caption[lista_curta]{texto_completo}",
    package: "Núcleo LaTeX",
    description: "Legenda numerada para figuras e tabelas flutuantes.",
    example: "\\caption{Distribuição de probabilidade observada no teste.}"
  },
  "\\resizebox": {
    syntax: "\\resizebox{largura}{altura}{conteúdo}",
    package: "graphicx",
    description: "Redimensiona tabelas ou blocos para evitar estouro de margem (use ! para manter proporção).",
    example: "\\resizebox{\\linewidth}{!}{\\begin{tabular}...\\end{tabular}}"
  },
  "\\frac": {
    syntax: "\\frac{numerador}{denominador}",
    package: "amsmath / Núcleo",
    description: "Fração matemática tipográfica vertical.",
    example: "\\frac{\\partial y}{\\partial x}"
  },
  "\\sqrt": {
    syntax: "\\sqrt[índice]{radicando}",
    package: "Núcleo LaTeX",
    description: "Raiz quadrada ou raiz de índice n.",
    example: "\\sqrt[3]{x^2 + y^2}"
  },
  "\\begin": {
    syntax: "\\begin{nome_ambiente}[opções]",
    package: "Núcleo LaTeX",
    description: "Abre um bloco de ambiente delimitado por \\end{nome_ambiente}.",
    example: "\\begin{equation} ou \\begin{figure}[!htbp]"
  },
  "\\end": {
    syntax: "\\end{nome_ambiente}",
    package: "Núcleo LaTeX",
    description: "Fecha o bloco do ambiente correspondente.",
    example: "\\end{equation}"
  }
};


/**
 * Builds the CodeMirror 6 hoverTooltip extension.
 */
export function createLatexTypehintHover(hoverTooltipFn) {
  return hoverTooltipFn((view, pos, side) => {
    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;
    const col = pos - line.from;

    // Scan backwards and forwards to identify the LaTeX command under cursor
    let start = col;
    while (start > 0 && /[a-zA-Z\\]/.test(lineText[start - 1])) {
      start--;
      if (lineText[start] === "\\") break;
    }

    let end = col;
    while (end < lineText.length && /[a-zA-Z]/.test(lineText[end])) {
      end++;
    }

    const command = lineText.slice(start, end);
    if (!command.startsWith("\\") || command.length < 2) {
      return null;
    }

    const info = TYPEHINT_DATABASE[command];
    if (!info) return null;

    return {
      pos: line.from + start,
      end: line.from + end,
      above: true,
      create(view) {
        const dom = document.createElement("div");
        dom.className = "cm-latex-typehint-tooltip";
        dom.innerHTML = `
          <div class="tooltip-header">
            <span class="tooltip-cmd">${command}</span>
            <span class="tooltip-badge">${info.package}</span>
          </div>
          <div class="tooltip-syntax"><code>${escapeHtml(info.syntax)}</code></div>
          <div class="tooltip-desc">${escapeHtml(info.description)}</div>
          ${info.example ? `<div class="tooltip-example"><strong>Exemplo:</strong> <code>${escapeHtml(info.example)}</code></div>` : ""}
        `;
        return { dom };
      }
    };
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
