/**
 * app.js - Main Application Orchestrator for LaTeX Studio.
 * Clean, robust, modular architecture.
 */

import { AutocompleteController, parseBibtexEntries } from "./plugins/autocomplete.js";
import { createLatexTypehintHover } from "./plugins/typehinting.js";
import { createLatexLinter } from "./plugins/linter.js";
import { setupToolbar } from "./plugins/toolbar.js";
import { setupBibliographyManager } from "./plugins/bibliography.js";

// CDN ESM Imports
import { EditorState } from "https://esm.sh/@codemirror/state@6.4.1";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  hoverTooltip
} from "https://esm.sh/@codemirror/view@6.26.3";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from "https://esm.sh/@codemirror/commands@6.5.0";
import { closeBrackets, closeBracketsKeymap } from "https://esm.sh/@codemirror/autocomplete@6.16.0";
import { linter, lintGutter } from "https://esm.sh/@codemirror/lint@6.7.0";
import { syntaxHighlighting, defaultHighlightStyle, StreamLanguage } from "https://esm.sh/@codemirror/language@6.10.1";
import { stex } from "https://esm.sh/@codemirror/legacy-modes@6.4.0/mode/stex";
import * as Y from "https://esm.sh/yjs@13.6.14";

// --- Sample Initial Documents ---

const INITIAL_MAIN_TEX = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[brazil]{babel}
\usepackage{amsmath, amssymb, amsfonts}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{float}
\usepackage{subcaption}
\usepackage{microtype}
\usepackage{geometry}
\geometry{top=2.5cm, bottom=2.5cm, left=2.5cm, right=2.5cm}

\title{\textbf{Artigo Científico: Estudo e Aplicação}}
\author{Laboratório de Sistemas e Tipografia TeX}
\date{\today}

\begin{document}

\maketitle

\begin{abstract}
Este documento demonstra o funcionamento do editor LaTeX colaborativo com suporte nativo a resolução determinística de DOIs, compilação em múltiplos passos com BibTeX e formatação tipográfica moderna.
\end{abstract}

\section{Introdução}
O uso de ferramentas avançadas de tipografia permite a estruturação de publicações de alto impacto científico. Conforme demonstrado por Einstein~\cite{einstein1905} no estudo do efeito fotoelétrico e Vaswani et al.~\cite{vaswani2017attention} na arquitetura Transformer, a citação precisa de fontes bibliográficas é indispensável.

\section{Modelagem Matemática}
Consideremos a clássica relação energia-momento relativística dada pela Equação~\eqref{eq:energia_relativistica}:
\begin{equation}
  E^2 = (p c)^2 + (m_0 c^2)^2
  \label{eq:energia_relativistica}
\end{equation}

Podemos também descrever um sistema de equações alinhadas com letras gregas $\alpha, \beta, \gamma$:
\begin{align}
  \nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
  \nabla \times \mathbf{B} - \frac{1}{c^2}\frac{\partial \mathbf{E}}{\partial t} &= \mu_0 \mathbf{J}
\end{align}

\section{Resultados e Tabelas Profissionais}
Evitamos linhas verticais em tabelas científicas, utilizando o pacote \texttt{booktabs} conforme apresentado na Tabela~\ref{tab:benchmarks}.

\begin{table}[!htbp]
  \centering
  \caption{Métricas de desempenho observadas durante a compilação.}
  \label{tab:benchmarks}
  \begin{tabular}{llr}
    \toprule
    Método & Tempo de Execução (ms) & Acurácia (\%) \\
    \midrule
    Algoritmo Padrão & 124.5 & 88.4 \\
    Otimização Heurística & 76.2 & 94.1 \\
    Modelo Proposto & \textbf{32.8} & \textbf{98.7} \\
    \bottomrule
  \end{tabular}
\end{table}

\section{Conclusão}
A integração entre verificação estática determinística e gerenciamento automatizado de bibliografia simplifica significativamente a produção acadêmica.

\bibliographystyle{plain}
\bibliography{references}

\end{document}
`;

const INITIAL_REFERENCES_BIB = String.raw`@article{einstein1905,
  author  = {Albert Einstein},
  title   = {Über einen die Erzeugung und Verwandlung des Lichtes betreffenden heuristischen Gesichtspunkt},
  journal = {Annalen der Physik},
  volume  = {17},
  number  = {6},
  pages   = {132--148},
  year    = {1905},
  doi     = {10.1002/andp.19053220607}
}

@article{vaswani2017attention,
  author        = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N. and Kaiser, Lukasz and Polosukhin, Illia},
  title         = {Attention Is All You Need},
  journal       = {arXiv preprint arXiv:1706.03762},
  year          = {2017},
  eprint        = {1706.03762},
  archivePrefix = {arXiv},
  primaryClass  = {cs.CL}
}
`;


// --- State Management ---

let projectFiles = {
  "main.tex": {
    content: localStorage.getItem("latex_file_main.tex") || INITIAL_MAIN_TEX,
    isBinary: false
  },
  "references.bib": {
    content: localStorage.getItem("latex_file_references.bib") || INITIAL_REFERENCES_BIB,
    isBinary: false
  }
};

// Restore extra files from localStorage
try {
  const index = JSON.parse(localStorage.getItem("latex_file_index") || "[]");
  index.forEach(fname => {
    if (!projectFiles[fname]) {
      const stored = localStorage.getItem(`latex_file_${fname}`);
      const isBin = localStorage.getItem(`latex_bin_${fname}`) === "true";
      if (stored !== null) {
        projectFiles[fname] = { content: stored, isBinary: isBin };
      }
    }
  });
} catch (e) {
  console.warn("Could not parse file index:", e);
}

let currentActiveFile = "main.tex";
let editorView = null;
let currentPdfJobId = null;
let toolbarManager = null;
let autocompleteController = null;

// Expose to window for external access
window.projectFiles = projectFiles;
window.getFileContent = (name) => projectFiles[name] ? projectFiles[name].content : null;


// --- Notifications Toast ---

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}


// --- Editor Initialization ---

function initEditor() {
  const mountNode = document.getElementById("editor-mount");
  if (!mountNode) return;

  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
  mountNode.innerHTML = "";

  const latexTypehint = createLatexTypehintHover(hoverTooltip);
  const latexLint = createLatexLinter(linter);
  const activeObj = projectFiles[currentActiveFile] || { content: "", isBinary: false };

  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    closeBrackets(),
    lintGutter(),
    StreamLanguage.define(stex),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    latexTypehint,
    latexLint,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
      {
        key: "Mod-Enter",
        run: () => {
          compileDocument();
          return true;
        }
      }
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        syncCurrentDoc();
      }
    })
  ];

  const state = EditorState.create({
    doc: activeObj.isBinary
      ? `[Arquivo binário / imagem: ${currentActiveFile}]\nInclua com: \\includegraphics[width=0.85\\linewidth]{${currentActiveFile}}`
      : activeObj.content,
    extensions
  });

  editorView = new EditorView({
    state,
    parent: mountNode
  });
  window.editorView = editorView;

  // Initialize deterministic floating autocomplete
  autocompleteController = new AutocompleteController(
    () => editorView,
    () => (projectFiles["references.bib"] ? projectFiles["references.bib"].content : ""),
    () => (projectFiles["main.tex"] ? projectFiles["main.tex"].content : "")
  );
  autocompleteController.bindEditorEvents(editorView);
  window.autocompleteController = autocompleteController;

  // Native DOM listeners for fail-safe persistence & autocomplete
  editorView.contentDOM.addEventListener("input", () => {
    syncCurrentDoc();
  });

  editorView.contentDOM.addEventListener("keyup", (e) => {
    if (["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(e.key)) return;
    syncCurrentDoc();
  });

  editorView.contentDOM.addEventListener("click", () => {
    if (window.autocompleteController) {
      window.autocompleteController.checkCompletion();
    }
  });
}

function syncCurrentDoc() {
  if (!editorView) return;
  const fileObj = projectFiles[currentActiveFile];
  if (fileObj && !fileObj.isBinary) {
    const newDoc = editorView.state.doc.toString();
    fileObj.content = newDoc;
    localStorage.setItem(`latex_file_${currentActiveFile}`, newDoc);
    if (currentActiveFile === "references.bib") {
      updateBibCounters();
    }
  }
  if (window.autocompleteController) {
    window.autocompleteController.checkCompletion();
  }
}



// --- File Management ---

function saveFileIndex() {
  localStorage.setItem("latex_file_index", JSON.stringify(Object.keys(projectFiles)));
}

function renderFileManager() {
  const treeContainer = document.getElementById("file-tree-container");
  const tabsContainer = document.getElementById("editor-tabs-container");
  if (!treeContainer || !tabsContainer) return;

  treeContainer.innerHTML = "";
  tabsContainer.innerHTML = "";

  const fileNames = Object.keys(projectFiles);

  fileNames.forEach(fname => {
    const fileObj = projectFiles[fname];
    const isActive = fname === currentActiveFile;

    // Sidebar item
    const item = document.createElement("div");
    item.className = `file-item ${isActive ? "active" : ""}`;
    item.setAttribute("data-file", fname);

    let badgeText = "DOC";
    let badgeClass = "badge-primary";
    if (fname.endsWith(".tex")) {
      badgeText = "TEX";
      badgeClass = "badge-primary";
    } else if (fname.endsWith(".bib")) {
      badgeText = "BIB";
      badgeClass = "badge-success";
    } else if (fileObj.isBinary || /\.(png|jpg|jpeg|pdf|svg)$/i.test(fname)) {
      badgeText = "IMG";
      badgeClass = "badge-warning";
    }

    item.innerHTML = `
      <div class="file-item-name" title="${escapeHtml(fname)}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <span class="file-display-label">${escapeHtml(fname)}</span>
      </div>
      <div class="file-item-actions">
        <span class="badge ${badgeClass}">${badgeText}</span>
        <button class="file-action-icon btn-rename-file" title="Editar nome">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        ${fname !== "main.tex" ? `
        <button class="file-action-icon delete btn-delete-file" title="Excluir arquivo">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>` : ""}
      </div>
    `;

    item.querySelector(".file-item-name").onclick = () => switchActiveFile(fname);

    item.querySelector(".btn-rename-file").onclick = (e) => {
      e.stopPropagation();
      startRenamingFile(fname, item);
    };

    const deleteBtn = item.querySelector(".btn-delete-file");
    if (deleteBtn) {
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteFile(fname);
      };
    }

    treeContainer.appendChild(item);

    // Editor tab
    const tab = document.createElement("button");
    tab.className = `file-tab ${isActive ? "active" : ""}`;
    tab.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
      <span>${escapeHtml(fname)}</span>
    `;
    tab.onclick = () => switchActiveFile(fname);
    tabsContainer.appendChild(tab);
  });

  updateBibCounters();
}

function switchActiveFile(fileName) {
  if (!projectFiles[fileName] || fileName === currentActiveFile) return;

  // Persist current editor content
  if (editorView && projectFiles[currentActiveFile] && !projectFiles[currentActiveFile].isBinary) {
    const doc = editorView.state.doc.toString();
    projectFiles[currentActiveFile].content = doc;
    localStorage.setItem(`latex_file_${currentActiveFile}`, doc);
  }

  currentActiveFile = fileName;
  initEditor();
  renderFileManager();
}

function createNewFile() {
  const name = prompt("Nome do novo arquivo (ex: capitulo1.tex, dados.bib):", "novo_arquivo.tex");
  if (!name) return;
  const cleanName = name.trim();
  if (!cleanName) return;

  if (projectFiles[cleanName]) {
    alert("Já existe um arquivo com esse nome.");
    return;
  }

  const defaultContent = cleanName.endsWith(".bib")
    ? "% Arquivo de referências BibTeX\n"
    : cleanName.endsWith(".tex")
    ? `\\section{${cleanName.replace('.tex','')}}\nTexto inicial...\n`
    : "";

  projectFiles[cleanName] = { content: defaultContent, isBinary: false };
  localStorage.setItem(`latex_file_${cleanName}`, defaultContent);
  saveFileIndex();

  currentActiveFile = cleanName;
  initEditor();
  renderFileManager();
  showToast(`Arquivo "${cleanName}" criado!`, "success");
}

function startRenamingFile(oldName, itemElement) {
  const nameSpan = itemElement.querySelector(".file-display-label");
  if (!nameSpan) return;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "file-rename-input";
  input.value = oldName;

  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  function commitRename() {
    const newName = input.value.trim();
    if (!newName || newName === oldName) {
      renderFileManager();
      return;
    }

    if (projectFiles[newName]) {
      alert("Já existe um arquivo com esse nome.");
      renderFileManager();
      return;
    }

    projectFiles[newName] = projectFiles[oldName];
    delete projectFiles[oldName];

    localStorage.setItem(`latex_file_${newName}`, projectFiles[newName].content);
    localStorage.removeItem(`latex_file_${oldName}`);

    if (projectFiles[newName].isBinary) {
      localStorage.setItem(`latex_bin_${newName}`, "true");
      localStorage.removeItem(`latex_bin_${oldName}`);
    }

    saveFileIndex();

    if (currentActiveFile === oldName) {
      currentActiveFile = newName;
    }

    renderFileManager();
    showToast(`Arquivo renomeado para "${newName}"`, "success");
  }

  input.onblur = commitRename;
  input.onkeydown = (e) => {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") renderFileManager();
  };
}

function deleteFile(fileName) {
  if (fileName === "main.tex") {
    alert("O arquivo principal 'main.tex' não pode ser excluído.");
    return;
  }

  if (!confirm(`Deseja realmente excluir "${fileName}"?`)) return;

  delete projectFiles[fileName];
  localStorage.removeItem(`latex_file_${fileName}`);
  localStorage.removeItem(`latex_bin_${fileName}`);
  saveFileIndex();

  if (currentActiveFile === fileName) {
    currentActiveFile = "main.tex";
    initEditor();
  }

  renderFileManager();
  showToast(`Arquivo "${fileName}" excluído.`, "info");
}

function handleFileUpload(files) {
  if (!files || files.length === 0) return;

  Array.from(files).forEach(file => {
    const fileName = file.name;
    const isImageOrPdf = /\.(png|jpg|jpeg|pdf|svg)$/i.test(fileName);

    if (isImageOrPdf) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target.result;
        projectFiles[fileName] = { content: base64Data, isBinary: true };
        localStorage.setItem(`latex_file_${fileName}`, base64Data);
        localStorage.setItem(`latex_bin_${fileName}`, "true");
        saveFileIndex();
        renderFileManager();
        showToast(`Imagem "${fileName}" enviada com sucesso!`, "success");
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const textContent = e.target.result;
        projectFiles[fileName] = { content: textContent, isBinary: false };
        localStorage.setItem(`latex_file_${fileName}`, textContent);
        saveFileIndex();
        renderFileManager();
        showToast(`Arquivo "${fileName}" carregado!`, "success");
      };
      reader.readAsText(file);
    }
  });
}

function updateBibCounters() {
  const counterEl = document.getElementById("sidebar-bib-counter");
  if (!counterEl) return;
  const bibContent = projectFiles["references.bib"] ? projectFiles["references.bib"].content : "";
  const entries = parseBibtexEntries(bibContent);
  counterEl.innerHTML = `<span>${entries.length} ${entries.length === 1 ? "referência" : "referências"} em references.bib</span>`;
}


// --- Compilation Pipeline ---

async function compileDocument() {
  const compileBtn = document.getElementById("btn-compile");
  const pdfFrame = document.getElementById("pdf-frame");
  const placeholder = document.getElementById("pdf-placeholder");
  const downloadBtn = document.getElementById("btn-download-pdf");
  const consolePanel = document.getElementById("console-panel");
  const errorBadge = document.getElementById("error-badge");
  const errorsContainer = document.getElementById("error-items-container");
  const noErrorsMsg = document.getElementById("no-errors-msg");
  const rawLogContent = document.getElementById("raw-log-content");
  const statusDot = document.getElementById("console-status-dot");

  if (editorView && projectFiles[currentActiveFile] && !projectFiles[currentActiveFile].isBinary) {
    const doc = editorView.state.doc.toString();
    projectFiles[currentActiveFile].content = doc;
    localStorage.setItem(`latex_file_${currentActiveFile}`, doc);
  }

  if (compileBtn) {
    compileBtn.disabled = true;
    compileBtn.innerHTML = `
      <div class="spinner"></div>
      <span>Compilando...</span>
    `;
  }

  showToast("Iniciando compilação do TeX...", "info");

  const extraFiles = {};
  for (const [fname, fileObj] of Object.entries(projectFiles)) {
    if (fname !== "main.tex" && fname !== "references.bib") {
      extraFiles[fname] = fileObj.content;
    }
  }

  const payload = {
    "main.tex": projectFiles["main.tex"] ? projectFiles["main.tex"].content : "",
    "references.bib": projectFiles["references.bib"] ? projectFiles["references.bib"].content : "",
    "extra_files": extraFiles
  };

  try {
    const res = await fetch("/api/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success && data.pdf_url) {
      currentPdfJobId = data.job_id;
      pdfFrame.src = `${data.pdf_url}?t=${Date.now()}`;
      pdfFrame.classList.remove("hidden");
      if (placeholder) placeholder.classList.add("hidden");

      if (downloadBtn) {
        downloadBtn.href = data.pdf_url;
        downloadBtn.classList.remove("hidden");
      }

      showToast("Compilação concluída com sucesso!", "success");

      if (statusDot) {
        statusDot.className = "console-status-dot";
      }

      // Handle warnings or clean state
      if (data.errors && data.errors.length > 0) {
        if (errorBadge) {
          errorBadge.textContent = data.errors.length;
          errorBadge.classList.remove("hidden");
        }
        if (noErrorsMsg) noErrorsMsg.classList.add("hidden");
        renderConsoleErrors(data.errors, errorsContainer);
      } else {
        if (errorBadge) errorBadge.classList.add("hidden");
        if (noErrorsMsg) noErrorsMsg.classList.remove("hidden");
        if (errorsContainer) errorsContainer.innerHTML = "";
      }
    } else {
      showToast("Falha na compilação do documento.", "error");

      if (statusDot) {
        statusDot.className = "console-status-dot has-errors";
      }

      if (errorBadge) {
        errorBadge.textContent = (data.errors && data.errors.length) || "!";
        errorBadge.classList.remove("hidden");
      }
      if (noErrorsMsg) noErrorsMsg.classList.add("hidden");
      renderConsoleErrors(data.errors || [{ message: data.message || "Erro desconhecido" }], errorsContainer);

      // Auto-expand console on failure
      if (consolePanel) {
        consolePanel.classList.remove("collapsed");
        const arrow = document.getElementById("console-arrow");
        if (arrow) arrow.textContent = "▼ Recolher";
      }
    }

    if (rawLogContent) {
      rawLogContent.textContent = data.log || "Nenhum log retornado.";
    }
  } catch (err) {
    showToast(`Erro de conexão com o servidor: ${err.message}`, "error");
  } finally {
    if (compileBtn) {
      compileBtn.disabled = false;
      compileBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6 4 20 12 6 20 6 4"></polygon>
        </svg>
        <span>Recompilar</span>
      `;
    }
  }
}

function renderConsoleErrors(errors, container) {
  if (!container) return;
  container.innerHTML = "";
  errors.forEach(err => {
    const item = document.createElement("div");
    item.className = "error-item";
    item.innerHTML = `
      <div class="error-item-msg">${escapeHtml(err.message || String(err))}</div>
      ${err.line ? `<div class="error-item-line">Linha ${err.line}</div>` : ""}
    `;
    container.appendChild(item);
  });
}


// --- AI Assistant Modals ---

function setupAiModals() {
  const modal = document.getElementById("ai-modal");
  const openBtn = document.getElementById("btn-open-ai-modal");
  const closeBtn = document.getElementById("ai-modal-close");

  if (!modal) return;

  if (openBtn) {
    openBtn.onclick = () => modal.classList.remove("hidden");
  }
  if (closeBtn) {
    closeBtn.onclick = () => modal.classList.add("hidden");
  }

  // Modal tabs
  modal.querySelectorAll(".modal-tab-btn").forEach(btn => {
    btn.onclick = () => {
      modal.querySelectorAll(".modal-tab-btn").forEach(b => b.classList.remove("active"));
      modal.querySelectorAll(".modal-tab-pane").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.getAttribute("data-tab");
      const target = document.getElementById(`pane-ai-${tab}`);
      if (target) target.classList.add("active");
    };
  });

  // AI Layout Handler
  const runLayoutBtn = document.getElementById("btn-run-ai-layout");
  const layoutInput = document.getElementById("ai-layout-input");
  const layoutInst = document.getElementById("ai-layout-instructions");
  const layoutResBox = document.getElementById("ai-layout-result-box");
  const layoutOutput = document.getElementById("ai-layout-output");
  const layoutExpl = document.getElementById("ai-layout-explanation");
  const applyLayoutBtn = document.getElementById("btn-apply-ai-layout");

  if (runLayoutBtn) {
    runLayoutBtn.onclick = async () => {
      const code = layoutInput ? layoutInput.value.trim() : "";
      if (!code) {
        showToast("Cole o código da figura ou float para otimizar.", "warning");
        return;
      }
      runLayoutBtn.disabled = true;
      runLayoutBtn.textContent = "Otimizando com IA...";

      try {
        const res = await fetch("/api/ai/fix-layout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snippet: code, instructions: layoutInst ? layoutInst.value.trim() : "" })
        });
        const data = await res.json();
        if (data.optimized_code) {
          if (layoutResBox) layoutResBox.classList.remove("hidden");
          if (layoutOutput) layoutOutput.value = data.optimized_code;
          if (layoutExpl) layoutExpl.textContent = data.explanation || "";
          showToast("Código otimizado pela IA!", "success");
        } else {
          showToast(data.detail || "Erro ao processar com IA.", "error");
        }
      } catch (e) {
        showToast("Erro na requisição de IA.", "error");
      } finally {
        runLayoutBtn.disabled = false;
        runLayoutBtn.textContent = "Otimizar com IA";
      }
    };
  }

  if (applyLayoutBtn) {
    applyLayoutBtn.onclick = () => {
      if (!layoutOutput || !layoutOutput.value) return;
      insertAtCursor(layoutOutput.value);
      modal.classList.add("hidden");
      showToast("Código inserido no editor!", "success");
    };
  }

  // AI Table Booktabs Handler
  const runTableBtn = document.getElementById("btn-run-ai-table");
  const tableInput = document.getElementById("ai-table-input");
  const tableResBox = document.getElementById("ai-table-result-box");
  const tableOutput = document.getElementById("ai-table-output");
  const tableExpl = document.getElementById("ai-table-explanation");
  const applyTableBtn = document.getElementById("btn-apply-ai-table");

  if (runTableBtn) {
    runTableBtn.onclick = async () => {
      const raw = tableInput ? tableInput.value.trim() : "";
      if (!raw) {
        showToast("Cole dados CSV ou tabela bruta.", "warning");
        return;
      }
      runTableBtn.disabled = true;
      runTableBtn.textContent = "Formatando com IA...";

      try {
        const res = await fetch("/api/ai/format-table", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw_table: raw })
        });
        const data = await res.json();
        if (data.latex_table) {
          if (tableResBox) tableResBox.classList.remove("hidden");
          if (tableOutput) tableOutput.value = data.latex_table;
          if (tableExpl) tableExpl.textContent = data.explanation || "";
          showToast("Tabela booktabs gerada!", "success");
        } else {
          showToast(data.detail || "Erro ao formatar tabela.", "error");
        }
      } catch (e) {
        showToast("Erro na requisição de IA.", "error");
      } finally {
        runTableBtn.disabled = false;
        runTableBtn.textContent = "Gerar Tabela Booktabs";
      }
    };
  }

  if (applyTableBtn) {
    applyTableBtn.onclick = () => {
      if (!tableOutput || !tableOutput.value) return;
      insertAtCursor(tableOutput.value);
      modal.classList.add("hidden");
      showToast("Tabela inserida no editor!", "success");
    };
  }
}

function insertAtCursor(text) {
  if (!editorView) return;
  const sel = editorView.state.selection.main;
  editorView.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length },
    scrollIntoView: true
  });
  editorView.focus();
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// --- WebSocket Collaboration (CRDT) ---

function setupCollaboration() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/default-room`;
  const collabText = document.getElementById("collab-text");
  const collabDot = document.getElementById("collab-dot");

  let ws = null;
  function connect() {
    try {
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        if (collabText) collabText.textContent = "Conectado";
        if (collabDot) collabDot.classList.remove("disconnected");
      };

      ws.onclose = () => {
        if (collabText) collabText.textContent = "Desconectado";
        if (collabDot) collabDot.classList.add("disconnected");
        setTimeout(connect, 6000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      setTimeout(connect, 6000);
    }
  }

  connect();
}


// --- Application Bootstrap ---

function bootstrap() {
  // 1. Initialize CodeMirror 6 Editor
  initEditor();

  // 2. Render File Manager Tree & Tabs
  renderFileManager();

  // 3. Connect File Manager Toolbar
  const btnNewFile = document.getElementById("btn-new-file");
  if (btnNewFile) btnNewFile.onclick = () => createNewFile();

  const btnUpload = document.getElementById("btn-upload-file");
  const fileUploadInput = document.getElementById("file-upload-input");
  if (btnUpload && fileUploadInput) {
    btnUpload.onclick = () => fileUploadInput.click();
    fileUploadInput.onchange = (e) => {
      handleFileUpload(e.target.files);
      fileUploadInput.value = "";
    };
  }

  // 4. Setup Toolbar & Popovers Plugin
  const bibModal = document.getElementById("bib-modal");
  toolbarManager = setupToolbar(
    () => editorView,
    showToast,
    () => (projectFiles["references.bib"] ? projectFiles["references.bib"].content : ""),
    () => (projectFiles["main.tex"] ? projectFiles["main.tex"].content : ""),
    () => {
      if (bibModal) bibModal.classList.remove("hidden");
    }
  );

  // 5. Setup Bibliography Manager Plugin
  setupBibliographyManager({
    getBibContent: () => (projectFiles["references.bib"] ? projectFiles["references.bib"].content : ""),
    setBibContent: (newBib) => {
      if (!projectFiles["references.bib"]) {
        projectFiles["references.bib"] = { content: newBib, isBinary: false };
      } else {
        projectFiles["references.bib"].content = newBib;
      }
      localStorage.setItem("latex_file_references.bib", newBib);
      saveFileIndex();

      if (currentActiveFile === "references.bib" && editorView) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: newBib }
        });
      }
      updateBibCounters();
      renderFileManager();
    },
    insertInEditor: insertAtCursor,
    onNotification: showToast
  });

  // 6. Setup AI Modal
  setupAiModals();

  // 7. Compile Button
  const compileBtn = document.getElementById("btn-compile");
  if (compileBtn) compileBtn.onclick = () => compileDocument();

  // 8. Console Toggle & Tabs
  const consoleToggle = document.getElementById("console-toggle");
  const consolePanel = document.getElementById("console-panel");
  const consoleArrow = document.getElementById("console-arrow");

  if (consoleToggle && consolePanel) {
    consoleToggle.onclick = (e) => {
      if (e.target.closest(".console-tab-btn")) return;
      consolePanel.classList.toggle("collapsed");
      if (consoleArrow) {
        consoleArrow.textContent = consolePanel.classList.contains("collapsed") ? "▲ Expandir" : "▼ Recolher";
      }
    };
  }

  document.querySelectorAll(".console-tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".console-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.getAttribute("data-tab");
      const errView = document.getElementById("tab-errors-view");
      const rawView = document.getElementById("tab-rawlog-view");
      if (errView) errView.classList.toggle("hidden", tab !== "errors");
      if (rawView) rawView.classList.toggle("hidden", tab !== "rawlog");
    };
  });

  // 9. Setup Collaboration WebSocket
  setupCollaboration();
}

// Resilient execution
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
