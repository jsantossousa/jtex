# Multi-stage lightweight Dockerfile for LaTeX Studio MVP
FROM python:3.11-slim-bookworm AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install essential TeX Live distribution and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-bibtex-extra \
    texlive-fonts-recommended \
    biber \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Create temporary runs directory with proper permissions
RUN mkdir -p /tmp/latex_runs/output && chmod -R 777 /tmp/latex_runs

# Copy backend and frontend source code
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/

WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
