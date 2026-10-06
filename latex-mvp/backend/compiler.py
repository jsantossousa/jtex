"""
compiler.py - Robust, sandboxed LaTeX & BibTeX compilation pipeline.
Executes:
  1. pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape main.tex
  2. bibtex main (if bibliography is used)
  3. pdflatex x2 (to resolve cross-references and citations)
Strict 20-second timeout, security flags, and precise log filtering (! prefix & .blg warnings).
"""

import asyncio
import os
import re
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


RUNS_BASE_DIR = Path("/tmp/latex_runs")
OUTPUT_PDF_DIR = RUNS_BASE_DIR / "output"
RUNS_BASE_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_PDF_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_TIMEOUT = 25.0  # seconds


def parse_latex_log(log_content: str, blg_content: str = "") -> Tuple[List[Dict[str, Any]], List[str], str]:
    """
    Parses LaTeX and BibTeX logs to extract:
      - Structured errors (lines starting with '!', accompanied by line numbers 'l.<num>')
      - Warnings (LaTeX Warning: ..., BibTeX Warning--...)
      - Cleaned human-friendly log excerpt
    """
    errors: List[Dict[str, Any]] = []
    warnings: List[str] = []
    clean_lines: List[str] = []

    lines = log_content.splitlines()
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i].rstrip()

        # Capture LaTeX fatal/critical errors (lines starting with '!')
        if line.startswith("!"):
            error_msg = line[1:].strip()
            line_num: Optional[int] = None
            snippet = ""

            # Scan the next few lines for 'l.<number>' and code excerpt
            j = i + 1
            context_lines = []
            while j < min(n, i + 8):
                next_line = lines[j].rstrip()
                if next_line.startswith("!"):
                    break
                line_match = re.search(r'^l\.(\d+)\s*(.*)', next_line)
                if line_match:
                    line_num = int(line_match.group(1))
                    snippet = line_match.group(2).strip()
                    context_lines.append(next_line)
                    break
                context_lines.append(next_line)
                j += 1

            errors.append({
                "message": error_msg,
                "line": line_num,
                "snippet": snippet,
                "context": "\n".join(context_lines)
            })
            clean_lines.append(f"ERROR: {line}")
            if context_lines:
                clean_lines.extend(context_lines)

        # Capture LaTeX Warnings
        elif "LaTeX Warning:" in line:
            warning_text = line.split("LaTeX Warning:", 1)[1].strip()
            warnings.append(warning_text)
            clean_lines.append(f"WARNING: {warning_text}")

        # Capture missing character or font warnings
        elif "Missing character:" in line:
            warnings.append(line.strip())

        i += 1

    # BibTeX log (.blg) inspection
    if blg_content:
        for blg_line in blg_content.splitlines():
            blg_line_str = blg_line.strip()
            if blg_line_str.startswith("Warning--"):
                w_msg = blg_line_str.replace("Warning--", "BibTeX: ").strip()
                warnings.append(w_msg)
                clean_lines.append(f"BIBTEX WARNING: {w_msg}")
            elif "error message" in blg_line_str.lower() or blg_line_str.startswith("!"):
                errors.append({
                    "message": f"BibTeX error: {blg_line_str}",
                    "line": None,
                    "snippet": "",
                    "context": blg_line_str
                })
                clean_lines.append(f"BIBTEX ERROR: {blg_line_str}")

    clean_log = "\n".join(clean_lines)
    return errors, warnings, clean_log


async def run_command_with_timeout(cmd: List[str], cwd: Path, timeout: float = DEFAULT_TIMEOUT) -> Tuple[int, str, str]:
    """Runs a system command asynchronously with a strict timeout."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        stdout = stdout_bytes.decode("utf-8", errors="replace")
        stderr = stderr_bytes.decode("utf-8", errors="replace")
        return proc.returncode or 0, stdout, stderr
    except asyncio.TimeoutError:
        try:
            proc.kill()
            await proc.wait()
        except ProcessLookupError:
            pass
        raise TimeoutError(f"Command '{' '.join(cmd)}' timed out after {timeout}s")


async def compile_latex(
    main_tex: str,
    references_bib: Optional[str] = None,
    extra_files: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Compiles LaTeX and BibTeX in an ephemeral, isolated workspace.
    Execution steps:
      1. pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape main.tex
      2. If bibliography is referenced: bibtex main
      3. pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape main.tex
      4. pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape main.tex
    Returns structured results, errors, warnings, clean logs, and public PDF URL.
    """
    job_id = str(uuid.uuid4())
    job_dir = RUNS_BASE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Sanitize troublesome unicode characters (e.g. U+2009 thin spaces, U+00A0 non-breaking spaces)
        clean_main = main_tex.replace('\u2009', ' ').replace('\u200a', ' ').replace('\u00a0', '~').replace('\u2013', '--').replace('\u2014', '---')
        main_path = job_dir / "main.tex"
        main_path.write_text(clean_main, encoding="utf-8")

        # Write references.bib if provided
        has_bib_file = False
        if references_bib and references_bib.strip():
            clean_bib = references_bib.replace('\u2009', ' ').replace('\u200a', ' ').replace('\u00a0', '~').replace('\u2013', '--').replace('\u2014', '---')
            bib_path = job_dir / "references.bib"
            bib_path.write_text(clean_bib, encoding="utf-8")
            has_bib_file = True

        # Write any auxiliary extra files (e.g. style files, macros, images)
        if extra_files:
            import base64
            for fname, fcontent in extra_files.items():
                target = job_dir / fname
                target.parent.mkdir(parents=True, exist_ok=True)
                if isinstance(fcontent, str) and fcontent.startswith("data:") and ";base64," in fcontent:
                    _, b64_data = fcontent.split(";base64,", 1)
                    try:
                        target.write_bytes(base64.b64decode(b64_data))
                    except Exception:
                        target.write_text(fcontent, encoding="utf-8")
                elif isinstance(fcontent, str) and fcontent.startswith("base64:"):
                    try:
                        target.write_bytes(base64.b64decode(fcontent[7:]))
                    except Exception:
                        target.write_text(fcontent, encoding="utf-8")
                else:
                    target.write_text(fcontent, encoding="utf-8")

        # Check if document uses bibliography
        needs_bibtex = (
            has_bib_file or
            r"\bibliography" in main_tex or
            r"\addbibresource" in main_tex or
            r"\cite{" in main_tex or
            r"\citep{" in main_tex or
            r"\citet{" in main_tex
        )

        base_cmd = [
            "pdflatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-no-shell-escape",
            "main.tex"
        ]

        # Step 1: First pdflatex pass
        code, stdout, stderr = await run_command_with_timeout(base_cmd, cwd=job_dir, timeout=DEFAULT_TIMEOUT)

        aux_file = job_dir / "main.aux"
        log_file = job_dir / "main.log"
        blg_file = job_dir / "main.blg"
        pdf_file = job_dir / "main.pdf"

        # Check if BibTeX is needed and aux contains citation or bibdata
        ran_bibtex = False
        if code == 0 and needs_bibtex and aux_file.exists():
            aux_text = aux_file.read_text(encoding="utf-8", errors="replace")
            if r"\bibdata" in aux_text or r"\citation" in aux_text:
                # Step 2: Run bibtex main
                bib_code, bib_out, bib_err = await run_command_with_timeout(
                    ["bibtex", "main"],
                    cwd=job_dir,
                    timeout=15.0
                )
                ran_bibtex = True

                # Step 3 & 4: Second and Third pdflatex passes to link references & labels
                await run_command_with_timeout(base_cmd, cwd=job_dir, timeout=DEFAULT_TIMEOUT)
                await run_command_with_timeout(base_cmd, cwd=job_dir, timeout=DEFAULT_TIMEOUT)

        elif code == 0 and (r"\ref{" in main_tex or r"\pageref{" in main_tex):
            # Two passes for standard cross-references even without bibtex
            await run_command_with_timeout(base_cmd, cwd=job_dir, timeout=DEFAULT_TIMEOUT)

        # Read logs
        raw_log = log_file.read_text(encoding="utf-8", errors="replace") if log_file.exists() else stdout
        blg_log = blg_file.read_text(encoding="utf-8", errors="replace") if blg_file.exists() else ""

        errors, warnings, clean_log = parse_latex_log(raw_log, blg_log)
        pdf_exists = pdf_file.exists() and pdf_file.stat().st_size > 0

        # Success requires valid PDF output and no fatal halt
        is_success = pdf_exists and len(errors) == 0

        pdf_url = None
        if pdf_exists:
            # Store in permanent output location for download/preview
            final_pdf_path = OUTPUT_PDF_DIR / f"{job_id}.pdf"
            shutil.copyfile(pdf_file, final_pdf_path)
            pdf_url = f"/api/pdf/{job_id}"

        return {
            "success": is_success,
            "job_id": job_id,
            "pdf_url": pdf_url,
            "ran_bibtex": ran_bibtex,
            "errors": errors,
            "warnings": warnings,
            "clean_log": clean_log,
            "raw_log": raw_log
        }

    except TimeoutError as te:
        return {
            "success": False,
            "job_id": job_id,
            "pdf_url": None,
            "ran_bibtex": False,
            "errors": [{"message": str(te), "line": None, "snippet": "", "context": ""}],
            "warnings": [],
            "clean_log": f"TIMEOUT: {str(te)}",
            "raw_log": f"LaTeX execution exceeded maximum allowed time ({DEFAULT_TIMEOUT}s)."
        }
    except Exception as exc:
        return {
            "success": False,
            "job_id": job_id,
            "pdf_url": None,
            "ran_bibtex": False,
            "errors": [{"message": f"Compilation crashed: {str(exc)}", "line": None, "snippet": "", "context": ""}],
            "warnings": [],
            "clean_log": f"SYSTEM ERROR: {str(exc)}",
            "raw_log": str(exc)
        }
    finally:
        # Cleanup temporary compilation artifacts (aux, log, etc.), but keep the PDF in OUTPUT_PDF_DIR
        try:
            shutil.rmtree(job_dir, ignore_errors=True)
        except Exception:
            pass


def get_compiled_pdf_path(job_id: str) -> Optional[Path]:
    """Retrieves the Path to the compiled PDF if it exists."""
    # Sanitize job_id to prevent directory traversal
    safe_id = re.sub(r'[^a-zA-Z0-9\-]', '', job_id)
    pdf_path = OUTPUT_PDF_DIR / f"{safe_id}.pdf"
    if pdf_path.exists() and pdf_path.is_file():
        return pdf_path
    return None
