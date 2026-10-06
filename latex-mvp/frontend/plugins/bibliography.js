/**
 * bibliography.js - Universal Bibliography Manager Plugin.
 * Interacts with backend/bib_service.py:
 *   - Direct DOI Content Negotiation (Accept: application/x-bibtex)
 *   - Direct arXiv API resolution (@article with eprint & metadata)
 *   - AI Fallback for arbitrary URLs or free text
 *   - Live cataloging & one-click insertion into references.bib and editor
 */

import { parseBibtexEntries } from "./autocomplete.js";

export function setupBibliographyManager({
  getBibContent,
  setBibContent,
  insertInEditor,
  onNotification
}) {
  const bibModal = document.getElementById("bib-modal");
  const bibOpenBtn = document.getElementById("btn-open-bib-modal");
  const bibCloseBtn = document.getElementById("bib-modal-close");
  const bibInput = document.getElementById("bib-query-input");
  const bibSearchBtn = document.getElementById("bib-search-btn");
  const bibLoading = document.getElementById("bib-loading-spinner");
  const bibPreviewContainer = document.getElementById("bib-preview-container");
  const bibPreviewCode = document.getElementById("bib-preview-code");
  const bibKeyBadge = document.getElementById("bib-key-badge");
  const bibSourceBadge = document.getElementById("bib-source-badge");
  const btnInsertBib = document.getElementById("btn-insert-bib");
  const btnCopyCite = document.getElementById("btn-copy-cite");
  const btnInsertCiteCursor = document.getElementById("btn-insert-cite-cursor");
  const bibCatalogList = document.getElementById("bib-catalog-list");
  const bibCatalogSearch = document.getElementById("bib-catalog-search");

  let currentResolvedData = null;

  // Open / Close Modal
  if (bibOpenBtn) {
    bibOpenBtn.addEventListener("click", () => {
      openBibModal();
    });
  }

  if (bibCloseBtn) {
    bibCloseBtn.addEventListener("click", () => {
      closeBibModal();
    });
  }

  // Close on outside click
  window.addEventListener("click", (e) => {
    if (e.target === bibModal) {
      closeBibModal();
    }
  });

  function openBibModal() {
    bibModal.classList.remove("hidden");
    refreshCatalogList();
    bibInput.focus();
  }

  function closeBibModal() {
    bibModal.classList.add("hidden");
  }

  // Enter key trigger search
  bibInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeSearch();
    }
  });

  bibSearchBtn.addEventListener("click", () => {
    executeSearch();
  });

  async function executeSearch() {
    const query = bibInput.value.trim();
    if (!query) {
      if (onNotification) onNotification("Digite um DOI, arXiv ID, URL ou título.", "warning");
      return;
    }

    setLoading(true);
    bibPreviewContainer.classList.add("hidden");

    try {
      // Step 1: Query deterministic resolver
      const resp = await fetch("/api/bib/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: query })
      });

      if (!resp.ok) {
        throw new Error(`Erro na resolução HTTP ${resp.status}`);
      }

      const data = await resp.json();

      if (data.requires_ai) {
        // Needs AI fallback endpoint
        if (onNotification) onNotification("Consultando IA especializada para referências não estruturadas...", "info");
        const aiResp = await fetch("/api/ai/extract-bibtex", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: data.raw_text || query,
            url: data.url || null
          })
        });
        const aiData = await aiResp.json();
        if (!aiData.success && !aiData.bibtex) {
          throw new Error(aiData.error || "Falha na extração de BibTeX com IA.");
        }
        displayResult({
          source: "ai",
          citation_key: aiData.citation_key,
          bibtex: aiData.bibtex,
          message: "Extraído via IA"
        });
      } else if (data.success && data.bibtex) {
        displayResult(data);
      } else {
        throw new Error(data.error || "Nenhuma referência encontrada para esta entrada.");
      }

    } catch (err) {
      if (onNotification) onNotification(`Erro ao buscar referência: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  function displayResult(data) {
    currentResolvedData = data;
    bibPreviewContainer.classList.remove("hidden");
    bibPreviewCode.value = data.bibtex;

    bibKeyBadge.textContent = `\\cite{${data.citation_key}}`;
    bibSourceBadge.textContent = data.source ? data.source.toUpperCase() : "RESOLVED";

    if (data.source === "doi") {
      bibSourceBadge.className = "badge badge-success";
    } else if (data.source === "arxiv") {
      bibSourceBadge.className = "badge badge-primary";
    } else {
      bibSourceBadge.className = "badge badge-warning";
    }

    if (onNotification) {
      onNotification(`Referência ${data.citation_key} obtida com sucesso!`, "success");
    }
  }

  function setLoading(isLoading) {
    if (isLoading) {
      bibLoading.classList.remove("hidden");
      bibSearchBtn.disabled = true;
      bibSearchBtn.textContent = "Buscando...";
    } else {
      bibLoading.classList.add("hidden");
      bibSearchBtn.disabled = false;
      bibSearchBtn.textContent = "Buscar / Gerar BibTeX";
    }
  }

  // Insert into references.bib
  btnInsertBib.addEventListener("click", () => {
    if (!currentResolvedData || !currentResolvedData.bibtex) return;

    const currentBib = getBibContent() || "";
    const bibToAdd = bibPreviewCode.value.trim();

    // Check if key already exists in references.bib
    const existing = parseBibtexEntries(currentBib);
    const keyMatch = /@\w+\s*\{\s*([^,\s]+)/.exec(bibToAdd);
    const key = keyMatch ? keyMatch[1] : "";

    if (existing.some(e => e.key === key)) {
      if (onNotification) onNotification(`Atenção: A chave '${key}' já existe no references.bib. Adicionando assim mesmo.`, "warning");
    }

    const updated = currentBib.trim() ? `${currentBib.trim()}\n\n${bibToAdd}\n` : `${bibToAdd}\n`;
    setBibContent(updated);

    refreshCatalogList();
    if (onNotification) onNotification(`Referência inserida no references.bib com sucesso!`, "success");
  });

  // Copy \cite{key}
  btnCopyCite.addEventListener("click", () => {
    if (!currentResolvedData) return;
    const key = currentResolvedData.citation_key;
    const citeCmd = `\\cite{${key}}`;
    navigator.clipboard.writeText(citeCmd).then(() => {
      if (onNotification) onNotification(`Comando '${citeCmd}' copiado para a área de transferência!`, "success");
    });
  });

  // Insert \cite{key} at current editor cursor
  btnInsertCiteCursor.addEventListener("click", () => {
    if (!currentResolvedData) return;
    const key = currentResolvedData.citation_key;
    const citeCmd = `\\cite{${key}}`;
    insertInEditor(citeCmd);
    closeBibModal();
    if (onNotification) onNotification(`'${citeCmd}' inserido no documento!`, "success");
  });

  // Catalog search filtering
  if (bibCatalogSearch) {
    bibCatalogSearch.addEventListener("input", () => {
      refreshCatalogList(bibCatalogSearch.value.trim());
    });
  }

  // Render catalog list of all existing references
  function refreshCatalogList(filter = "") {
    if (!bibCatalogList) return;
    const bibText = getBibContent() || "";
    const entries = parseBibtexEntries(bibText);
    bibCatalogList.innerHTML = "";

    const filtered = entries.filter(e => {
      if (!filter) return true;
      const term = filter.toLowerCase();
      return (
        e.key.toLowerCase().includes(term) ||
        (e.title && e.title.toLowerCase().includes(term)) ||
        (e.author && e.author.toLowerCase().includes(term)) ||
        (e.year && e.year.includes(term))
      );
    });

    if (filtered.length === 0) {
      bibCatalogList.innerHTML = `<div class="empty-state">Nenhuma referência encontrada em references.bib</div>`;
      return;
    }

    filtered.forEach(entry => {
      const item = document.createElement("div");
      item.className = "bib-catalog-item";
      item.innerHTML = `
        <div class="item-header">
          <span class="item-key">\\cite{${escapeHtml(entry.key)}}</span>
          <span class="item-type">${escapeHtml(entry.type)}</span>
        </div>
        <div class="item-title">${escapeHtml(entry.title || "Sem título")}</div>
        <div class="item-meta">${escapeHtml(entry.author || "Autor desconhecido")} ${entry.year ? `(${entry.year})` : ""}</div>
        <div class="item-actions">
          <button class="btn btn-xs btn-outline btn-cite-copy" title="Copiar citação">Copiar \\cite</button>
          <button class="btn btn-xs btn-primary btn-cite-insert" title="Inserir no cursor do editor">Inserir</button>
        </div>
      `;

      item.querySelector(".btn-cite-copy").addEventListener("click", () => {
        navigator.clipboard.writeText(`\\cite{${entry.key}}`).then(() => {
          if (onNotification) onNotification(`\\cite{${entry.key}} copiado!`, "success");
        });
      });

      item.querySelector(".btn-cite-insert").addEventListener("click", () => {
        insertInEditor(`\\cite{${entry.key}}`);
        closeBibModal();
        if (onNotification) onNotification(`\\cite{${entry.key}} inserido!`, "success");
      });

      bibCatalogList.appendChild(item);
    });
  }

  return {
    openBibModal,
    closeBibModal,
    refreshCatalogList
  };
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
