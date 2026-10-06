"""
ai_service.py - On-demand AI assistant for LaTeX & BibTeX.
Connects to any OpenAI-compatible API endpoint (including 9router, Groq, Ollama, OpenAI).
Provides focused, deterministic tasks:
  1. BibTeX extraction from unstructured text/URLs
  2. Floating figure & layout optimization
  3. Professional table formatting (booktabs)
  4. Contextual compilation error fixing from .log snippets
"""

import os
import re
from typing import Any, Dict, Optional
import httpx


ROUTER_URL = os.getenv("ROUTER_URL", "https://api.openai.com/v1").rstrip("/")
ROUTER_MODEL = os.getenv("ROUTER_MODEL", "gpt-4o-mini")
ROUTER_API_KEY = os.getenv("ROUTER_API_KEY") or os.getenv("OPENAI_API_KEY", "")


def clean_markdown_code_block(content: str, language: str = "") -> str:
    """Strips wrapping markdown code blocks (e.g. ```latex ... ```) if present."""
    pattern = rf"^\s*```(?:{language})?\s*\n(.*?)```\s*$"
    match = re.search(pattern, content, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    # Strip any general triple backticks
    if content.startswith("```") and content.endswith("```"):
        lines = content.splitlines()
        if len(lines) >= 2:
            return "\n".join(lines[1:-1]).strip()
    return content.strip()


async def execute_ai_completion(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.2,
    max_tokens: int = 2000
) -> Dict[str, Any]:
    """
    Executes a POST request against the OpenAI-compatible chat completions endpoint.
    Handles network errors, auth missing, and timeouts gracefully.
    """
    if not ROUTER_API_KEY:
        return {
            "success": False,
            "error": "ROUTER_API_KEY / OPENAI_API_KEY is not set in environment.",
            "content": ""
        }

    url = f"{ROUTER_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {ROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": ROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                return {
                    "success": False,
                    "error": f"AI provider returned status {response.status_code}: {response.text[:300]}",
                    "content": ""
                }
            
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return {
                "success": True,
                "content": content
            }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to connect to AI router ({ROUTER_URL}): {str(e)}",
            "content": ""
        }


async def extract_bibtex_ai(
    input_text: str,
    web_metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Converts raw text citation, book chapter info, or scraped webpage metadata
    into an accurate, standard BibTeX entry (@article, @book, @misc, @inproceedings).
    """
    system_prompt = (
        "You are an expert academic librarian and BibTeX specialist. "
        "Your task is to convert unstructured citation text or webpage metadata into a single, perfectly formatted BibTeX entry.\n"
        "Guidelines:\n"
        "1. Output ONLY the raw BibTeX code inside a single ```bibtex code block.\n"
        "2. Choose the most appropriate entry type (@book, @article, @inproceedings, @misc, @techreport).\n"
        "3. Generate a clean citation key format: FirstAuthorSurnameYearFirstWord (e.g., feynman1963lectures, smith2022quantum).\n"
        "4. Include all available fields: title, author (separated by ' and '), year, publisher/journal, url/doi, etc.\n"
        "5. Do NOT include any conversational preamble or pleasantries."
    )

    metadata_context = ""
    if web_metadata:
        metadata_context = (
            f"\nWebpage Scraped Metadata:\n"
            f"- URL: {web_metadata.get('url', '')}\n"
            f"- Title: {web_metadata.get('title', '')}\n"
            f"- Author: {web_metadata.get('author', '')}\n"
            f"- Site: {web_metadata.get('site_name', '')}\n"
            f"- Year: {web_metadata.get('year', '')}\n"
            f"- Description: {web_metadata.get('description', '')}\n"
        )

    user_prompt = f"Convert the following information into a standard BibTeX entry:\n\n{input_text}\n{metadata_context}"

    res = await execute_ai_completion(system_prompt, user_prompt, temperature=0.1)
    if not res["success"]:
        # Heuristic deterministic fallback if AI is not configured
        fallback_key = "citation_" + re.sub(r'[^a-zA-Z0-9]', '', input_text.split()[-1] if input_text.split() else "ref")[:10].lower()
        title = web_metadata.get('title') if web_metadata and web_metadata.get('title') else input_text[:60]
        fallback_bib = (
            f"@misc{{{fallback_key},\n"
            f"  title        = {{{title}}},\n"
            f"  author       = {{{web_metadata.get('author', 'Unknown') if web_metadata else 'Unknown'}}},\n"
            f"  year         = {{{web_metadata.get('year', '2024') if web_metadata else '2024'}}},\n"
            f"  howpublished = {{\\url{{{web_metadata.get('url', '') if web_metadata else ''}}}}},\n"
            f"  note         = {{[Offline fallback without AI: {res.get('error', '')}]}}\n"
            f"}}"
        )
        return {
            "success": True,
            "source": "ai_fallback",
            "citation_key": fallback_key,
            "bibtex": fallback_bib,
            "warning": res.get("error")
        }

    bibtex_code = clean_markdown_code_block(res["content"], "bibtex")
    # Extract citation key
    match = re.search(r'@\w+\s*\{\s*([^,\s]+)', bibtex_code)
    citation_key = match.group(1).strip() if match else "ref_extracted"

    return {
        "success": True,
        "source": "ai",
        "citation_key": citation_key,
        "bibtex": bibtex_code
    }


async def optimize_latex_layout(snippet: str, user_instructions: str = "") -> Dict[str, Any]:
    """
    Assists with floating figure & table positioning:
      - Adapts floats to [!htbp] or [H] with package float
      - Converts multiple images to subcaption / subfigure
      - Fixes overflow using \\linewidth, \\columnwidth, or wrapfig
      - Ensures \\centering, correct \\caption and \\label placement
    """
    system_prompt = (
        "You are a master LaTeX typographer specializing in float placement and document layout.\n"
        "Guidelines:\n"
        "1. Return ONLY the improved LaTeX snippet wrapped in ```latex ... ``` followed by a brief 1-2 sentence explanation.\n"
        "2. When handling figures: use [!htbp], \\centering, \\includegraphics[width=...\\linewidth]{...}, and make sure \\label comes AFTER \\caption.\n"
        "3. When handling subfigures: use the modern 'subcaption' package structure (\\begin{subfigure}[b]{...\\linewidth}).\n"
        "4. When handling wide tables: suggest \\small or \\resizebox{\\columnwidth}{!}{...} or tabularx if appropriate.\n"
        "5. Keep macros clean, robust, and compile-ready."
    )

    user_prompt = (
        f"Optimize the following LaTeX snippet for best typographical layout and positioning.\n"
        f"User instructions / target goals: {user_instructions or 'Ensure optimal floating behavior and no margin overflow.'}\n\n"
        f"Code:\n```latex\n{snippet}\n```"
    )

    res = await execute_ai_completion(system_prompt, user_prompt, temperature=0.2)
    if not res["success"]:
        return {
            "success": False,
            "error": res["error"]
        }

    raw = res["content"]
    code_match = re.search(r'```(?:latex)?\s*\n(.*?)```', raw, re.DOTALL | re.IGNORECASE)
    if code_match:
        optimized_code = code_match.group(1).strip()
        explanation = raw[code_match.end():].strip()
    else:
        optimized_code = raw.strip()
        explanation = "Layout optimized according to modern TeX typographical standards."

    return {
        "success": True,
        "optimized_code": optimized_code,
        "explanation": explanation
    }


async def format_latex_table(raw_data_or_table: str) -> Dict[str, Any]:
    """
    Formats messy table data, CSV, TSV, or basic LaTeX tables into
    state-of-the-art booktabs tables without ugly vertical rules.
    """
    system_prompt = (
        "You are an expert LaTeX designer specializing in the booktabs typography package.\n"
        "Guidelines:\n"
        "1. Transform input data or basic tables into a clean, professional LaTeX table using 'booktabs'.\n"
        "2. Use \\toprule, \\midrule, and \\bottomrule. NEVER use vertical rules ('|') in academic tables.\n"
        "3. Align numbers to the right or center (e.g., r or c) and text to the left (l).\n"
        "4. Wrap inside \\begin{table}[htbp] \\centering ... \\caption{...} \\label{tab:...} \\end{table}.\n"
        "5. Output ONLY the code inside ```latex ... ``` followed by an explanation of the design choices."
    )

    user_prompt = f"Format this into a professional booktabs table:\n\n{raw_data_or_table}"

    res = await execute_ai_completion(system_prompt, user_prompt, temperature=0.1)
    if not res["success"]:
        return {
            "success": False,
            "error": res["error"]
        }

    raw = res["content"]
    code_match = re.search(r'```(?:latex)?\s*\n(.*?)```', raw, re.DOTALL | re.IGNORECASE)
    if code_match:
        table_code = code_match.group(1).strip()
        explanation = raw[code_match.end():].strip()
    else:
        table_code = raw.strip()
        explanation = "Table auto-formatted with booktabs rules."

    return {
        "success": True,
        "table_code": table_code,
        "explanation": explanation
    }


async def fix_compilation_error(
    main_tex: str,
    log_snippet: str,
    references_bib: str = ""
) -> Dict[str, Any]:
    """
    Analyzes LaTeX/BibTeX compiler errors and log snippets, locates the fault,
    and returns a direct fix for main.tex or references.bib.
    """
    system_prompt = (
        "You are a LaTeX and TeX compiler diagnostic expert.\n"
        "Analyze the provided compiler log error snippet and the current LaTeX code.\n"
        "Rules:\n"
        "1. Identify the exact root cause (e.g. unescaped character, missing package, misspelled command, missing closing brace, citation key mismatch).\n"
        "2. Provide the corrected entire main.tex (or snippet/file specified) inside a ```latex code block.\n"
        "3. Then provide a concise diagnostic note explaining what was fixed.\n"
        "4. Always output: target file name ('main.tex' or 'references.bib') at the first line, then the code block, then the explanation."
    )

    user_prompt = (
        f"--- COMPILATION LOG SNIPPET ---\n{log_snippet}\n\n"
        f"--- MAIN.TEX ---\n{main_tex}\n\n"
    )
    if references_bib:
        user_prompt += f"--- REFERENCES.BIB ---\n{references_bib}\n\n"

    res = await execute_ai_completion(system_prompt, user_prompt, temperature=0.1, max_tokens=3500)
    if not res["success"]:
        return {
            "success": False,
            "error": res["error"]
        }

    content = res["content"]
    target_file = "main.tex"
    if "references.bib" in content[:100].lower():
        target_file = "references.bib"

    code_match = re.search(r'```(?:latex|bibtex)?\s*\n(.*?)```', content, re.DOTALL | re.IGNORECASE)
    if code_match:
        fixed_code = code_match.group(1).strip()
        explanation = content[code_match.end():].strip()
    else:
        fixed_code = content.strip()
        explanation = "Error correction suggested."

    return {
        "success": True,
        "target_file": target_file,
        "fixed_code": fixed_code,
        "explanation": explanation
    }
