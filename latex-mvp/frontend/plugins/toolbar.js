/**
 * toolbar.js - Quick symbol palettes, typography helpers, and structure insertion.
 * Provides:
 *   - Bold, Italic, Sectioning and Math modes
 *   - Fractions, roots, sums, integrals, tables, figures
 *   - Floating Greek letter & math symbol popover
 *   - Fast \cite{...} citation picker popover from references.bib
 *   - Fast \ref{...} cross-reference picker popover
 */

import { parseBibtexEntries, extractDocumentLabels } from "./autocomplete.js";

export function setupToolbar(editorViewGetter, onActionNotify, getBibContent, getMainContent, onOpenBibModal) {
  function getActiveView() {
    return editorViewGetter ? editorViewGetter() : null;
  }

  function insertSnippet(snippet) {
    const view = getActiveView();
    if (!view) {
      if (onActionNotify) onActionNotify("Selecione o editor para inserir.", "warning");
      return;
    }

    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: snippet },
      selection: { anchor: selection.from + snippet.length },
      scrollIntoView: true
    });
    view.focus();
  }

  function wrapSelection(prefix, suffix, placeholder = "texto") {
    const view = getActiveView();
    if (!view) {
      if (onActionNotify) onActionNotify("Selecione o editor para inserir.", "warning");
      return;
    }

    const selection = view.state.selection.main;
    const hasSelection = selection.from !== selection.to;
    const selectedText = hasSelection ? view.state.doc.sliceString(selection.from, selection.to) : placeholder;
    const replacement = `${prefix}${selectedText}${suffix}`;

    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: replacement },
      selection: {
        anchor: selection.from + prefix.length,
        head: selection.from + prefix.length + selectedText.length
      },
      scrollIntoView: true
    });
    view.focus();
  }

  // Templates dictionary
  const TEMPLATES = {
    bold: () => wrapSelection("\\textbf{", "}", "texto"),
    italic: () => wrapSelection("\\textit{", "}", "texto"),
    section: () => insertSnippet("\n\\section{Título da Seção}\n"),
    subsection: () => insertSnippet("\n\\subsection{Subtítulo}\n"),
    inlineMath: () => wrapSelection("$", "$", "x"),
    displayMath: () => insertSnippet("\n\\[\n  E = mc^2\n\\]\n"),
    frac: () => insertSnippet("\\frac{a}{b}"),
    sqrt: () => insertSnippet("\\sqrt{x}"),
    sum: () => insertSnippet("\\sum_{i=1}^{n} "),
    integral: () => insertSnippet("\\int_{a}^{b} f(x)\\,dx "),
    equation: () => insertSnippet(
      "\n\\begin{equation}\n" +
      "  E = mc^2\n" +
      "  \\label{eq:energia}\n" +
      "\\end{equation}\n"
    ),
    align: () => insertSnippet(
      "\n\\begin{align}\n" +
      "  f(x) &= a x^2 + b x + c \\\\\n" +
      "  g(x) &= 2 a x + b\n" +
      "\\end{align}\n"
    ),
    figure: () => insertSnippet(
      "\n\\begin{figure}[!htbp]\n" +
      "  \\centering\n" +
      "  \\includegraphics[width=0.85\\linewidth]{figura.png}\n" +
      "  \\caption{Descrição clara da figura.}\n" +
      "  \\label{fig:diagrama}\n" +
      "\\end{figure}\n"
    ),
    tableBooktabs: () => insertSnippet(
      "\n\\begin{table}[!htbp]\n" +
      "  \\centering\n" +
      "  \\caption{Resultados do experimento.}\n" +
      "  \\label{tab:resultados}\n" +
      "  \\begin{tabular}{llr}\n" +
      "    \\toprule\n" +
      "    Item & Descrição & Valor \\\\\n" +
      "    \\midrule\n" +
      "    1 & Experimento A & 42.0 \\\\\n" +
      "    2 & Experimento B & 99.5 \\\\\n" +
      "    \\bottomrule\n" +
      "  \\end{tabular}\n" +
      "\\end{table}\n"
    )
  };

  // Bind direct action buttons with event delegation
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn) {
      const action = btn.getAttribute("data-action");
      if (action && TEMPLATES[action]) {
        e.preventDefault();
        TEMPLATES[action]();
      }
    }

    const symBtn = e.target.closest("[data-symbol]");
    if (symBtn) {
      e.preventDefault();
      const sym = symBtn.getAttribute("data-symbol");
      if (sym) {
        const toInsert = sym.startsWith("\\") ? `${sym} ` : sym;
        insertSnippet(toInsert);
        closeAllPopovers();
      }
    }
  });

  // Greek Letters Popover
  const greekBtn = document.getElementById("btn-greek-menu");
  const greekPopover = document.getElementById("popover-greek");

  if (greekBtn && greekPopover) {
    greekBtn.onclick = (e) => {
      e.stopPropagation();
      const isVisible = !greekPopover.classList.contains("hidden");
      closeAllPopovers();
      if (!isVisible) {
        greekPopover.classList.remove("hidden");
        positionPopover(greekBtn, greekPopover);
      }
    };

    // Greek Popover Tabs
    greekPopover.querySelectorAll(".popover-tab-btn").forEach(tabBtn => {
      tabBtn.onclick = (e) => {
        e.stopPropagation();
        greekPopover.querySelectorAll(".popover-tab-btn").forEach(b => b.classList.remove("active"));
        greekPopover.querySelectorAll(".popover-tab-pane").forEach(p => p.classList.remove("active"));
        tabBtn.classList.add("active");
        const paneId = `pane-greek-${tabBtn.getAttribute("data-tab")}`;
        const targetPane = document.getElementById(paneId);
        if (targetPane) targetPane.classList.add("active");
      };
    });
  }

  // Citation Picker Popover
  const citeBtn = document.getElementById("btn-toolbar-cite");
  const citePopover = document.getElementById("popover-cite");

  if (citeBtn && citePopover) {
    citeBtn.onclick = (e) => {
      e.stopPropagation();
      const isVisible = !citePopover.classList.contains("hidden");
      closeAllPopovers();
      if (!isVisible) {
        renderCitePopover();
        citePopover.classList.remove("hidden");
        positionPopover(citeBtn, citePopover);
      }
    };
  }

  function renderCitePopover() {
    if (!citePopover) return;
    const bibText = getBibContent ? getBibContent() : "";
    const entries = parseBibtexEntries(bibText);
    const listEl = document.getElementById("cite-popover-list");
    const searchInput = document.getElementById("cite-popover-search");
    if (!listEl) return;

    function renderList(filter = "") {
      listEl.innerHTML = "";
      const filtered = entries.filter(e =>
        !filter ||
        e.key.toLowerCase().includes(filter.toLowerCase()) ||
        (e.author && e.author.toLowerCase().includes(filter.toLowerCase())) ||
        (e.title && e.title.toLowerCase().includes(filter.toLowerCase()))
      );

      if (filtered.length === 0) {
        listEl.innerHTML = `
          <div style="padding:12px; font-size:0.78rem; color:var(--text-muted); text-align:center;">
            Nenhuma referência encontrada.<br>
            <button class="btn btn-xs btn-primary" id="btn-cite-open-bib" style="margin-top:8px;">Importar via DOI / arXiv</button>
          </div>
        `;
        const openBibBtn = listEl.querySelector("#btn-cite-open-bib");
        if (openBibBtn && onOpenBibModal) {
          openBibBtn.onclick = () => {
            closeAllPopovers();
            onOpenBibModal();
          };
        }
        return;
      }

      filtered.forEach(entry => {
        const item = document.createElement("div");
        item.className = "popover-list-item";
        item.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
            <strong style="color:#60a5fa; font-family:var(--font-mono); font-size:0.8rem;">\\cite{${escapeHtml(entry.key)}}</strong>
            <span class="badge badge-primary">${escapeHtml(entry.year || entry.type)}</span>
          </div>
          <div style="font-size:0.75rem; color:#e2e8f0; margin-top:2px; line-height:1.2;">${escapeHtml(entry.title || "Sem título")}</div>
          <div style="font-size:0.7rem; color:var(--text-muted);">${escapeHtml(entry.author || "")}</div>
        `;

        item.onclick = (e) => {
          e.stopPropagation();
          insertSnippet(`\\cite{${entry.key}}`);
          closeAllPopovers();
          if (onActionNotify) onActionNotify(`\\cite{${entry.key}} inserido!`, "success");
        };

        listEl.appendChild(item);
      });
    }

    if (searchInput) {
      searchInput.value = "";
      searchInput.oninput = (e) => renderList(e.target.value.trim());
      setTimeout(() => searchInput.focus(), 50);
    }

    renderList();
  }

  // Cross-reference Popover
  const refBtn = document.getElementById("btn-toolbar-ref");
  const refPopover = document.getElementById("popover-ref");

  if (refBtn && refPopover) {
    refBtn.onclick = (e) => {
      e.stopPropagation();
      const isVisible = !refPopover.classList.contains("hidden");
      closeAllPopovers();
      if (!isVisible) {
        renderRefPopover();
        refPopover.classList.remove("hidden");
        positionPopover(refBtn, refPopover);
      }
    };
  }

  function renderRefPopover() {
    if (!refPopover) return;
    const mainText = getMainContent ? getMainContent() : "";
    const labels = extractDocumentLabels(mainText);
    const listEl = document.getElementById("ref-popover-list");
    if (!listEl) return;

    listEl.innerHTML = "";
    if (labels.length === 0) {
      listEl.innerHTML = `
        <div style="padding:12px; font-size:0.78rem; color:var(--text-muted); text-align:center;">
          Nenhum \\label{...} encontrado no documento.
        </div>
      `;
      return;
    }

    labels.forEach(lbl => {
      const item = document.createElement("div");
      item.className = "popover-list-item";
      const isFig = lbl.startsWith("fig:");
      const isTab = lbl.startsWith("tab:");
      const isEq = lbl.startsWith("eq:");
      const badgeText = isFig ? "Figura" : isTab ? "Tabela" : isEq ? "Equação" : "Label";
      const citeCmd = isEq ? `\\eqref{${lbl}}` : `\\ref{${lbl}}`;

      item.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <strong style="color:#a7f3d0; font-family:var(--font-mono); font-size:0.8rem;">${citeCmd}</strong>
          <span class="badge badge-success">${badgeText}</span>
        </div>
      `;

      item.onclick = (e) => {
        e.stopPropagation();
        insertSnippet(citeCmd);
        closeAllPopovers();
        if (onActionNotify) onActionNotify(`${citeCmd} inserido!`, "success");
      };

      listEl.appendChild(item);
    });
  }

  function positionPopover(triggerBtn, popoverEl) {
    const rect = triggerBtn.getBoundingClientRect();
    popoverEl.style.top = `${rect.bottom + 4}px`;
    popoverEl.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
  }

  function closeAllPopovers() {
    if (greekPopover) greekPopover.classList.add("hidden");
    if (citePopover) citePopover.classList.add("hidden");
    if (refPopover) refPopover.classList.add("hidden");
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".editor-popover") && !e.target.closest(".dropdown-trigger")) {
      closeAllPopovers();
    }
  });

  return {
    insertSnippet,
    wrapSelection,
    closeAllPopovers
  };
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
