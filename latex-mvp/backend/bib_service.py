"""
bib_service.py - Deterministic bibliography resolver for DOIs, arXiv, and web scrapers.
Strictly local & deterministic for DOIs and arXiv IDs; fallback scraper for AI enrichment.
"""

import re
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple
import httpx
from bs4 import BeautifulSoup


# Regex patterns
DOI_REGEX = re.compile(r'\b(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)\b', re.IGNORECASE)
ARXIV_ID_REGEX = re.compile(
    r'(?:arxiv:\s*|arxiv\.org/(?:abs|pdf)/)?([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?|[a-z\-]+(?:\.[A-Z]{2})?/[0-9]{7})',
    re.IGNORECASE
)
URL_REGEX = re.compile(r'https?://[^\s/$.?#].[^\s]*', re.IGNORECASE)


def normalize_doi(input_str: str) -> Optional[str]:
    """
    Extracts and normalizes a DOI from a raw string, DOI URL, or text.
    Handles formats like:
      - 10.1103/PhysRevLett.116.061102
      - https://doi.org/10.1103/PhysRevLett.116.061102
      - http://dx.doi.org/10.1016/j.cell.2020.08.001
      - doi: 10.1103/PhysRevLett.116.061102
    """
    cleaned = input_str.strip()
    # Remove prefix if present
    cleaned = re.sub(r'^(?:https?://)?(?:dx\.)?doi\.org/', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'^doi:\s*', '', cleaned, flags=re.IGNORECASE)

    match = DOI_REGEX.search(cleaned)
    if match:
        doi = match.group(1).rstrip('.')
        return doi
    return None


def normalize_arxiv(input_str: str) -> Optional[str]:
    """
    Extracts an arXiv identifier from raw input, URL, or identifier string.
    Handles formats like:
      - 2301.00000
      - 2301.00000v2
      - https://arxiv.org/abs/2301.00000
      - arxiv:2301.00000
      - cond-mat/0201001
    """
    cleaned = input_str.strip()
    match = ARXIV_ID_REGEX.search(cleaned)
    if match:
        return match.group(1)
    return None


def sanitize_bibtex_unicode(bibtex_str: str) -> str:
    """
    Sanitizes exotic Unicode characters frequently returned by DOI APIs (e.g. CrossRef/doi.org)
    that crash pdflatex without specialized unicode packages:
      - U+2009 (thin space) -> standard space
      - U+200A (hair space) -> standard space
      - U+200B (zero width space) -> removed
      - U+00A0 (non-breaking space) -> ~
      - U+2013 / U+2014 (en/em dashes) -> -- / ---
      - U+2018 / U+2019 (single quotes) -> '
      - U+201C / U+201D (double quotes) -> "
      - U+2212 (math minus) -> -
    """
    replacements = {
        '\u2009': ' ',
        '\u200a': ' ',
        '\u200b': '',
        '\u00a0': '~',
        '\u2013': '--',
        '\u2014': '---',
        '\u2018': "'",
        '\u2019': "'",
        '\u201c': '"',
        '\u201d': '"',
        '\u2026': '...',
        '\u2212': '-',
    }
    cleaned = bibtex_str
    for k, v in replacements.items():
        cleaned = cleaned.replace(k, v)
    return cleaned


def extract_bibtex_key(bibtex_str: str) -> str:
    """
    Extracts the citation key from a BibTeX entry string.
    Example: '@article{Abbott_2016,' -> 'Abbott_2016'
    """
    match = re.search(r'@\w+\s*\{\s*([^,\s]+)', bibtex_str)
    if match:
        return match.group(1).strip()
    return "ref_" + str(abs(hash(bibtex_str)) % 100000)


def extract_bib_entries(bib_content: str) -> List[Dict[str, Any]]:
    """
    Parses a references.bib string and returns a structured list of entries
    for autocomplete and cataloging.
    """
    entries = []
    # Pattern to match entry type and key: @article{key,
    entry_pattern = re.compile(r'@(\w+)\s*\{\s*([^,\s]+)\s*,', re.IGNORECASE)

    # Split by entries
    raw_blocks = re.split(r'(?=@\w+\s*\{)', bib_content)

    for block in raw_blocks:
        match = entry_pattern.search(block)
        if not match:
            continue
        entry_type = match.group(1).lower()
        key = match.group(2).strip()

        # Extract title
        title_match = re.search(r'title\s*=\s*[\{"]([^"\}]+)[\}"]', block, re.IGNORECASE)
        title = title_match.group(1).strip() if title_match else ""

        # Extract author
        author_match = re.search(r'author\s*=\s*[\{"]([^"\}]+)[\}"]', block, re.IGNORECASE)
        author = author_match.group(1).strip() if author_match else ""

        # Extract year
        year_match = re.search(r'year\s*=\s*[\{"]?(\d{4})[\}"]?', block, re.IGNORECASE)
        year = year_match.group(1).strip() if year_match else ""

        entries.append({
            "key": key,
            "type": entry_type,
            "title": title,
            "author": author,
            "year": year,
            "raw": block.strip()
        })

    return entries


async def resolve_doi(doi: str) -> Dict[str, Any]:
    """
    Deterministically resolves a DOI into BibTeX via official Content Negotiation:
    Header Accept: application/x-bibtex; charset=utf-8 against https://doi.org/<doi>.
    Fallback to CrossRef API if doi.org redirects fail.
    Cost: 0 tokens, instant.
    """
    clean_doi = normalize_doi(doi) or doi.strip()
    url = f"https://doi.org/{clean_doi}"
    headers = {
        "Accept": "application/x-bibtex; charset=utf-8",
        "User-Agent": "LaTeX-Studio-BibResolver/1.0 (https://github.com/latex-studio; mailto:resolver@latexstudio.org)"
    }

    async with httpx.AsyncClient(follow_redirects=True, timeout=12.0) as client:
        try:
            response = await client.get(url, headers=headers)
            if response.status_code == 200 and "@" in response.text:
                bibtex = sanitize_bibtex_unicode(response.text.strip())
                key = extract_bibtex_key(bibtex)
                return {
                    "success": True,
                    "source": "doi",
                    "doi": clean_doi,
                    "citation_key": key,
                    "bibtex": bibtex,
                    "message": "Resolved via DOI Content Negotiation"
                }
        except httpx.HTTPError:
            pass

        # Fallback to Crossref Work transformation endpoint
        try:
            cr_url = f"https://api.crossref.org/works/{clean_doi}/transform/application/x-bibtex"
            cr_resp = await client.get(cr_url, headers=headers)
            if cr_resp.status_code == 200 and "@" in cr_resp.text:
                bibtex = sanitize_bibtex_unicode(cr_resp.text.strip())
                key = extract_bibtex_key(bibtex)
                return {
                    "success": True,
                    "source": "doi",
                    "doi": clean_doi,
                    "citation_key": key,
                    "bibtex": bibtex,
                    "message": "Resolved via CrossRef API"
                }
        except Exception as e:
            return {
                "success": False,
                "source": "doi",
                "error": f"Failed to resolve DOI '{clean_doi}': {str(e)}"
            }

    return {
        "success": False,
        "source": "doi",
        "error": f"DOI '{clean_doi}' returned no BibTeX representation."
    }


async def resolve_arxiv(arxiv_input: str) -> Dict[str, Any]:
    """
    Deterministically queries the arXiv API (export.arxiv.org/api/query)
    and formats an official @article BibTeX entry.
    Cost: 0 tokens, instant.
    """
    arxiv_id = normalize_arxiv(arxiv_input) or arxiv_input.strip()
    # Strip version suffix for search if needed or keep it
    search_id = arxiv_id.split('v')[0] if 'v' in arxiv_id else arxiv_id
    query_url = f"http://export.arxiv.org/api/query?id_list={search_id}&max_results=1"

    async with httpx.AsyncClient(follow_redirects=True, timeout=12.0) as client:
        try:
            response = await client.get(query_url)
            if response.status_code != 200:
                return {
                    "success": False,
                    "source": "arxiv",
                    "error": f"arXiv API returned HTTP {response.status_code}"
                }
            
            root = ET.fromstring(response.text)
            ns = {
                'atom': 'http://www.w3.org/2005/Atom',
                'arxiv': 'http://arxiv.org/schemas/atom'
            }

            entry = root.find('atom:entry', ns)
            if entry is None:
                return {
                    "success": False,
                    "source": "arxiv",
                    "error": f"No arXiv entry found for ID {arxiv_id}"
                }

            # Check if title indicates an error
            title_elem = entry.find('atom:title', ns)
            raw_title = title_elem.text if title_elem is not None and title_elem.text else ""
            if "Error" in raw_title and len(raw_title) < 30:
                return {
                    "success": False,
                    "source": "arxiv",
                    "error": f"arXiv API error: {raw_title}"
                }

            # Clean Title
            title = " ".join(raw_title.split())

            # Authors
            authors = []
            for author_elem in entry.findall('atom:author', ns):
                name_elem = author_elem.find('atom:name', ns)
                if name_elem is not None and name_elem.text:
                    authors.append(name_elem.text.strip())
            author_str = " and ".join(authors) if authors else "Unknown Author"

            # Year
            published_elem = entry.find('atom:published', ns)
            year = published_elem.text[:4] if published_elem is not None and published_elem.text else "2024"

            # Primary category
            primary_cat_elem = entry.find('arxiv:primary_category', ns)
            primary_class = primary_cat_elem.get('term') if primary_cat_elem is not None else ""

            # DOI and journal_ref if published
            doi_elem = entry.find('arxiv:doi', ns)
            doi = doi_elem.text.strip() if doi_elem is not None and doi_elem.text else ""

            journal_ref_elem = entry.find('arxiv:journal_ref', ns)
            journal_ref = journal_ref_elem.text.strip() if journal_ref_elem is not None and journal_ref_elem.text else f"arXiv preprint arXiv:{arxiv_id}"

            # Generate citation key: e.g. vaswani2017attention
            first_author_last = "arxiv"
            if authors:
                first_name_parts = authors[0].split()
                first_author_last = re.sub(r'[^a-zA-Z]', '', first_name_parts[-1]).lower()

            # First significant word from title
            title_words = [re.sub(r'[^a-zA-Z]', '', w).lower() for w in title.split() if len(w) > 3]
            keyword = title_words[0] if title_words else "paper"

            citation_key = f"{first_author_last}{year}{keyword}"

            # Format BibTeX
            lines = [
                f"@article{{{citation_key},",
                f"  author        = {{{author_str}}},",
                f"  title         = {{{title}}},",
                f"  journal       = {{{journal_ref}}},",
                f"  year          = {{{year}}},",
                f"  eprint        = {{{arxiv_id}}},",
                f"  archivePrefix = {{arXiv}},"
            ]
            if primary_class:
                lines.append(f"  primaryClass  = {{{primary_class}}},")
            if doi:
                lines.append(f"  doi           = {{{doi}}},")
            lines.append(f"  url           = {{https://arxiv.org/abs/{arxiv_id}}}")
            lines.append("}")

            bibtex = "\n".join(lines)

            return {
                "success": True,
                "source": "arxiv",
                "arxiv_id": arxiv_id,
                "citation_key": citation_key,
                "bibtex": bibtex,
                "metadata": {
                    "title": title,
                    "authors": authors,
                    "year": year,
                    "primary_class": primary_class,
                    "doi": doi
                },
                "message": f"Successfully parsed arXiv:{arxiv_id}"
            }
        except Exception as e:
            return {
                "success": False,
                "source": "arxiv",
                "error": f"Failed to fetch arXiv paper {arxiv_id}: {str(e)}"
            }


async def scrape_url_metadata(url: str) -> Dict[str, Any]:
    """
    Extracts HTML metadata from an arbitrary webpage to assist AI BibTeX generation.
    Scrapes title, author, description, open graph tags, and Highwire Press citation tags.
    Also detects if the page references a DOI directly, allowing a free DOI resolution!
    """
    clean_url = url.strip()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }

    metadata: Dict[str, Any] = {
        "url": clean_url,
        "title": "",
        "author": "",
        "site_name": "",
        "year": "",
        "description": "",
        "detected_doi": None
    }

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=8.0) as client:
            response = await client.get(clean_url, headers=headers)
            if response.status_code != 200:
                return metadata

            soup = BeautifulSoup(response.text, "html.parser")

            # Check Highwire Press citation metadata (Scholar/Springer/ACM/IEEE)
            citation_title = soup.find("meta", attrs={"name": "citation_title"})
            if citation_title and citation_title.get("content"):
                metadata["title"] = citation_title["content"].strip()

            citation_author = soup.find_all("meta", attrs={"name": "citation_author"})
            if citation_author:
                authors = [a["content"].strip() for a in citation_author if a.get("content")]
                metadata["author"] = " and ".join(authors)

            citation_date = soup.find("meta", attrs={"name": "citation_date"}) or soup.find("meta", attrs={"name": "citation_publication_date"})
            if citation_date and citation_date.get("content"):
                date_str = citation_date["content"].strip()
                match = re.search(r'\b(19\d\d|20\d\d)\b', date_str)
                if match:
                    metadata["year"] = match.group(1)

            citation_doi = soup.find("meta", attrs={"name": "citation_doi"})
            if citation_doi and citation_doi.get("content"):
                metadata["detected_doi"] = normalize_doi(citation_doi["content"])

            # Fallback to OpenGraph / Twitter / Standard HTML
            if not metadata["title"]:
                og_title = soup.find("meta", property="og:title")
                if og_title and og_title.get("content"):
                    metadata["title"] = og_title["content"].strip()
                elif soup.title and soup.title.string:
                    metadata["title"] = soup.title.string.strip()

            if not metadata["author"]:
                meta_author = soup.find("meta", attrs={"name": "author"})
                if meta_author and meta_author.get("content"):
                    metadata["author"] = meta_author["content"].strip()

            og_site = soup.find("meta", property="og:site_name")
            if og_site and og_site.get("content"):
                metadata["site_name"] = og_site["content"].strip()

            og_desc = soup.find("meta", property="og:description")
            if og_desc and og_desc.get("content"):
                metadata["description"] = og_desc["content"].strip()[:400]

            # If DOI was not in meta, search body text
            if not metadata["detected_doi"]:
                body_text = soup.get_text()[:4000]
                detected = normalize_doi(body_text)
                if detected:
                    metadata["detected_doi"] = detected

    except Exception:
        pass

    return metadata


async def resolve_bibliography_input(input_query: str) -> Dict[str, Any]:
    """
    Universal router for bibliography resolution:
      1. Deterministic DOI check -> Zero-token Content Negotiation.
      2. Deterministic arXiv check -> Zero-token arXiv API.
      3. URL check -> Scrape metadata (if page contains DOI, resolves directly; otherwise flags for AI).
      4. Plain text citation -> Flags for AI extraction.
    """
    query = input_query.strip()
    if not query:
        return {"success": False, "error": "Empty input query."}

    # 1. Direct DOI
    doi = normalize_doi(query)
    if doi:
        return await resolve_doi(doi)

    # 2. arXiv ID or URL
    arxiv_id = normalize_arxiv(query)
    if arxiv_id:
        return await resolve_arxiv(arxiv_id)

    # 3. Web URL
    if URL_REGEX.match(query):
        meta = await scrape_url_metadata(query)
        if meta.get("detected_doi"):
            # Serendipitous free DOI discovery!
            doi_res = await resolve_doi(meta["detected_doi"])
            if doi_res.get("success"):
                doi_res["message"] = f"Detected DOI {meta['detected_doi']} on webpage"
                return doi_res

        # Needs AI extraction with enriched metadata
        return {
            "success": True,
            "requires_ai": True,
            "source": "url",
            "url": query,
            "metadata": meta,
            "message": "URL requires AI extraction for full BibTeX formatting."
        }

    # 4. Raw text citation description (e.g., "Feynman Lectures on Physics 1963")
    return {
        "success": True,
        "requires_ai": True,
        "source": "text",
        "raw_text": query,
        "message": "Raw citation text requires AI parsing."
    }
