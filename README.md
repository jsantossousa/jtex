# LaTeX Collaborative Studio (Overleaf-like MVP)

Um editor LaTeX online colaborativo, moderno e modular, construído em Python (FastAPI), TeX Live (pdflatex + bibtex), CodeMirror 6 e Yjs CRDT, com **Gerenciador Nativo de Bibliografia** suportando resolução direta de **DOI**, **arXiv** e fallback de **IA**.

---

## 🏗️ Arquitetura do Sistema

```
latex-mvp/
├── backend/
│   ├── main.py               # API FastAPI, WebSocket Yjs CRDT e servidor de estáticos
│   ├── compiler.py           # Pipeline assíncrono multi-pass (pdflatex -> bibtex -> pdflatex x2)
│   ├── bib_service.py        # Resolução determinística de DOI (Content Negotiation) e arXiv (API)
│   ├── ai_service.py         # Assistentes sob demanda (OpenAI / 9router) para layout, tabelas e erros
│   ├── requirements.txt      # Dependências Python (FastAPI, Uvicorn, httpx, ypy-websocket, etc.)
│   └── Dockerfile            # Imagem Debian com TeX Live e pacotes tipográficos essenciais
├── frontend/
│   ├── index.html            # Interface de 3 painéis estilo Overleaf / VS Code Dark
│   ├── styles.css            # Sistema de design responsivo com dark mode elegante
│   ├── app.js                # Orquestrador do CodeMirror 6, buffers múltiplos e compilação
│   └── plugins/
│       ├── autocomplete.js   # Autocomplete determinístico (matemática, grego, \cite{} e \ref{})
│       ├── typehinting.js    # Popovers com assinaturas de comandos LaTeX ao passar o mouse
│       ├── linter.js         # Verificação estática local (delimitadores $, ambientes, chaves)
│       ├── toolbar.js        # Snippets rápidos (booktabs, subfigures, floats [!htbp])
│       └── bibliography.js   # Painel e modal de importação e catálogo BibTeX
└── docker-compose.yml        # Orquestração do container e variáveis de ambiente
```

---

## ⚡ Princípios Chave da Arquitetura

1. **Zero Tokens / Zero Latência para Tarefas Determinísticas**:
   - **DOI**: Resolução direta por Content Negotiation via cabeçalho `Accept: application/x-bibtex; charset=utf-8` contra `https://doi.org/<doi>` e CrossRef.
   - **arXiv**: Resolução direta consultando a API pública do arXiv (`export.arxiv.org`), extraindo metadados e gerando entrada `@article` com eprint.
   - **Linter & Typehinting**: Análise estática 100% no cliente sem chamadas de rede.
   - **Autocomplete Dinâmico**: Lê os identificadores de citação do buffer do `references.bib` em tempo real ao digitar `\cite{`.

2. **Compilador com Suporte Completo a Bibliografia**:
   - Execução em ambiente isolado `/tmp/latex_runs/<uuid>`.
   - Pipeline de 4 passos quando há referências:
     1. `pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape main.tex`
     2. `bibtex main`
     3. `pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape main.tex`
     4. `pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape main.tex`
   - Parser estruturado de logs: captura erros com prefixo `!`, número de linha `l.<num>` e warnings do `.blg`.

3. **IA Sob Demanda (Compatível com OpenAI / 9router)**:
   - Extração de BibTeX para texto livre ou páginas sem DOI.
   - Otimização de posicionamento de figuras flutuantes (`[!htbp]`, `subcaption`, `wrapfig`).
   - Conversão de dados brutos para tabelas limpas `booktabs` (sem linhas verticais).
   - Diagnóstico e correção de erros de compilação diretamente pelo log do TeX.

4. **Colaboração em Tempo Real**:
   - Protocolo Yjs CRDT via WebSocket para sincronização instantânea entre múltiplos navegadores.

---

## 🚀 Como Executar

### Opção 1: Via Docker Compose (Recomendado)

Na raiz do repositório ou na pasta `latex-mvp/`:

```bash
docker-compose up --build
```

O aplicativo estará disponível em:
👉 **http://localhost:8000**

#### Configurando IA (Opcional):
Para habilitar os assistentes de IA (9router, OpenAI, Ollama, etc.), defina as variáveis no seu `.env` ou execute:

```bash
ROUTER_URL="https://api.openai.com/v1" \
ROUTER_MODEL="gpt-4o-mini" \
ROUTER_API_KEY="sua_chave_aqui" \
docker-compose up
```

---

### Opção 2: Execução Local (Sem Docker)

Certifique-se de ter `pdflatex` e `bibtex` instalados no sistema (`texlive-latex-base`, `texlive-latex-extra`, `texlive-bibtex-extra`).

```bash
cd latex-mvp
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# Iniciar servidor
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Acesse **http://localhost:8000**.

---

## 🧪 Testando os Recursos Imediatamente

1. **Importação Instantânea de DOI Real**:
   - Clique no botão **"Referências BibTeX"** no topo.
   - No campo de entrada, cole o DOI:
     ```
     10.1103/PhysRevLett.116.061102
     ```
   - Clique em **"Buscar / Gerar BibTeX"**.
   - O BibTeX oficial do paper de ondas gravitacionais da LIGO (`Abbott_2016`) será recuperado instantaneamente (0 tokens de IA).
   - Clique em **"+ Adicionar ao references.bib"**.

2. **Importação de Artigo do arXiv**:
   - Cole o ID `1706.03762` ou `https://arxiv.org/abs/1706.03762` ("Attention Is All You Need").
   - O BibTeX será montado estruturado com chave `vaswani2017attention`.

3. **Autocomplete de Citações no Editor**:
   - No arquivo `main.tex`, digite:
     ```latex
     \cite{
     ```
   - Uma lista suspensa interativa exibirá automaticamente todas as chaves cadastradas em `references.bib` com autor, ano e título!

4. **Compilação e Visualização de PDF**:
   - Pressione **Ctrl+Enter** (ou clique em **Recompilar**).
   - O visualizador exibirá o PDF renderizado com o abstract, as equações matemáticas, a tabela `booktabs` e as referências bibliográficas linkadas.
