"""
Field normalizers used by the Excel importer (and any future ingestion path).
Pure functions, no DB calls. Easy to unit-test.
"""
from __future__ import annotations
import re
import hmac
import hashlib
from urllib.parse import urlparse
from datetime import datetime

EMPTY_TOKENS = {"", "n/a", "na", "-", "—", "null", "none", "nil", "no data", "."}


def is_empty(value) -> bool:
    if value is None:
        return True
    s = str(value).strip().lower()
    return s in EMPTY_TOKENS


def clean_text(value) -> str | None:
    if is_empty(value):
        return None
    s = str(value).strip()
    s = re.sub(r"\s+", " ", s)
    return s or None


def normalize_email(value) -> str | None:
    if is_empty(value):
        return None
    s = str(value).strip().lower()
    if "@" not in s or "." not in s.split("@")[-1]:
        return None
    return s


def normalize_phone(value) -> str | None:
    """Strip +91 country code, spaces, dashes, parens. Return 10-digit number or None."""
    if is_empty(value):
        return None
    s = re.sub(r"[\s\-\(\)+]", "", str(value))
    # Strip leading 91 (India country code) or 0
    if s.startswith("91") and len(s) == 12:
        s = s[2:]
    elif s.startswith("0") and len(s) == 11:
        s = s[1:]
    if len(s) == 10 and s.isdigit():
        return s
    # Keep as-is if it's a non-India number we can't normalize
    if s.isdigit() and 7 <= len(s) <= 15:
        return s
    return None


_LINKEDIN_SLUG = re.compile(r"linkedin\.com/in/([^/?#]+)", re.IGNORECASE)


def normalize_linkedin(value) -> str | None:
    """
    Canonicalize LinkedIn URLs to 'https://linkedin.com/in/<slug>'.
    Accepts: full URLs with or without protocol, with query params, trailing slashes,
    or just a bare slug like 'rahul-sharma-1234'.
    """
    if is_empty(value):
        return None
    s = str(value).strip()
    m = _LINKEDIN_SLUG.search(s)
    if m:
        slug = m.group(1).rstrip("/").lower()
        return f"https://linkedin.com/in/{slug}"
    # If it looks like a bare slug (no slashes, no spaces)
    if re.fullmatch(r"[a-zA-Z0-9\-_.]{3,}", s) and "@" not in s:
        return f"https://linkedin.com/in/{s.lower()}"
    return None


# Branch synonyms: lowercase synonym -> canonical code
_BRANCH_SYNONYMS = {
    # CSE
    "cse": "CSE", "cs": "CSE", "computer science": "CSE",
    "computer science engineering": "CSE", "computer engineering": "CSE",
    "computer science & engineering": "CSE", "computer science and engineering": "CSE",
    "computer engg": "CSE", "coe": "CSE", "comp": "CSE",
    # ECE
    "ece": "ECE", "ec": "ECE", "electronics": "ECE",
    "electronics & communication": "ECE", "electronics and communication": "ECE",
    "enc": "ECE",
    # EE
    "ee": "EE", "electrical": "EE", "electrical engineering": "EE",
    "electrical engg": "EE",
    # EIC
    "eic": "EIC", "electronics & instrumentation": "EIC",
    "electronics and instrumentation": "EIC", "instrumentation": "EIC",
    # ME
    "me": "ME", "mech": "ME", "mechanical": "ME",
    "mechanical engineering": "ME", "mechanical engg": "ME",
    # CHE
    "che": "CHE", "chemical": "CHE", "chemical engineering": "CHE", "chem": "CHE",
    # CIVIL
    "civil": "CIVIL", "civil engineering": "CIVIL",
    # BIO
    "bio": "BIO", "biotech": "BIO", "biotechnology": "BIO",
    "bt": "BIO", "bio technology": "BIO",
    # Management
    "mba": "MBA", "master of business administration": "MBA", "lmtsom": "MBA",
    "mca": "MCA", "master of computer applications": "MCA",
    "bba": "BBA", "bachelor of business administration": "BBA",
}


# Campus-location noise like "(Patiala Campus)" / "Derabassi Campus" carries no
# branch meaning. Keep in lockstep with stripCampus in the backend/Go normalizers.
_CAMPUS_RE = re.compile(
    r"\([^)]*\bcampus\b[^)]*\)"
    r"|\b(?:patiala|dera\s*bassi|derabassi|mohali|main|new)\s+campus\b"
    r"|\bcampus\b",
    re.IGNORECASE,
)


def normalize_branch(value) -> str | None:
    if is_empty(value):
        return None
    cleaned = " ".join(_CAMPUS_RE.sub(" ", clean_text(value)).split())
    key = cleaned.lower()
    if key in _BRANCH_SYNONYMS:
        return _BRANCH_SYNONYMS[key]
    # Return as-is in uppercase if we don't have a synonym — better to keep data than drop
    return cleaned.upper() if cleaned else clean_text(value).upper()


def normalize_year(value) -> int | None:
    if is_empty(value):
        return None
    try:
        n = int(float(str(value).strip()))
        # Thapar was founded 1956; future-cap at current year + 6 (M.Tech finishing)
        if 1956 <= n <= datetime.now().year + 6:
            return n
    except (ValueError, TypeError):
        pass
    return None


def normalize_dob(value):
    if is_empty(value):
        return None
    s = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def split_pipe(value) -> list[str]:
    """Pipe-separated lists, e.g. 'Microsoft|Google' -> ['Microsoft', 'Google']."""
    if is_empty(value):
        return []
    parts = [clean_text(p) for p in str(value).split("|")]
    return [p for p in parts if p]


def blind_index(value: str | None, key_hex: str) -> str | None:
    """HMAC-SHA256 blind index. Lowercases, strips spaces before hashing."""
    if not value:
        return None
    normalized = re.sub(r"\s+", "", value.lower())
    key = bytes.fromhex(key_hex)
    return hmac.new(key, normalized.encode("utf-8"), hashlib.sha256).hexdigest()


def normalize_row(raw: dict) -> dict:
    """
    Take a dict of raw Excel cell values keyed by template column name,
    return a dict of normalized values ready for DB insert.
    """
    emails = []
    for col in ("email", "email_alt", "email_alt2", "email_alt3"):
        e = normalize_email(raw.get(col))
        if e and e not in emails:
            emails.append(e)

    phones = []
    for col in ("phone", "phone_alt", "phone_alt2"):
        p = normalize_phone(raw.get(col))
        if p and p not in phones:
            phones.append(p)

    past = split_pipe(raw.get("past_companies"))
    current = clean_text(raw.get("current_company"))
    # Build company list: current + past, dedup case-insensitive
    company_set = {}
    if current:
        company_set[current.lower()] = (current, True)
    for c in past:
        if c.lower() not in company_set:
            company_set[c.lower()] = (c, False)
    companies = [{"company": name, "is_current": is_cur} for name, is_cur in company_set.values()]

    user_type = clean_text(raw.get("user_type"))
    tag_list = split_pipe(raw.get("tags"))
    if user_type and user_type.lower() not in [t.lower() for t in tag_list]:
        tag_list.append(user_type.lower())

    return {
        "full_name": clean_text(raw.get("full_name")),
        "linkedin_url": normalize_linkedin(raw.get("linkedin_url")),
        "emails": emails,
        "phones": phones,
        "batch_year": normalize_year(raw.get("batch_year")),
        "degree": clean_text(raw.get("degree")),
        "branch": normalize_branch(raw.get("branch")),
        "enrollment_no": clean_text(raw.get("enrollment_no")),
        "dob": normalize_dob(raw.get("dob")),
        "current_company": current,
        "current_title": clean_text(raw.get("current_title")),
        "companies": companies,
        "industry": clean_text(raw.get("industry")),
        "current_city": clean_text(raw.get("current_city")),
        "current_country": clean_text(raw.get("current_country")),
        "tags": tag_list,
        "notes": clean_text(raw.get("notes")),
        "source_label": clean_text(raw.get("source_label")) or "excel_import",
    }
