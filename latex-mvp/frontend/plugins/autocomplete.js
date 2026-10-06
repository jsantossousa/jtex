/**
 * autocomplete.js - Local, deterministic & fail-safe Autocomplete and Suggestion Engine.
 * Zero token cost, zero network latency.
 * Provides:
 *   - Floating autocomplete for LaTeX commands, math symbols and environments
 *   - Live \cite{...} citation popup suggestions directly from references.bib
 *   - Live \ref{...} / \eqref{...} cross-reference suggestions from \label{...}
 *   - Full keyboard navigation (Arrows, Enter, Tab, Escape) & mouse selection
 */

export const LATEX_COMMANDS = [
  // Document Structure
  { label: "\\documentclass", type: "keyword", detail: "{article|report|book}", apply: "\\documentclass[11pt,a4paper]{article}\n" },
  { label: "\\usepackage", type: "keyword", detail: "{package}", apply: "\\usepackage{package}" },
  { label: "\\section", type: "keyword", detail: "{título}", apply: "\\section{Título}\n" },
  { label: "\\subsection", type: "keyword", detail: "{subtítulo}", apply: "\\subsection{Subtítulo}\n" },
  { label: "\\subsubsection", type: "keyword", detail: "{sub-subtítulo}", apply: "\\subsubsection{Sub-subtítulo}\n" },
  { label: "\\paragraph", type: "keyword", detail: "{parágrafo}", apply: "\\paragraph{Tópico} " },
  { label: "\\textbf", type: "function", detail: "{negrito}", apply: "\\textbf{texto}" },
  { label: "\\textit", type: "function", detail: "{itálico}", apply: "\\textit{texto}" },
  { label: "\\emph", type: "function", detail: "{ênfase}", apply: "\\emph{texto}" },
  { label: "\\underline", type: "function", detail: "{sublinhado}", apply: "\\underline{texto}" },
  { label: "\\texttt", type: "function", detail: "{monoespaçado}", apply: "\\texttt{código}" },
  { label: "\\footnote", type: "function", detail: "{nota de rodapé}", apply: "\\footnote{nota}" },
  { label: "\\centering", type: "keyword", detail: "centralizar", apply: "\\centering\n" },
  { label: "\\caption", type: "function", detail: "{legenda}", apply: "\\caption{Legenda}\n" },
  { label: "\\label", type: "function", detail: "{label}", apply: "\\label{chave}\n" },
  { label: "\\newpage", type: "keyword", detail: "quebra de página", apply: "\\newpage\n" },

  // Typography & Booktabs
  { label: "\\toprule", type: "keyword", detail: "booktabs linha superior", apply: "\\toprule\n" },
  { label: "\\midrule", type: "keyword", detail: "booktabs linha média", apply: "\\midrule\n" },
  { label: "\\bottomrule", type: "keyword", detail: "booktabs linha inferior", apply: "\\bottomrule\n" },
  { label: "\\cmidrule", type: "function", detail: "{col-col}", apply: "\\cmidrule(lr){1-2}" },
  { label: "\\includegraphics", type: "function", detail: "[largura]{arquivo}", apply: "\\includegraphics[width=0.85\\linewidth]{imagem.png}" },

  // Math Greek Letters (Lower)
  { label: "\\alpha", type: "greek", detail: "α (alfa)", apply: "\\alpha " },
  { label: "\\beta", type: "greek", detail: "β (beta)", apply: "\\beta " },
  { label: "\\gamma", type: "greek", detail: "γ (gama)", apply: "\\gamma " },
  { label: "\\delta", type: "greek", detail: "δ (delta)", apply: "\\delta " },
  { label: "\\epsilon", type: "greek", detail: "ε (épsilon)", apply: "\\epsilon " },
  { label: "\\zeta", type: "greek", detail: "ζ (zeta)", apply: "\\zeta " },
  { label: "\\eta", type: "greek", detail: "η (eta)", apply: "\\eta " },
  { label: "\\theta", type: "greek", detail: "θ (teta)", apply: "\\theta " },
  { label: "\\iota", type: "greek", detail: "ι (iota)", apply: "\\iota " },
  { label: "\\kappa", type: "greek", detail: "κ (kapa)", apply: "\\kappa " },
  { label: "\\lambda", type: "greek", detail: "λ (lambda)", apply: "\\lambda " },
  { label: "\\mu", type: "greek", detail: "μ (mu)", apply: "\\mu " },
  { label: "\\nu", type: "greek", detail: "ν (nu)", apply: "\\nu " },
  { label: "\\xi", type: "greek", detail: "ξ (csi)", apply: "\\xi " },
  { label: "\\pi", type: "greek", detail: "π (pi)", apply: "\\pi " },
  { label: "\\rho", type: "greek", detail: "ρ (rô)", apply: "\\rho " },
  { label: "\\sigma", type: "greek", detail: "σ (sigma)", apply: "\\sigma " },
  { label: "\\tau", type: "greek", detail: "τ (tau)", apply: "\\tau " },
  { label: "\\upsilon", type: "greek", detail: "υ (úpsilon)", apply: "\\upsilon " },
  { label: "\\phi", type: "greek", detail: "φ (fi)", apply: "\\phi " },
  { label: "\\chi", type: "greek", detail: "χ (qui)", apply: "\\chi " },
  { label: "\\psi", type: "greek", detail: "ψ (psi)", apply: "\\psi " },
  { label: "\\omega", type: "greek", detail: "ω (ômega)", apply: "\\omega " },

  // Math Greek Letters (Upper)
  { label: "\\Gamma", type: "greek", detail: "Γ (Gama)", apply: "\\Gamma " },
  { label: "\\Delta", type: "greek", detail: "Δ (Delta)", apply: "\\Delta " },
  { label: "\\Theta", type: "greek", detail: "Θ (Teta)", apply: "\\Theta " },
  { label: "\\Lambda", type: "greek", detail: "Λ (Lambda)", apply: "\\Lambda " },
  { label: "\\Xi", type: "greek", detail: "Ξ (Csi)", apply: "\\Xi " },
  { label: "\\Pi", type: "greek", detail: "Π (Pi)", apply: "\\Pi " },
  { label: "\\Sigma", type: "greek", detail: "Σ (Sigma)", apply: "\\Sigma " },
  { label: "\\Upsilon", type: "greek", detail: "Υ (Upsilon)", apply: "\\Upsilon " },
  { label: "\\Phi", type: "greek", detail: "Φ (Fi)", apply: "\\Phi " },
  { label: "\\Psi", type: "greek", detail: "Ψ (Psi)", apply: "\\Psi " },
  { label: "\\Omega", type: "greek", detail: "Ω (Ômega)", apply: "\\Omega " },

  // Math Operators & Templates
  { label: "\\frac", type: "math", detail: "{num}{den}", apply: "\\frac{a}{b}" },
  { label: "\\sqrt", type: "math", detail: "{x}", apply: "\\sqrt{x}" },
  { label: "\\sum", type: "math", detail: "∑ somatório", apply: "\\sum_{i=1}^{n} " },
  { label: "\\int", type: "math", detail: "∫ integral", apply: "\\int_{a}^{b} f(x)\\,dx " },
  { label: "\\prod", type: "math", detail: "∏ produtório", apply: "\\prod_{i=1}^{n} " },
  { label: "\\lim", type: "math", detail: "lim limite", apply: "\\lim_{x \\to \\infty} " },
  { label: "\\partial", type: "math", detail: "∂ derivada parcial", apply: "\\partial " },
  { label: "\\nabla", type: "math", detail: "∇ gradiente", apply: "\\nabla " },
  { label: "\\infty", type: "math", detail: "∞ infinito", apply: "\\infty " },
  { label: "\\times", type: "math", detail: "× multiplicação", apply: "\\times " },
  { label: "\\cdot", type: "math", detail: "· produto escalar", apply: "\\cdot " },
  { label: "\\approx", type: "math", detail: "≈ aproximação", apply: "\\approx " },
  { label: "\\neq", type: "math", detail: "≠ diferente", apply: "\\neq " },
  { label: "\\leq", type: "math", detail: "≤ menor ou igual", apply: "\\leq " },
  { label: "\\geq", type: "math", detail: "≥ maior ou igual", apply: "\\geq " },
  { label: "\\in", type: "math", detail: "∈ pertence", apply: "\\in " },
  { label: "\\subset", type: "math", detail: "⊂ subconjunto", apply: "\\subset " },
  { label: "\\to", type: "math", detail: "→ converge para", apply: "\\to " },
  { label: "\\implies", type: "math", detail: "⟹ implica", apply: "\\implies " },
  { label: "\\mathbf", type: "math", detail: "{vetor/matriz}", apply: "\\mathbf{v}" },
  { label: "\\mathbb", type: "math", detail: "{conjuntos R, N}", apply: "\\mathbb{R}" },

  // Environments
  { label: "equation", type: "env", detail: "Equação numerada", apply: "\\begin{equation}\n  E = mc^2\n  \\label{eq:energia}\n\\end{equation}\n" },
  { label: "align", type: "env", detail: "Equações alinhadas", apply: "\\begin{align}\n  y &= mx + b \\\\\n  z &= ax^2 + bx + c\n\\end{align}\n" },
  { label: "figure", type: "env", detail: "Figura flutuante [!htbp]", apply: "\\begin{figure}[!htbp]\n  \\centering\n  \\includegraphics[width=0.85\\linewidth]{figura.png}\n  \\caption{Descrição da figura.}\n  \\label{fig:exemplo}\n\\end{figure}\n" },
  { label: "subfigure", type: "env", detail: "Sub-figura lado a lado", apply: "\\begin{subfigure}[b]{0.48\\linewidth}\n  \\centering\n  \\includegraphics[width=\\linewidth]{sub1.png}\n  \\caption{Cenário A}\n  \\label{fig:sub_a}\n\\end{subfigure}\n" },
  { label: "table", type: "env", detail: "Tabela Booktabs", apply: "\\begin{table}[!htbp]\n  \\centering\n  \\caption{Título da Tabela}\n  \\label{tab:dados}\n  \\begin{tabular}{llr}\n    \\toprule\n    Item & Descrição & Valor \\\\\n    \\midrule\n    1 & Experimento A & 42.0 \\\\\n    \\bottomrule\n  \\end{tabular}\n\\end{table}\n" },
  { label: "itemize", type: "env", detail: "Lista com marcadores", apply: "\\begin{itemize}\n  \\item Primeiro item\n\\end{itemize}\n" },
  { label: "enumerate", type: "env", detail: "Lista numerada", apply: "\\begin{enumerate}\n  \\item Primeiro item\n\\end{enumerate}\n" },
  { label: "bmatrix", type: "env", detail: "Matriz com colchetes", apply: "\\begin{bmatrix}\n  a & b \\\\\n  c & d\n\\end{bmatrix}" }
];

/**
 * Parses all BibTeX entries inside a references.bib string.
 */
export function parseBibtexEntries(bibContent) {
  if (!bibContent) return [];
  const entries = [];
  const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,([^@]*)/gi;
  let match;

  while ((match = entryRegex.exec(bibContent)) !== null) {
    const type = match[1].toLowerCase();
    const key = match[2].trim();
    const body = match[3];

    const titleMatch = /title\s*=\s*[\{"]([^"\}]+)[\}"]/i.exec(body);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const authorMatch = /author\s*=\s*[\{"]([^"\}]+)[\}"]/i.exec(body);
    const author = authorMatch ? authorMatch[1].trim() : "";

    const yearMatch = /year\s*=\s*[\{"]?(\d{4})[\}"]?/i.exec(body);
    const year = yearMatch ? yearMatch[1].trim() : "";

    entries.push({ key, type, title, author, year });
  }

  return entries;
}

/**
 * Scans the LaTeX document for all defined \label{...} targets.
 */
export function extractDocumentLabels(docContent) {
  if (!docContent) return [];
  const labels = [];
  const labelRegex = /\\label\{([^}]+)\}/g;
  let match;

  while ((match = labelRegex.exec(docContent)) !== null) {
    const lbl = match[1].trim();
    if (!labels.includes(lbl)) {
      labels.push(lbl);
    }
  }

  return labels;
}

/**
 * Complete, standalone floating Autocomplete Controller.
 * Embeds directly onto the editor view and provides real-time completion.
 */
export class AutocompleteController {
  constructor(editorViewGetter, getBibContent, getMainContent) {
    this.editorViewGetter = editorViewGetter;
    this.getBibContent = getBibContent;
    this.getMainContent = getMainContent;

    this.active = false;
    this.items = [];
    this.selectedIndex = 0;
    this.activePrefixStart = 0;
    this.activePrefixEnd = 0;
    this.currentContextType = null; // "cmd" | "cite" | "ref" | "begin"

    let existing = document.getElementById("latex-autocomplete-popup");
    if (existing) {
      this.popup = existing;
    } else {
      this.popup = document.createElement("div");
      this.popup.id = "latex-autocomplete-popup";
      this.popup.className = "cm-latex-autocomplete-popup hidden";
      document.body.appendChild(this.popup);
    }

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.checkCompletion = this.checkCompletion.bind(this);

    window.addEventListener("click", this.handleDocumentClick);
    window.addEventListener("resize", () => this.hide());
  }

  getView() {
    return this.editorViewGetter ? this.editorViewGetter() : null;
  }

  bindEditorEvents(view) {
    if (!view || !view.dom) return;
    view.dom.addEventListener("keydown", this.handleKeyDown, true);
  }

  handleDocumentClick(e) {
    if (!this.popup.contains(e.target)) {
      this.hide();
    }
  }

  hide() {
    this.active = false;
    this.items = [];
    this.popup.classList.add("hidden");
    this.popup.innerHTML = "";
  }

  checkCompletion() {
    const view = this.getView();
    if (!view) return;

    const sel = view.state.selection.main;
    if (!sel.empty) {
      this.hide();
      return;
    }

    const pos = sel.head;
    const line = view.state.doc.lineAt(pos);
    const textBefore = line.text.slice(0, pos - line.from);

    // 1. Check for \cite{...
    const citeMatch = /\\cite[pt]?\{([^}]*)$/.exec(textBefore);
    if (citeMatch) {
      const typed = citeMatch[1];
      const startPos = pos - typed.length;
      const bibText = this.getBibContent ? this.getBibContent() : "";
      const bibEntries = parseBibtexEntries(bibText);

      const filtered = bibEntries.filter(e =>
        !typed || e.key.toLowerCase().includes(typed.toLowerCase()) ||
        (e.author && e.author.toLowerCase().includes(typed.toLowerCase())) ||
        (e.title && e.title.toLowerCase().includes(typed.toLowerCase()))
      ).map(e => {
        let authorStr = "";
        if (e.author) {
          const first = e.author.split(" and ")[0];
          authorStr = e.year ? `${first} (${e.year})` : first;
        } else if (e.year) {
          authorStr = `(${e.year})`;
        }
        return {
          label: e.key,
          type: "cite",
          detail: authorStr,
          info: e.title || e.key,
          applyText: `${e.key}}`
        };
      });

      if (filtered.length > 0) {
        this.show(view, pos, startPos, filtered, "cite");
        return;
      } else {
        this.show(view, pos, startPos, [{
          label: "Nenhuma referência encontrada",
          type: "info",
          detail: "Importe um DOI em Referências",
          applyText: ""
        }], "cite");
        return;
      }
    }

    // 2. Check for \ref{... or \eqref{...
    const refMatch = /\\(?:eq)?ref\{([^}]*)$/.exec(textBefore);
    if (refMatch) {
      const typed = refMatch[1];
      const startPos = pos - typed.length;
      const mainText = this.getMainContent ? this.getMainContent() : view.state.doc.toString();
      const labels = extractDocumentLabels(mainText);

      const filtered = labels
        .filter(l => !typed || l.toLowerCase().includes(typed.toLowerCase()))
        .map(l => ({
          label: l,
          type: "ref",
          detail: l.startsWith("fig:") ? "Figura" : l.startsWith("tab:") ? "Tabela" : l.startsWith("eq:") ? "Equação" : "Label",
          applyText: `${l}}`
        }));

      if (filtered.length > 0) {
        this.show(view, pos, startPos, filtered, "ref");
        return;
      }
    }

    // 3. Check for \begin{...
    const beginMatch = /\\begin\{([a-zA-Z]*)$/.exec(textBefore);
    if (beginMatch) {
      const typed = beginMatch[1];
      const startPos = pos - typed.length;
      const envs = LATEX_COMMANDS.filter(c => c.type === "env");
      const filtered = envs.filter(c => !typed || c.label.toLowerCase().startsWith(typed.toLowerCase())).map(c => ({
        label: c.label,
        type: "env",
        detail: c.detail,
        applyText: `${c.label}}\n  \n\\end{${c.label}}\n`
      }));

      if (filtered.length > 0) {
        this.show(view, pos, startPos, filtered, "begin");
        return;
      }
    }

    // 4. Check for command or greek letter: \ or \alpha or \sec
    const cmdMatch = /\\([a-zA-Z]*)$/.exec(textBefore);
    if (cmdMatch) {
      const typed = cmdMatch[1];
      const startPos = pos - typed.length - 1; // includes backslash
      const query = `\\${typed.toLowerCase()}`;

      const filtered = LATEX_COMMANDS.filter(c => c.label.toLowerCase().startsWith(query)).map(c => ({
        label: c.label,
        type: c.type,
        detail: c.detail,
        applyText: c.apply
      }));

      if (filtered.length > 0) {
        this.show(view, pos, startPos, filtered, "cmd");
        return;
      }
    }

    this.hide();
  }

  show(view, cursorEndPos, startPos, items, contextType) {
    this.items = items;
    this.activePrefixStart = startPos;
    this.activePrefixEnd = cursorEndPos;
    this.currentContextType = contextType;
    this.selectedIndex = 0;
    this.active = true;

    this.render();
    this.popup.classList.remove("hidden");

    // Position popup below or above cursor using CodeMirror coords
    const coords = view.coordsAtPos(startPos) || view.coordsAtPos(cursorEndPos);
    if (coords) {
      const popupHeight = 220;
      let top = coords.bottom + 4;
      // If popup overflows viewport bottom, position above cursor
      if (top + popupHeight > window.innerHeight) {
        top = Math.max(40, coords.top - popupHeight - 4);
      }
      top = Math.max(40, Math.min(top, window.innerHeight - popupHeight - 10));
      const left = Math.max(10, Math.min(coords.left, window.innerWidth - 360));
      this.popup.style.top = `${top}px`;
      this.popup.style.left = `${left}px`;
    }
  }

  render() {
    this.popup.innerHTML = "";
    const list = document.createElement("div");
    list.className = "cm-latex-autocomplete-list";

    this.items.slice(0, 30).forEach((item, idx) => {
      const itemEl = document.createElement("div");
      itemEl.className = `cm-latex-autocomplete-item ${idx === this.selectedIndex ? "selected" : ""}`;

      let typeBadge = item.type;
      let badgeClass = "badge-cmd";
      if (item.type === "greek") {
        typeBadge = "Ω";
        badgeClass = "badge-greek";
      } else if (item.type === "cite") {
        typeBadge = "cite";
        badgeClass = "badge-cite";
      } else if (item.type === "ref") {
        typeBadge = "ref";
        badgeClass = "badge-ref";
      } else if (item.type === "env") {
        typeBadge = "env";
        badgeClass = "badge-env";
      } else if (item.type === "math") {
        typeBadge = "fx";
        badgeClass = "badge-math";
      }

      itemEl.innerHTML = `
        <span class="cm-latex-badge ${badgeClass}">${typeBadge}</span>
        <span class="cm-latex-label">${escapeHtml(item.label)}</span>
        <span class="cm-latex-detail">${escapeHtml(item.detail || "")}</span>
      `;

      itemEl.onmousedown = (e) => {
        e.preventDefault();
        this.selectIndex(idx);
      };

      list.appendChild(itemEl);
    });

    this.popup.appendChild(list);

    // Scroll selected item into view
    const selectedEl = list.children[this.selectedIndex];
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }

  selectIndex(idx) {
    if (idx < 0 || idx >= this.items.length) return;
    const item = this.items[idx];
    if (!item || !item.applyText) {
      this.hide();
      return;
    }

    const view = this.getView();
    if (!view) return;

    // Apply replacement
    view.dispatch({
      changes: {
        from: this.activePrefixStart,
        to: this.activePrefixEnd,
        insert: item.applyText
      },
      selection: { anchor: this.activePrefixStart + item.applyText.length },
      scrollIntoView: true
    });

    view.focus();
    this.hide();
  }

  handleKeyDown(e) {
    if (!this.active || this.items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      this.selectedIndex = (this.selectedIndex + 1) % Math.min(this.items.length, 30);
      this.render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      this.selectedIndex = (this.selectedIndex - 1 + Math.min(this.items.length, 30)) % Math.min(this.items.length, 30);
      this.render();
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      this.selectIndex(this.selectedIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    }
  }
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
