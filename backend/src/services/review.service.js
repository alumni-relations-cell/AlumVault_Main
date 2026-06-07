const db = require('../config/db');
const logger = require('../utils/logger');

// Minimal port of the Go importer's CanonicalBranch — strips separators and
// the "engineering" suffix, then maps to a short code. Kept narrow on purpose;
// extend in lockstep with normalizer.go's branchSynonyms when new branches
// appear.
const BRANCH_SYNONYMS = {
  // CSE — includes Software Engineering and COE per ops decision.
  'cse': 'CSE', 'cs': 'CSE', 'computer science': 'CSE',
  'computer science and': 'CSE', 'comp sci': 'CSE', 'comp science': 'CSE',
  'computer': 'CSE', 'coe': 'CSE',
  'software': 'CSE', 'se': 'CSE',
  'software engg': 'CSE', 'computer software': 'CSE',
  // ECE — kept distinct from EIC.
  'ece': 'ECE', 'ec': 'ECE', 'enc': 'ECE',
  'electronics and communication': 'ECE',
  'electronics communication': 'ECE', 'electronics': 'ECE',
  'electronics and communications': 'ECE',
  'ee': 'EE', 'eee': 'EE', 'electrical': 'EE',
  // EIC — distinct from ECE. Stored as "Electronics and Instrumentation".
  'eic': 'EIC', 'electronics instrumentation': 'EIC',
  'electronics and instrumentation': 'EIC',
  'instrumentation and control': 'EIC',
  'electronics instrumentation and control': 'EIC',
  // ME — CAD/CAM is a mechanical specialization at Thapar.
  'me': 'ME', 'mech': 'ME', 'mechanical': 'ME',
  'cad cam': 'ME', 'cad cam and robotics': 'ME', 'cad cam robotics': 'ME',
  'che': 'CHE', 'chem': 'CHE', 'chemical': 'CHE',
  'ce': 'CIVIL', 'civil': 'CIVIL',
  'bt': 'BIO', 'bio': 'BIO', 'biotech': 'BIO', 'biotechnology': 'BIO',
  'it': 'IT', 'information technology': 'IT',
  'mba': 'MBA', 'mca': 'MCA', 'bba': 'BBA', 'bca': 'BCA',
  'master of computer applications': 'MCA', 'computer applications': 'MCA',
  'computer application': 'MCA',
  'master of business administration': 'MBA',
  // Thermal (M.Tech specialization). Stored as "Thermal Engineering".
  'thermal': 'THERMAL', 'thr': 'THERMAL',
  // VLSI — spelling variants only, no meaningful sub-specialization.
  'vlsi': 'VLSI', 'vlsi design': 'VLSI', 'vlsi design and cad': 'VLSI',
  'vlsi and cad': 'VLSI',
  // Microbiology + Biochemistry — pure-science specialisations.
  'microbiology': 'MICRO', 'mbio': 'MICRO',
  'biochemistry': 'BIOCHEM', 'bio chemistry': 'BIOCHEM',
};
const BRANCH_DISPLAY = {
  CSE: 'Computer Science and Engineering',
  ECE: 'Electronics and Communication Engineering',
  EE: 'Electrical Engineering',
  EIC: 'Electronics and Instrumentation',
  ME: 'Mechanical Engineering',
  CHE: 'Chemical Engineering',
  CIVIL: 'Civil Engineering',
  BIO: 'Biotechnology',
  BIOMED: 'Biomedical Engineering',
  IT: 'Information Technology',
  MATSC: 'Materials Science and Engineering',
  PHY: 'Physics',
  MATH: 'Mathematics and Computing',
  CHEM_SCI: 'Chemistry',
  PSY: 'Psychology',
  VLSI: 'VLSI Design',
  MBA: 'MBA', MCA: 'MCA', BBA: 'BBA', BCA: 'BCA',
  THERMAL: 'Thermal Engineering',
  VLSI: 'VLSI',
  MICRO: 'Microbiology',
  BIOCHEM: 'Biochemistry',
};

// Buckets where every input is stored as the canonical display form, with
// no parenthetical preservation. Use for buckets whose "synonyms" are just
// spelling variants (no useful specialization meaning) — VLSI Design,
// VLSI DESIGN, Vlsi etc. all become "VLSI". Compare with CAD/CAM (in ME),
// where the variant carries specialization info we want to keep.
const BRANCH_DROP_SPEC = new Set(['VLSI']);
// Best-effort prefix fallback for short or compound codes that we couldn't
// pin down in BRANCH_SYNONYMS. Only fires when the exact-lookup fails — so
// we never override a known canonical mapping. Each prefix must be specific
// enough that false-positives are very unlikely (e.g. "mec" → ME is safe,
// "el"  → ??  is too ambiguous to include).
const BRANCH_PREFIX_RULES = [
  // Computer / Software
  { match: ['comp', 'cs', 'coe', 'softw', 'sde', 'csa', 'cose', 'coem', 'csed', 'ecem'], canonical: 'CSE' },
  // ECE family
  { match: ['ec', 'enc', 'eice'], canonical: 'ECE' },
  // EIC family (instrumentation/control) — kept distinct from ECE
  { match: ['eic', 'eied', 'ine', 'icp'], canonical: 'EIC' },
  // Electrical
  { match: ['ele', 'ee ', 'eed'], canonical: 'EE' },
  // Mechanical
  { match: ['mech', 'mec', 'mee', 'mpe'], canonical: 'ME' },
  // Chemical
  { match: ['chem', 'cml', 'chh'], canonical: 'CHE' },
  // Civil
  { match: ['civ', 'ce(', 'cce', 'cine', 'ciem', 'geo'], canonical: 'CIVIL' },
  // Bio
  { match: ['bio', 'bt', 'btd', 'bcem'], canonical: 'BIO' },
  // Biomedical
  { match: ['biom', 'bm'], canonical: 'BIOMED' },
  // Information Tech
  { match: ['info', 'itn', 'mfg'], canonical: 'IT' },
  // Materials
  { match: ['mat', 'metal', 'meem', 'mse'], canonical: 'MATSC' },
  // Physics
  { match: ['phy'], canonical: 'PHY' },
  // Mathematics
  { match: ['math', 'maths'], canonical: 'MATH' },
  // Chemistry (science, not chemical eng — distinct bucket)
  { match: ['chemistry', 'cbh', 'biochem'], canonical: 'CHEM_SCI' },
  // Management / MBA
  { match: ['mba', 'mgm', 'mgmt', 'mbabr', 'lmtsm', 'som', 'shss'], canonical: 'MBA' },
  // MCA
  { match: ['mca', 'imca', 'mcacc'], canonical: 'MCA' },
  // Psychology
  { match: ['psy', 'clp'], canonical: 'PSY' },
  // VLSI
  { match: ['vlsi', 'vd', 'vdc'], canonical: 'VLSI' },
];

function canonicalBranch(raw) {
  if (!raw) return '';
  let key = raw.toLowerCase()
    .replace(/[&]/g, ' and ')
    .replace(/[.,\-/_()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  key = key.replace(/\s+(engineering|engg|engr)$/, '').trim();
  if (BRANCH_SYNONYMS[key]) return BRANCH_SYNONYMS[key];
  // Prefix fallback — only triggers when the exact lookup misses.
  for (const rule of BRANCH_PREFIX_RULES) {
    for (const prefix of rule.match) {
      if (key.startsWith(prefix)) return rule.canonical;
    }
  }
  return '';
}
// Mirror of Go's CanonicalDegree — collapses every spelling of a degree to a
// short code. Applied in resolve() so a reviewer who saves "B.Tech" or
// "Bachelors of Engineering" stores "BE" instead.
function canonicalDegree(raw) {
  if (!raw) return raw;
  const k = String(raw).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) return raw;
  if (k === 'BE' || k === 'BTECH' || k === 'BENGG'
      || k.startsWith('BACHELOROFENGINEERING')
      || k.startsWith('BACHELOROFTECHNOLOGY')) return 'BE';
  if (k === 'ME' || k === 'MTECH' || k === 'MENGG'
      || k.startsWith('MASTEROFENGINEERING')
      || k.startsWith('MASTEROFTECHNOLOGY')) return 'ME';
  if (k === 'BPHARM' || k.startsWith('BACHELOROFPHARMACY')) return 'BPharm';
  if (k === 'MPHARM' || k.startsWith('MASTEROFPHARMACY')) return 'MPharm';
  if (k === 'MBA' || k.startsWith('MASTEROFBUSINESS')) return 'MBA';
  if (k === 'MCA' || k.startsWith('MASTEROFCOMPUTER')) return 'MCA';
  if (k === 'BBA' || k.startsWith('BACHELOROFBUSINESS')) return 'BBA';
  if (k === 'BCA' || k.startsWith('BACHELOROFCOMPUTERAPPLICATIONS')) return 'BCA';
  if (k === 'BSC' || k.startsWith('BACHELOROFSCIENCE')) return 'BSc';
  if (k === 'MSC' || k.startsWith('MASTEROFSCIENCE')) return 'MSc';
  if (k === 'BCOM' || k.startsWith('BACHELOROFCOMMERCE')) return 'BCom';
  if (k === 'BA' || k.startsWith('BACHELOROFARTS')) return 'BA';
  if (k === 'MA' || k.startsWith('MASTEROFARTS')) return 'MA';
  if (k === 'LLB' || k.startsWith('BACHELOROFLAW')) return 'LLB';
  if (k === 'LLM' || k.startsWith('MASTEROFLAW')) return 'LLM';
  if (k.includes('PHD') || k.includes('DOCTOR')) return 'PhD';
  return raw;
}

// Last-10-digits comparison so +91 prefixes, leading zeros, and separator
// noise (spaces, dashes, parens) all collapse to one form. Indian mobile
// numbers are 10 digits — anything shorter we leave as-is so we don't
// over-match short extension codes.
function normalizePhoneLast10(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 0) return '';
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

// LinkedIn URLs commonly differ by scheme, www, trailing slash, query params,
// and casing. Normalize everything that doesn't affect identity so an
// equality compare is reliable.
function normalizeLinkedin(url) {
  if (!url) return '';
  return String(url).toLowerCase().trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace(/\/+$/, '');
}

// pg returns JSONB as parsed JS; strings only happen for some drivers. Treat
// null/non-array as empty.
function ensureArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; }
    catch { return []; }
  }
  return [];
}

// Order-independent key so {a:"BE", b:"B.Tech"} and {a:"B.Tech", b:"BE"} both
// hash to the same entry — one decision covers both directions.
function makeDoubtKey(a, b) {
  const [x, y] = [String(a || '').toLowerCase().trim(), String(b || '').toLowerCase().trim()].sort();
  return `${x}|${y}`;
}

// Standard iterative Levenshtein DP — fast enough for the few thousand doubt
// pairs the scan produces (each comparison is two short strings).
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function normalizeForCompare(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Catches pairs we should never have to ask a human about:
//   case-only       "Mca"   ↔ "MCA"
//   whitespace-only "Civil Engineering" ↔ "Civil  Engineering"
//   single typo     "Biotechnolgy" ↔ "Biotechnology"
//   minor variant   "Electrical Engineering" ↔ "Electrical engineering"
// For very short strings (≤4 chars after normalization) Levenshtein is too
// permissive — "Bm" vs "Em" would be distance 1 but they're distinct branches.
// In that range we only accept the case/whitespace fast path.
function isNearIdentical(a, b, threshold = 2) {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na === nb) return true;
  if (na.length <= 4 || nb.length <= 4) return false;
  if (Math.abs(na.length - nb.length) > threshold) return false;
  return levenshtein(na, nb) <= threshold;
}

// Heuristic for which form to keep when auto-deciding "same": prefer the
// longer one (typo fixes go toward the correct spelling), then the one with
// more uppercase letters (short codes like MCA win over mca / Mca).
function pickPreferredCanonical(a, b) {
  if (a.length !== b.length) return a.length > b.length ? a : b;
  const upA = (a.match(/[A-Z]/g) || []).length;
  const upB = (b.match(/[A-Z]/g) || []).length;
  if (upA !== upB) return upA > upB ? a : b;
  return a; // stable tiebreaker
}

// Used by resolve() to store the canonical display form in alumni.branch.
// Preserves the original input as a parenthetical specialization when it's
// not already the canonical form — so "CAD/CAM" stores as "Mechanical
// Engineering (CAD/CAM)", not just "Mechanical Engineering". Falls back to
// the raw value when canonicalBranch can't decide.
// Campus-location noise like "(Patiala Campus)" / "Derabassi Campus" carries no
// branch meaning. Strip it before canonicalizing so "X (Patiala Campus)"
// collapses to plain X. Keep in lockstep with stripCampusBulk in
// alumni.service.js, normalizer.go, and normalizer.py.
function stripCampus(raw) {
  return String(raw)
    .replace(/\([^)]*\bcampus\b[^)]*\)/gi, ' ')
    .replace(/\b(?:patiala|dera\s*bassi|derabassi|mohali|main|new)\s+campus\b/gi, ' ')
    .replace(/\bcampus\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// Reduce a branch string to its canonical lookup key (mirror of the key build
// in canonicalBranch). Tells a cosmetic spelling of the bucket name from a real
// specialization.
function branchKey(raw) {
  const key = String(raw).toLowerCase()
    .replace(/[&]/g, ' and ')
    .replace(/[.,\-/_()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return key.replace(/\s+(engineering|engg|engr)$/, '').trim();
}
function canonicalBranchForStorage(raw) {
  const cleaned = stripCampus(raw);   // drop campus-location noise
  const code = canonicalBranch(cleaned);
  if (!code) return raw;
  const display = BRANCH_DISPLAY[code] || code;
  // For buckets in the drop-set, always store the canonical display form —
  // the input variants don't carry useful specialization meaning.
  if (BRANCH_DROP_SPEC.has(code)) return display;
  const key = branchKey(cleaned);
  // Cosmetic spelling of the bucket name itself → store plain display so all
  // such variants collapse to one value (and therefore cluster/merge).
  if (key === branchKey(display) || key === code.toLowerCase()) return display;
  const cleanedTrim = cleaned.trim();
  // Already in our "Display (specialization)" format — don't re-wrap.
  if (cleanedTrim.toLowerCase().startsWith(display.toLowerCase() + ' (')) return cleanedTrim;
  return `${display} (${cleanedTrim})`;
}

function branchMatchVariants(raw) {
  const variants = new Set();
  const trimmed = (raw || '').trim();
  if (trimmed) variants.add(trimmed);
  const canon = canonicalBranch(trimmed);
  if (canon) {
    variants.add(canon);
    const disp = BRANCH_DISPLAY[canon];
    if (disp) variants.add(disp);
  }
  return [...variants];
}

// Catches review rows where the incoming "branch" cell holds something
// unmergeable — pure years like "2016", job titles like "Lecturer" /
// "Director" / "Project Manager", or single-word noise we couldn't
// canonicalize. The frontend offers these as a separate tab so reviewers can
// process the long-tail garbage separately from real fuzzy matches.
const UNMERGEABLE_JOB_TITLES = [
  'lecturer', 'professor', 'manager', 'director', 'engineer', 'officer',
  'analyst', 'consultant', 'trainee', 'intern', 'student', 'associate',
  'specialist', 'coordinator', 'head', 'executive', 'assistant',
  'researcher', 'scholar', 'faculty', 'developer', 'representative',
  'designer', 'ambassador', 'fellow',
  // Expanded — frequent garbage values seen in the wild.
  'founder', 'scientist', 'technician', 'recruiter', 'supervisor',
  'lead', 'owner', 'partner', 'principal',
  'sales', 'marketing', 'finance', 'hr', 'admin', 'legal',
  'secretary', 'representative', 'incharge', 'in-charge',
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio',
  'vp', 'svp', 'gm', 'avp',
  'trainer', 'editor', 'writer', 'reporter',
  'pa', 'ea', 'aa',
  'volunteer', 'apprentice',
];
// Built as a single regex so the SQL filter can use a stable pattern, too.
const UNMERGEABLE_TITLE_RE = new RegExp(`\\b(${UNMERGEABLE_JOB_TITLES.join('|')})\\b`, 'i');

class ReviewService {
  /**
   * Get pending review items with pagination.
   */
  async listPending(query) {
    const limit = Math.min(parseInt(query.limit) || 25, 100);
    const offset = parseInt(query.offset) || 0;
    const q = (query.q || '').trim();
    // category: 'all' (default), 'fuzzy', 'identity_ambiguous', 'unmergeable'
    const category = (query.category || 'all').toLowerCase();
    // Optional filters — match if EITHER the existing alumnus side OR the
    // incoming side carries the requested value. Branch comparison uses the
    // canonical-variants set so "CSE" matches "Computer Science and
    // Engineering" and vice-versa.
    const branchFilter = (query.branch || '').trim();
    const batchFilter = parseInt(query.batch_year, 10) || 0;

    // Detector SQL for "unmergeable" — branch cell is a pure number (year),
    // a known job title, or a single-word non-canonicalizable noise term.
    // Mirrors UNMERGEABLE_JOB_TITLES on the JS side; kept inline so callers
    // don't need to JOIN against a synonyms table.
    const titlePattern = UNMERGEABLE_JOB_TITLES.join('|');
    const unmergeableSQL = `(
         (rq.incoming_data->>'branch') ~ '^[0-9]+$'
      OR (rq.incoming_data->>'branch') ~* '\\m(${titlePattern})\\M'
      OR (rq.incoming_data->>'branch') IS NULL
      OR trim(rq.incoming_data->>'branch') = ''
    )`;

    let categoryClause = '';
    if (category === 'fuzzy') {
      categoryClause = ` AND COALESCE(rq.review_type, 'fuzzy') = 'fuzzy' AND NOT ${unmergeableSQL}`;
    } else if (category === 'identity_ambiguous') {
      categoryClause = ` AND rq.review_type = 'identity_ambiguous'`;
    } else if (category === 'unmergeable') {
      categoryClause = ` AND ${unmergeableSQL}`;
    }

    // Build optional WHERE fragments with their own param positions so
    // adding/removing filters doesn't require manual offset bookkeeping.
    const dataParams = [];      // for the data query
    const filterClauses = [];

    // Search across existing + incoming name/company.
    if (q) {
      dataParams.push(`%${q}%`);
      const p = dataParams.length;
      filterClauses.push(`(
        a.full_name        ILIKE $${p} OR
        a.current_company  ILIKE $${p} OR
        (rq.incoming_data->>'full_name') ILIKE $${p} OR
        (rq.incoming_data->>'company')   ILIKE $${p}
      )`);
    }

    // Branch — canonical-aware variants so "CSE" matches "Computer Science
    // and Engineering" rows and vice-versa.
    if (branchFilter) {
      const variants = branchMatchVariants(branchFilter).map(v => v.toLowerCase());
      dataParams.push(variants);
      const p = dataParams.length;
      filterClauses.push(`(
        LOWER(a.branch) = ANY($${p}::text[]) OR
        LOWER(rq.incoming_data->>'branch') = ANY($${p}::text[])
      )`);
    }

    // Batch year — either side matches.
    if (batchFilter > 0) {
      dataParams.push(batchFilter);
      const p = dataParams.length;
      filterClauses.push(`(
        a.batch_year = $${p} OR
        (rq.incoming_data->>'batch_year') = $${p}::text
      )`);
    }

    const filterClauseSQL = filterClauses.length > 0
      ? ' AND ' + filterClauses.join(' AND ')
      : '';

    // Data query: filters first in params, then LIMIT/OFFSET at the end.
    const dataQueryParams = [...dataParams, limit, offset];
    const limitP = dataQueryParams.length - 1;
    const offsetP = dataQueryParams.length;

    const result = await db.query(
      `SELECT rq.id, rq.existing_alumni_id, rq.candidate_alumni_ids, rq.review_type,
              rq.match_score, rq.status, rq.created_at, rq.source_import_id,
              rq.incoming_data->>'full_name'  AS incoming_name,
              rq.incoming_data->>'company'    AS incoming_company,
              rq.incoming_data->>'batch_year' AS incoming_batch,
              rq.incoming_data->>'branch'     AS incoming_branch,
              a.full_name        AS existing_name,
              a.batch_year       AS existing_batch,
              a.branch           AS existing_branch,
              a.current_company  AS existing_company,
              jsonb_array_length(COALESCE(rq.candidate_alumni_ids, '[]'::jsonb)) AS candidate_count,
              ${unmergeableSQL} AS is_unmergeable
       FROM review_queue rq
       LEFT JOIN alumni a ON rq.existing_alumni_id = a.id
       WHERE rq.status = 'pending' ${categoryClause} ${filterClauseSQL}
       ORDER BY rq.match_score DESC
       LIMIT $${limitP} OFFSET $${offsetP}`,
      dataQueryParams
    );

    const countResult = await db.query(
      `SELECT COUNT(*) FROM review_queue rq
       LEFT JOIN alumni a ON rq.existing_alumni_id = a.id
       WHERE rq.status = 'pending' ${categoryClause} ${filterClauseSQL}`,
      dataParams
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    };
  }

  /**
   * Filter options for the review-queue page — only the branches and batch
   * years that actually appear in PENDING reviews, so the dropdowns never
   * offer a value that would return zero rows. Both sides count (the list
   * filter matches the existing alumnus's branch OR the incoming branch), and
   * each review is counted once per distinct value via count(DISTINCT rid).
   */
  async filterOptions() {
    const [branches, batchYears] = await Promise.all([
      db.query(`
        SELECT value, count(DISTINCT rid)::int AS count FROM (
          SELECT rq.id AS rid, a.branch AS value
          FROM review_queue rq JOIN alumni a ON a.id = rq.existing_alumni_id
          WHERE rq.status = 'pending' AND a.branch IS NOT NULL AND a.branch <> ''
          UNION ALL
          SELECT rq.id AS rid, rq.incoming_data->>'branch' AS value
          FROM review_queue rq
          WHERE rq.status = 'pending' AND COALESCE(rq.incoming_data->>'branch', '') <> ''
        ) t
        GROUP BY value
        ORDER BY count DESC, value ASC
      `),
      db.query(`
        SELECT value::int AS value, count(DISTINCT rid)::int AS count FROM (
          SELECT rq.id AS rid, a.batch_year::text AS value
          FROM review_queue rq JOIN alumni a ON a.id = rq.existing_alumni_id
          WHERE rq.status = 'pending' AND a.batch_year IS NOT NULL AND a.batch_year > 0
          UNION ALL
          SELECT rq.id AS rid, rq.incoming_data->>'batch_year' AS value
          FROM review_queue rq
          WHERE rq.status = 'pending' AND (rq.incoming_data->>'batch_year') ~ '^[0-9]+$'
        ) t
        GROUP BY value
        ORDER BY value DESC
      `),
    ]);
    return {
      branches: branches.rows,
      batch_years: batchYears.rows,
    };
  }

  /**
   * Get a specific review item by ID. Returns the review row + the full
   * existing-alumnus record for 1-vs-1 fuzzy reviews, OR an array of N
   * candidate alumni rows for identity_ambiguous reviews. The UI inspects
   * `review_type` and `candidates` length to decide which view to render.
   */
  async getById(id) {
    const result = await db.query(
      `SELECT
         rq.*,
         a.full_name        AS existing_full_name,
         a.batch_year       AS existing_batch_year,
         a.branch           AS existing_branch,
         a.degree           AS existing_degree,
         a.current_company  AS existing_current_company,
         a.current_title    AS existing_current_title,
         a.current_city     AS existing_current_city,
         a.linkedin_url     AS existing_linkedin_url,
         a.enrollment_no    AS existing_enrollment_no,
         a.emails           AS existing_emails,
         a.phones           AS existing_phones
       FROM review_queue rq
       LEFT JOIN alumni a ON rq.existing_alumni_id = a.id
       WHERE rq.id = $1`,
      [id]
    );
    if (result.rows.length === 0) throw new Error('Review item not found');
    const review = result.rows[0];

    // For identity-ambiguous reviews, fetch every candidate so the UI can
    // render an N-column picker. We use ANY($1::uuid[]) so a single query
    // pulls every row regardless of order in the JSONB array.
    const candidateIds = Array.isArray(review.candidate_alumni_ids)
      ? review.candidate_alumni_ids
      : (review.candidate_alumni_ids ? JSON.parse(review.candidate_alumni_ids) : []);

    if (candidateIds.length > 1) {
      const candRes = await db.query(
        `SELECT id, full_name, enrollment_no, batch_year, branch, degree,
                current_company, current_title, current_city, linkedin_url,
                emails, phones
         FROM alumni WHERE id = ANY($1::uuid[])`,
        [candidateIds]
      );
      // Preserve the order from candidate_alumni_ids so the UI columns
      // line up predictably across reloads.
      const byId = Object.fromEntries(candRes.rows.map(r => [r.id, r]));
      review.candidates = candidateIds.map(id => byId[id]).filter(Boolean);
    } else {
      review.candidates = [];
    }
    return review;
  }

  /**
   * Resolve a review item: merge, skip, or create new.
   * `overrides` is the human-edited final value for each field — used by both
   * 'merged' (update existing) and 'new' (insert) resolutions so reviewers can
   * correct typos / pick the better side / type a value neither row had.
   *
   * `selectedAlumniId` is for identity_ambiguous reviews where the matcher
   * found 2+ candidates: the reviewer picks which one to merge into. For
   * 1-vs-1 reviews it's ignored (we always merge into review.existing_alumni_id).
   */
  async resolve(id, resolution, userId, note, overrides = {}, selectedAlumniId = null) {
    const review = await this.getById(id);
    if (review.status !== 'pending') {
      throw new Error('Review already resolved');
    }

    // For multi-candidate reviews, the reviewer MUST pick a target alumnus
    // when merging. Validate the pick is actually one of the candidates so
    // a stale UI can't accidentally write into a wrong record.
    const candidateIds = Array.isArray(review.candidate_alumni_ids)
      ? review.candidate_alumni_ids
      : (review.candidate_alumni_ids ? JSON.parse(review.candidate_alumni_ids) : []);
    let mergeTargetId = review.existing_alumni_id;
    if (resolution === 'merged' && candidateIds.length > 1) {
      if (!selectedAlumniId) {
        throw new Error('selected_alumni_id required: this review has multiple candidates');
      }
      if (!candidateIds.includes(selectedAlumniId)) {
        throw new Error('selected_alumni_id is not one of the review candidates');
      }
      mergeTargetId = selectedAlumniId;
    }

    // Whitelist the columns a reviewer may write through this path.
    const ALLOWED = ['full_name', 'batch_year', 'branch', 'degree',
      'current_company', 'current_title', 'current_city', 'linkedin_url'];
    const incoming = typeof review.incoming_data === 'string'
      ? JSON.parse(review.incoming_data) : review.incoming_data || {};
    // Map the matcher's incoming field names onto alumni column names so the
    // fallback (when the UI doesn't override) writes to the right columns.
    const incomingAsAlumni = {
      full_name:       incoming.full_name,
      batch_year:      incoming.batch_year,
      branch:          incoming.branch,
      degree:          incoming.degree,
      current_company: incoming.company,
      current_title:   incoming.title,
      current_city:    incoming.city,
      linkedin_url:    incoming.linkedin_url,
    };

    const finalFields = {};
    for (const col of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(overrides, col)) {
        // empty string from the UI means "clear it"; null means "don't touch"
        if (overrides[col] !== null && overrides[col] !== undefined) {
          finalFields[col] = overrides[col] === '' ? null : overrides[col];
        }
      } else if (resolution === 'new' && incomingAsAlumni[col]) {
        // When creating a new row, default any field the UI didn't override
        // to the incoming value (so a no-edit "Keep separate" still works).
        finalFields[col] = incomingAsAlumni[col];
      }
    }

    // Canonicalize before write so every merge produces the same value for
    // equivalent inputs ("B.Tech" / "BTech" / "Bachelors of Engineering" → "BE";
    // "Computer Sci & Engg" / "CSE" / "Coe" → "Computer Science and
    // Engineering"). Skip when the field was explicitly cleared (null).
    if (finalFields.degree != null) {
      finalFields.degree = canonicalDegree(finalFields.degree);
    }
    if (finalFields.branch != null) {
      finalFields.branch = canonicalBranchForStorage(finalFields.branch);
    }

    // Wrap the review_queue update + alumni write in a single transaction so
    // we never end up with a review marked "resolved" but no corresponding
    // change to alumni (the symptom you hit when a unique constraint blew up
    // the INSERT halfway through).
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE review_queue SET status = $2, resolved_by = $3, resolved_at = NOW(), resolution_note = $4
         WHERE id = $1`,
        [id, resolution, userId, note || null]
      );

      if (resolution === 'merged') {
        if (Object.keys(finalFields).length > 0) {
          const cols = Object.keys(finalFields);
          const sets = cols.map((k, i) => `${k} = $${i + 2}`).join(', ');
          const values = [mergeTargetId, ...cols.map(k => finalFields[k])];
          await client.query(
            `UPDATE alumni SET ${sets}, updated_at = NOW(), updated_by = $${values.length + 1} WHERE id = $1`,
            [...values, userId]
          );
        }
      } else if (resolution === 'new') {
        if (!finalFields.full_name) {
          throw new Error('Cannot create a new alumni record without full_name');
        }
        const cols = Object.keys(finalFields);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const values = cols.map(k => finalFields[k]);
        await client.query(
          `INSERT INTO alumni (${cols.join(', ')}, created_by)
           VALUES (${placeholders}, $${values.length + 1})`,
          [...values, userId]
        );
      } else if (resolution === 'skipped' && Object.keys(finalFields).length > 0) {
        // 'skipped' with overrides = "incoming row is junk, but the reviewer
        // spotted corrections to apply to the existing alumnus."
        const cols = Object.keys(finalFields);
        const sets = cols.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const values = [review.existing_alumni_id, ...cols.map(k => finalFields[k])];
        await client.query(
          `UPDATE alumni SET ${sets}, updated_at = NOW(), updated_by = $${values.length + 1} WHERE id = $1`,
          [...values, userId]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // Postgres unique_violation = 23505. The only unique constraint on
      // alumni columns we let reviewers write to is the partial UNIQUE on
      // lower(linkedin_url) — surface a helpful message instead of the
      // generic "duplicate key" Postgres error so the reviewer knows what
      // to clear in the Final column.
      if (err.code === '23505' && /linkedin/i.test(err.detail || err.message || '')) {
        throw new Error(
          'A different alumni record already has this LinkedIn URL. ' +
          'Clear the LinkedIn field in the Final column (or correct it) and try again.'
        );
      }
      throw err;
    } finally {
      client.release();
    }

    logger.info({ reviewId: id, resolution, resolvedBy: userId, overrideCount: Object.keys(finalFields).length },
      'Review resolved');
    return { id, resolution, resolved: true };
  }

  /**
   * Re-match every pending review against the current alumni table — useful
   * after a roster import populates ground-truth (name, batch_year, branch)
   * rows that didn't exist when the original match decision was made.
   *
   * Per review:
   *   - 0 alumni match incoming identity → leave pending (still fuzzy)
   *   - 1 match  → auto-resolve as merged (review.existing_alumni_id repointed
   *                to that alumnus, status='merged')
   *   - 2+ matches → keep pending but switch to multi-candidate identity_ambiguous
   *                  (the UI's N-column picker takes over)
   *
   * Branch matching is the tricky bit: roster rows store branch as the short
   * canonical code ("CSE"), non-roster imports store the display form ("Computer
   * Science and Engineering"). We compute both forms from the review's incoming
   * branch and match LOWER(alumni.branch) against either via ANY().
   */
  /**
   * Interactive rematch — phase 1 (scan).
   *
   * Walks every pending review, finds candidate alumni by (name, batch_year),
   * and collects the unique (incoming_branch, candidate_branch) and
   * (incoming_degree, candidate_degree) pairs that the auto-canonicalizer
   * cannot reconcile. The UI walks the operator through these one-by-one;
   * their decisions become temporary aliases for the apply phase.
   *
   * Pairs are keyed symmetrically so "BE vs B.Tech" and "B.Tech vs BE" are
   * one decision.
   */
  async scanRematchDoubts(userId) {
    // Pull previously-decided pairs so we never re-ask the operator. Keyed
    // by the same makeDoubtKey() the doubt loop uses so the filter is O(1).
    const decidedRes = await db.query(
      `SELECT field, value_a, value_b FROM branch_alias_decisions`
    );
    const decided = new Set(
      decidedRes.rows.map(r => `${r.field}|${makeDoubtKey(r.value_a, r.value_b)}`)
    );

    const pendingRes = await db.query(
      `SELECT id, incoming_data FROM review_queue WHERE status = 'pending'`
    );
    const pending = pendingRes.rows;

    const branchDoubts = new Map(); // key → { a, b, count }
    const degreeDoubts = new Map();
    let wouldAutoResolve = 0;
    let untouchable = 0;

    for (const review of pending) {
      const incoming = typeof review.incoming_data === 'string'
        ? JSON.parse(review.incoming_data)
        : review.incoming_data || {};

      const fullName = (incoming.full_name || '').trim();
      const batchYear = parseInt(incoming.batch_year, 10);
      const inBranch = (incoming.branch || '').trim();
      const inDegree = (incoming.degree || '').trim();

      if (!fullName || !batchYear || !inBranch) {
        untouchable++;
        continue;
      }
      const inBranchCanon = canonicalBranch(inBranch);

      const cands = await db.query(
        `SELECT id, branch, degree FROM alumni
         WHERE LOWER(full_name) = LOWER($1) AND batch_year = $2`,
        [fullName, batchYear]
      );
      if (cands.rows.length === 0) { untouchable++; continue; }

      // Would auto-resolve = at least one candidate's branch canonicalizes
      // to the same code as the incoming branch.
      const autoMatch = inBranchCanon && cands.rows.some(c => canonicalBranch(c.branch) === inBranchCanon);
      if (autoMatch) { wouldAutoResolve++; continue; }

      // For each candidate, record the disagreeing field values as doubts.
      for (const cand of cands.rows) {
        const cBranch = (cand.branch || '').trim();
        const cDegree = (cand.degree || '').trim();

        if (inBranch && cBranch && inBranch.toLowerCase() !== cBranch.toLowerCase()) {
          // Skip if canonical comparison ALREADY says different non-null codes
          // (truly different branches — no doubt to ask about).
          const inC = canonicalBranch(inBranch);
          const cC = canonicalBranch(cBranch);
          if (!(inC && cC && inC !== cC)) {
            const key = makeDoubtKey(inBranch, cBranch);
            if (!decided.has(`branch|${key}`)) {
              const entry = branchDoubts.get(key) || { field: 'branch', a: inBranch, b: cBranch, count: 0 };
              entry.count++;
              branchDoubts.set(key, entry);
            }
          }
        }

        if (inDegree && cDegree && inDegree.toLowerCase() !== cDegree.toLowerCase()) {
          if (canonicalDegree(inDegree) !== canonicalDegree(cDegree)) {
            const key = makeDoubtKey(inDegree, cDegree);
            if (!decided.has(`degree|${key}`)) {
              const entry = degreeDoubts.get(key) || { field: 'degree', a: inDegree, b: cDegree, count: 0 };
              entry.count++;
              degreeDoubts.set(key, entry);
            }
          }
        }
      }
    }

    // Auto-decide near-identical pairs (case-only diffs, typos within edit
    // distance ≤ 2) before showing anything to the operator. The decisions
    // are persisted, alumni rows rewritten, and pending reviews re-evaluated
    // exactly as if the user clicked Same with the chosen canonical.
    const autoDecisions = [];
    for (const d of branchDoubts.values()) {
      if (isNearIdentical(d.a, d.b)) {
        autoDecisions.push({
          field: 'branch', a: d.a, b: d.b, same: true,
          preferred: pickPreferredCanonical(d.a, d.b),
        });
        branchDoubts.delete(makeDoubtKey(d.a, d.b));
      }
    }
    for (const d of degreeDoubts.values()) {
      if (isNearIdentical(d.a, d.b)) {
        autoDecisions.push({
          field: 'degree', a: d.a, b: d.b, same: true,
          preferred: pickPreferredCanonical(d.a, d.b),
        });
        degreeDoubts.delete(makeDoubtKey(d.a, d.b));
      }
    }

    let autoApplied = {
      pairs: 0, auto_resolved: 0, made_multi_candidate: 0,
      branch_rows_rewritten: 0, degree_rows_rewritten: 0,
    };
    if (autoDecisions.length > 0) {
      const res = await this.applyBatchDecisions(autoDecisions, userId || null);
      autoApplied = {
        pairs: autoDecisions.length,
        auto_resolved: res.auto_resolved,
        made_multi_candidate: res.made_multi_candidate,
        branch_rows_rewritten: res.branch_rows_rewritten,
        degree_rows_rewritten: res.degree_rows_rewritten,
        remaining_pending: res.remaining_pending,
      };
    }

    return {
      total_pending: pending.length,
      would_auto_resolve: wouldAutoResolve,
      untouchable,
      branch_doubts: [...branchDoubts.values()].sort((a, b) => b.count - a.count),
      degree_doubts: [...degreeDoubts.values()].sort((a, b) => b.count - a.count),
      auto_applied: autoApplied,
    };
  }

  /**
   * The actual records behind a single doubt — so the operator can see WHO is
   * driving a "{a} vs {b}" {field} pair before deciding same/different. Returns
   * each pending-review ↔ same-name+batch alumnus pair where one side carries
   * value `a` and the other `b` on the doubt's field (branch or degree).
   * Batch is compared as text to avoid casting junk batch values.
   */
  async doubtRecords(field, a, b, limit = 200) {
    const col = field === 'degree' ? 'degree' : 'branch'; // whitelist — safe to interpolate
    const r = await db.query(
      `SELECT rq.id AS review_id,
              rq.incoming_data->>'full_name'  AS name,
              rq.incoming_data->>'batch_year' AS batch,
              rq.incoming_data->>'${col}'     AS incoming_value,
              a.id      AS alumni_id,
              a.${col}  AS existing_value,
              a.current_company AS existing_company
       FROM review_queue rq
       JOIN alumni a
         ON LOWER(a.full_name) = LOWER(rq.incoming_data->>'full_name')
        AND a.batch_year::text = rq.incoming_data->>'batch_year'
       WHERE rq.status = 'pending'
         AND (
           (LOWER(rq.incoming_data->>'${col}') = LOWER($1) AND LOWER(COALESCE(a.${col}, '')) = LOWER($2))
           OR (LOWER(rq.incoming_data->>'${col}') = LOWER($2) AND LOWER(COALESCE(a.${col}, '')) = LOWER($1))
         )
       ORDER BY name
       LIMIT $3`,
      [a || '', b || '', limit]
    );
    return { field: col, a, b, count: r.rows.length, records: r.rows };
  }

  /**
   * Interactive rematch — phase 2 (apply).
   *
   * Re-runs the match using:
   *   - the built-in canonical functions (CSE/ECE/BE/ME/…), AND
   *   - the operator's "same" decisions from the scan as extra aliases.
   *
   * A "different" decision is recorded but doesn't change behaviour — those
   * pairs would not have matched anyway. We persist it so a future
   * iteration can show "you already said NO to this pair" instead of
   * re-asking.
   */
  async applyRematchWithDecisions(branchDecisions = [], degreeDecisions = [], userId) {
    // 1. Apply value normalization first — when the operator says
    //    "A and B are the same, store as X", actually update the alumni
    //    column so the canonical comparison in the rematch loop just works
    //    AND the database is cleaner going forward.
    let branchRowsRewritten = 0;
    let degreeRowsRewritten = 0;
    for (const d of branchDecisions) {
      if (d.same === true && d.preferred) {
        const res = await db.query(
          `UPDATE alumni SET branch = $1, updated_at = NOW()
           WHERE LOWER(branch) IN (LOWER($2), LOWER($3))
             AND branch IS DISTINCT FROM $1`,
          [d.preferred, d.a, d.b]
        );
        branchRowsRewritten += res.rowCount;
      }
    }
    for (const d of degreeDecisions) {
      if (d.same === true && d.preferred) {
        const res = await db.query(
          `UPDATE alumni SET degree = $1, updated_at = NOW()
           WHERE LOWER(COALESCE(degree, '')) IN (LOWER($2), LOWER($3))
             AND degree IS DISTINCT FROM $1`,
          [d.preferred, d.a, d.b]
        );
        degreeRowsRewritten += res.rowCount;
      }
    }

    // Build same-pair lookups (symmetric). Even after the UPDATE above, a
    // review's incoming_data still carries the *original* uncanonicalized
    // value — we use the alias map to recognise those during the loop.
    const branchSame = new Map();
    for (const d of branchDecisions) {
      if (d.same === true) branchSame.set(makeDoubtKey(d.a, d.b), true);
    }

    const pendingRes = await db.query(
      `SELECT id, incoming_data FROM review_queue WHERE status = 'pending'`
    );
    const pending = pendingRes.rows;

    let autoResolved = 0, madeMulti = 0, untouched = 0;

    for (const review of pending) {
      const incoming = typeof review.incoming_data === 'string'
        ? JSON.parse(review.incoming_data)
        : review.incoming_data || {};

      const fullName = (incoming.full_name || '').trim();
      const batchYear = parseInt(incoming.batch_year, 10);
      const inBranch = (incoming.branch || '').trim();
      if (!fullName || !batchYear || !inBranch) { untouched++; continue; }

      const inBranchCanon = canonicalBranch(inBranch);

      const cands = await db.query(
        `SELECT id, branch FROM alumni
         WHERE LOWER(full_name) = LOWER($1) AND batch_year = $2`,
        [fullName, batchYear]
      );

      const inBranchLower = inBranch.toLowerCase();
      const matchedIds = cands.rows.filter(c => {
        const cb = (c.branch || '').trim();
        // Auto-match if canonical equal.
        if (inBranchCanon && canonicalBranch(cb) === inBranchCanon) return true;
        // Fallback for uncategorizable branches: case-insensitive string match.
        if (cb && cb.toLowerCase() === inBranchLower) return true;
        // Operator-confirmed "same" pair.
        if (cb && branchSame.get(makeDoubtKey(inBranch, cb)) === true) return true;
        return false;
      }).map(c => c.id);

      if (matchedIds.length === 0) { untouched++; continue; }

      if (matchedIds.length === 1) {
        await db.query(
          `UPDATE review_queue
             SET status               = 'merged',
                 existing_alumni_id   = $2,
                 candidate_alumni_ids = $3::jsonb,
                 review_type          = 'fuzzy',
                 resolved_by          = $4,
                 resolved_at          = NOW(),
                 resolution_note      = 'Auto-resolved by interactive rematch'
           WHERE id = $1`,
          [review.id, matchedIds[0], JSON.stringify(matchedIds), userId]
        );
        autoResolved++;
      } else {
        await db.query(
          `UPDATE review_queue
             SET review_type          = 'identity_ambiguous',
                 candidate_alumni_ids = $2::jsonb,
                 existing_alumni_id   = $3
           WHERE id = $1`,
          [review.id, JSON.stringify(matchedIds), matchedIds[0]]
        );
        madeMulti++;
      }
    }

    logger.warn({
      userId, total: pending.length, autoResolved, madeMulti, untouched,
      branchAliasesUsed: branchSame.size,
      degreeDecisions: degreeDecisions.length,
      branchRowsRewritten, degreeRowsRewritten,
    }, 'Interactive rematch applied');

    return {
      total: pending.length,
      auto_resolved: autoResolved,
      made_multi_candidate: madeMulti,
      untouched,
      branch_rows_rewritten: branchRowsRewritten,
      degree_rows_rewritten: degreeRowsRewritten,
    };
  }

  /**
   * Interactive rematch — incremental phase. Used by the doubt modal: each
   * "Same / Different / Skip" click hits this once, immediately rewrites
   * alumni rows (for Same+preferred), re-evaluates the pending reviews that
   * mention either side of the pair, and returns running counts so the UI
   * progress bar can advance. "Different" and "Skip" are no-ops here — we
   * just return the current totals so the bar stays in sync.
   */
  async applyOneDecision(field, a, b, same, preferred, userId) {
    let branchRowsRewritten = 0;
    let degreeRowsRewritten = 0;
    let autoResolved = 0;
    let madeMulti = 0;

    if (same && preferred && field === 'branch') {
      const r = await db.query(
        `UPDATE alumni SET branch = $1, updated_at = NOW()
         WHERE LOWER(branch) IN (LOWER($2), LOWER($3))
           AND branch IS DISTINCT FROM $1`,
        [preferred, a, b]
      );
      branchRowsRewritten = r.rowCount;
    } else if (same && preferred && field === 'degree') {
      const r = await db.query(
        `UPDATE alumni SET degree = $1, updated_at = NOW()
         WHERE LOWER(COALESCE(degree, '')) IN (LOWER($2), LOWER($3))
           AND degree IS DISTINCT FROM $1`,
        [preferred, a, b]
      );
      degreeRowsRewritten = r.rowCount;
    }

    // Branch decisions can unlock matches; degree doesn't affect matching
    // outcome (only the stored value). Only re-evaluate pending reviews
    // whose incoming branch is one of the pair members.
    if (same && field === 'branch') {
      const reviewsRes = await db.query(
        `SELECT id, incoming_data FROM review_queue
         WHERE status = 'pending'
           AND (
             LOWER(incoming_data->>'branch') = LOWER($1)
             OR LOWER(incoming_data->>'branch') = LOWER($2)
           )`,
        [a, b]
      );
      for (const review of reviewsRes.rows) {
        const incoming = typeof review.incoming_data === 'string'
          ? JSON.parse(review.incoming_data)
          : review.incoming_data || {};
        const fullName = (incoming.full_name || '').trim();
        const batchYear = parseInt(incoming.batch_year, 10);
        if (!fullName || !batchYear) continue;
        const inBranch = (incoming.branch || '').trim();
        const inBranchCanon = canonicalBranch(inBranch);

        const cands = await db.query(
          `SELECT id, branch FROM alumni
           WHERE LOWER(full_name) = LOWER($1) AND batch_year = $2`,
          [fullName, batchYear]
        );
        const aL = a.toLowerCase(), bL = b.toLowerCase();
        const prefL = (preferred || '').toLowerCase();
        const matched = cands.rows.filter(c => {
          const cb = (c.branch || '').trim();
          if (inBranchCanon && canonicalBranch(cb) === inBranchCanon) return true;
          // Fallback for uncategorizable branches.
          const inLow = inBranch.toLowerCase();
          const cbLow = cb.toLowerCase();
          if (cb && cbLow === inLow) return true;
          // Alias path: incoming side is one of the pair, candidate side is
          // the other pair member or the preferred (post-rewrite) value.
          const incomingInPair = inLow === aL || inLow === bL;
          const candInPair = cbLow === aL || cbLow === bL || (prefL && cbLow === prefL);
          return incomingInPair && candInPair;
        }).map(c => c.id);

        if (matched.length === 1) {
          await db.query(
            `UPDATE review_queue
               SET status               = 'merged',
                   existing_alumni_id   = $2,
                   candidate_alumni_ids = $3::jsonb,
                   review_type          = 'fuzzy',
                   resolved_by          = $4,
                   resolved_at          = NOW(),
                   resolution_note      = 'Auto-resolved by interactive rematch'
             WHERE id = $1`,
            [review.id, matched[0], JSON.stringify(matched), userId]
          );
          autoResolved++;
        } else if (matched.length > 1) {
          await db.query(
            `UPDATE review_queue
               SET review_type          = 'identity_ambiguous',
                   candidate_alumni_ids = $2::jsonb,
                   existing_alumni_id   = $3
             WHERE id = $1`,
            [review.id, JSON.stringify(matched), matched[0]]
          );
          madeMulti++;
        }
      }
    }

    // Always report current pending so the progress bar reflects reality
    // even when the decision was Different / Skip (no DB change).
    const remRes = await db.query(
      `SELECT count(*)::int AS n FROM review_queue WHERE status = 'pending'`
    );
    return {
      auto_resolved: autoResolved,
      made_multi_candidate: madeMulti,
      branch_rows_rewritten: branchRowsRewritten,
      degree_rows_rewritten: degreeRowsRewritten,
      remaining_pending: remRes.rows[0].n,
    };
  }

  /**
   * Persist a single decision so it never re-surfaces on a future scan.
   * Stored in (a, b) lower-case sorted order to make the UNIQUE constraint
   * direction-invariant. Used by applyBatchDecisions.
   */
  async _persistDecision(client, field, a, b, same, preferred, userId) {
    const [va, vb] = [a, b].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
    await client.query(
      `INSERT INTO branch_alias_decisions
         (field, value_a, value_b, decision, preferred, decided_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (field, value_a, value_b) DO UPDATE
         SET decision = EXCLUDED.decision,
             preferred = EXCLUDED.preferred,
             decided_by = EXCLUDED.decided_by,
             decided_at = NOW()`,
      [field, va, vb, same ? 'same' : 'different', preferred || null, userId || null]
    );
  }

  /**
   * Remove a stored decision so the doubt can re-appear (used by the
   * frontend "undo" within a buffer window).
   */
  async forgetDecision(field, a, b) {
    const [va, vb] = [a, b].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
    await db.query(
      `DELETE FROM branch_alias_decisions
       WHERE field = $1 AND value_a = $2 AND value_b = $3`,
      [field, va, vb]
    );
  }

  /**
   * Apply a batch of up to N decisions atomically: persist each, rewrite
   * alumni rows for "same + preferred" entries, then re-evaluate the
   * pending reviews touched by any of these pairs. Returns aggregate counts
   * so the modal can update progress + report what changed.
   */
  async applyBatchDecisions(decisions, userId) {
    if (!Array.isArray(decisions) || decisions.length === 0) {
      const rem = await db.query(`SELECT count(*)::int AS n FROM review_queue WHERE status = 'pending'`);
      return {
        auto_resolved: 0, made_multi_candidate: 0,
        branch_rows_rewritten: 0, degree_rows_rewritten: 0,
        remaining_pending: rem.rows[0].n,
      };
    }

    let branchRowsRewritten = 0;
    let degreeRowsRewritten = 0;
    let autoResolved = 0;
    let madeMulti = 0;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 1. Persist every decision so future scans skip the pair.
      for (const d of decisions) {
        await this._persistDecision(client, d.field, d.a, d.b, !!d.same, d.preferred, userId);
      }

      // 2. Rewrite alumni for same+preferred decisions so canonical
      //    comparison just works during the re-evaluation step below.
      for (const d of decisions) {
        if (!d.same || !d.preferred) continue;
        if (d.field === 'branch') {
          const r = await client.query(
            `UPDATE alumni SET branch = $1, updated_at = NOW()
             WHERE LOWER(branch) IN (LOWER($2), LOWER($3))
               AND branch IS DISTINCT FROM $1`,
            [d.preferred, d.a, d.b]
          );
          branchRowsRewritten += r.rowCount;
        } else if (d.field === 'degree') {
          const r = await client.query(
            `UPDATE alumni SET degree = $1, updated_at = NOW()
             WHERE LOWER(COALESCE(degree, '')) IN (LOWER($2), LOWER($3))
               AND degree IS DISTINCT FROM $1`,
            [d.preferred, d.a, d.b]
          );
          degreeRowsRewritten += r.rowCount;
        }
      }

      // 3. Re-evaluate pending reviews whose incoming branch matches any
      //    side of a "same" branch decision. Degree decisions don't gate
      //    matching, so only branch is needed here.
      const sameBranchPairs = decisions.filter(d => d.field === 'branch' && d.same);
      if (sameBranchPairs.length > 0) {
        const values = sameBranchPairs.flatMap(d => [d.a, d.b]).map(v => v.toLowerCase());
        const reviewsRes = await client.query(
          `SELECT id, incoming_data FROM review_queue
           WHERE status = 'pending'
             AND LOWER(incoming_data->>'branch') = ANY($1::text[])`,
          [values]
        );

        for (const review of reviewsRes.rows) {
          const incoming = typeof review.incoming_data === 'string'
            ? JSON.parse(review.incoming_data)
            : review.incoming_data || {};
          const fullName = (incoming.full_name || '').trim();
          const batchYear = parseInt(incoming.batch_year, 10);
          if (!fullName || !batchYear) continue;
          const inBranch = (incoming.branch || '').trim();
          const inBranchCanon = canonicalBranch(inBranch);

          const cands = await client.query(
            `SELECT id, branch FROM alumni
             WHERE LOWER(full_name) = LOWER($1) AND batch_year = $2`,
            [fullName, batchYear]
          );

          const matched = cands.rows.filter(c => {
            const cb = (c.branch || '').trim();
            if (inBranchCanon && canonicalBranch(cb) === inBranchCanon) return true;
            const inLow = inBranch.toLowerCase();
            const cbLow = cb.toLowerCase();
            // Fallback for uncategorizable branches.
            if (cb && cbLow === inLow) return true;
            return sameBranchPairs.some(d => {
              const aL = d.a.toLowerCase(), bL = d.b.toLowerCase();
              const prefL = (d.preferred || '').toLowerCase();
              const inP = inLow === aL || inLow === bL;
              const cP = cbLow === aL || cbLow === bL || (prefL && cbLow === prefL);
              return inP && cP;
            });
          }).map(c => c.id);

          if (matched.length === 1) {
            await client.query(
              `UPDATE review_queue
                 SET status='merged', existing_alumni_id=$2,
                     candidate_alumni_ids=$3::jsonb, review_type='fuzzy',
                     resolved_by=$4, resolved_at=NOW(),
                     resolution_note='Auto-resolved by interactive rematch'
               WHERE id=$1`,
              [review.id, matched[0], JSON.stringify(matched), userId]
            );
            autoResolved++;
          } else if (matched.length > 1) {
            await client.query(
              `UPDATE review_queue
                 SET review_type='identity_ambiguous',
                     candidate_alumni_ids=$2::jsonb, existing_alumni_id=$3
               WHERE id=$1`,
              [review.id, JSON.stringify(matched), matched[0]]
            );
            madeMulti++;
          }
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    const rem = await db.query(`SELECT count(*)::int AS n FROM review_queue WHERE status = 'pending'`);

    logger.warn({
      userId, decisions: decisions.length,
      autoResolved, madeMulti,
      branchRowsRewritten, degreeRowsRewritten,
    }, 'Interactive rematch batch applied');

    return {
      auto_resolved: autoResolved,
      made_multi_candidate: madeMulti,
      branch_rows_rewritten: branchRowsRewritten,
      degree_rows_rewritten: degreeRowsRewritten,
      remaining_pending: rem.rows[0].n,
    };
  }

  /**
   * Auto-separate pending reviews where the incoming row and the existing
   * alumnus both have a LinkedIn URL AND those URLs are different. Different
   * LinkedIn URLs is a near-definitive "two different people" signal —
   * stronger than name+batch+branch identity (which can collide for distinct
   * people with the same canonical identity).
   *
   * Each separation goes through the existing resolve('new') path, which
   * INSERTs the incoming row as its own alumnus. That way both records
   * persist as distinct alumni instead of one being thrown away.
   *
   * Batched (default 500 per call) so the proxy timeout never fires.
   * Skips reviews where:
   *   - either side has no LinkedIn URL
   *   - the URLs are equivalent after normalization
   *   - the incoming row has no full_name (resolve('new') would error)
   */
  async bulkSeparateByDifferentLinkedin(userId, batchSize = 500) {
    const pendingRes = await db.query(
      `SELECT rq.id, rq.incoming_data, a.linkedin_url AS ex_linkedin
       FROM review_queue rq
       JOIN alumni a ON a.id = rq.existing_alumni_id
       WHERE rq.status = 'pending'
         AND a.linkedin_url IS NOT NULL AND a.linkedin_url <> ''
         AND rq.incoming_data->>'linkedin_url' IS NOT NULL
         AND rq.incoming_data->>'linkedin_url' <> ''
       LIMIT $1`,
      [batchSize]
    );

    let separated = 0;
    let skipped = 0;
    let errored = 0;

    for (const review of pendingRes.rows) {
      const incoming = typeof review.incoming_data === 'string'
        ? JSON.parse(review.incoming_data)
        : review.incoming_data || {};

      if (!incoming.full_name || !incoming.full_name.trim()) {
        skipped++;
        continue;
      }

      const inLinkedin = normalizeLinkedin(incoming.linkedin_url);
      const exLinkedin = normalizeLinkedin(review.ex_linkedin);
      if (!inLinkedin || !exLinkedin || inLinkedin === exLinkedin) {
        skipped++;
        continue;
      }

      try {
        await this.resolve(
          review.id, 'new', userId,
          'Auto-separated: different LinkedIn URLs', {}, null
        );
        separated++;
      } catch (e) {
        errored++;
        logger.warn({ reviewId: review.id, err: e.message },
          'Bulk separate-by-linkedin failed for review');
      }
    }

    const remRes = await db.query(
      `SELECT count(*)::int AS n FROM review_queue rq
       JOIN alumni a ON a.id = rq.existing_alumni_id
       WHERE rq.status = 'pending'
         AND a.linkedin_url IS NOT NULL AND a.linkedin_url <> ''
         AND rq.incoming_data->>'linkedin_url' IS NOT NULL
         AND rq.incoming_data->>'linkedin_url' <> ''`
    );

    logger.warn({ userId, separated, skipped, errored, remaining: remRes.rows[0].n },
      'Bulk separate-by-different-linkedin batch done');

    return {
      separated, skipped, errored,
      processed: pendingRes.rows.length,
      remaining: remRes.rows[0].n,
    };
  }

  /**
   * Bulk-resolve every pending review whose incoming branch is junk —
   * year-only, job title, or empty. Marks each as 'skipped' with a note so
   * the audit trail survives (no destructive DELETE). After this clears
   * out the noise, the remaining queue is real merge candidates that the
   * subsequent bulk-merge / contact-merge can actually act on.
   *
   * Batched (default 1000 per call) so the proxy timeout never fires.
   * Frontend loops until remaining=0.
   */
  async bulkResolveUnmergeable(userId, batchSize = 1000) {
    // 1. UNDO the earlier bad behaviour: any review previously marked
    //    'skipped' by this endpoint gets restored to 'pending' AND has its
    //    junk branch value cleared so it doesn't re-trip the detector.
    //    Idempotent — safe to run repeatedly.
    const restoreRes = await db.query(
      `UPDATE review_queue
         SET status = 'pending',
             resolved_by = NULL,
             resolved_at = NULL,
             resolution_note = NULL,
             incoming_data = jsonb_set(incoming_data, '{branch}', '""'::jsonb)
       WHERE resolution_note IN (
         'Auto-skipped: incoming branch is not a real branch (year/job-title/empty)'
       )`
    );

    // 2. Clear the junk branch value on pending reviews so the row stays
    //    open for the rest of the merge pipeline (contact-based merge,
    //    LinkedIn-based separation, etc.) to act on. We never delete or
    //    skip — the operator-correct decision depends on signals the
    //    matcher will still evaluate (email/phone/linkedin).
    const titlePattern = UNMERGEABLE_JOB_TITLES.join('|');
    const junkSQL = `(
         (incoming_data->>'branch') ~ '^[0-9]+$'
      OR (incoming_data->>'branch') ~* '\\m(${titlePattern})\\M'
    )`;
    const clearRes = await db.query(
      `UPDATE review_queue
         SET incoming_data = jsonb_set(incoming_data, '{branch}', '""'::jsonb)
       WHERE id IN (
         SELECT id FROM review_queue
         WHERE status = 'pending' AND ${junkSQL}
         LIMIT $1
       )`,
      [batchSize]
    );

    // 3. Same cleanup on the alumni table — year-only branch values are
    //    pure data noise. NULL the column, leave the row.
    const alumniCleanup = await db.query(
      `UPDATE alumni SET branch = NULL, updated_at = NOW()
       WHERE branch ~ '^[0-9]+$'`
    );

    const remRes = await db.query(
      `SELECT count(*)::int AS n FROM review_queue
       WHERE status = 'pending' AND ${junkSQL}`
    );

    logger.warn({
      userId,
      restored: restoreRes.rowCount,
      cleared: clearRes.rowCount,
      alumniBranchesNulled: alumniCleanup.rowCount,
      remaining: remRes.rows[0].n,
    }, 'Bulk clear-junk-branches batch done');

    return {
      restored: restoreRes.rowCount,
      cleared: clearRes.rowCount,
      processed: clearRes.rowCount,
      remaining: remRes.rows[0].n,
      alumni_branches_nulled: alumniCleanup.rowCount,
    };
  }

  /**
   * Auto-separate pending reviews where the canonical branch AND the
   * canonical degree both differ between incoming and existing — strong
   * "different person" signal. Same person can't be in Chemical Engineering
   * AND Computer Science, and even if they could, also being in MSc vs PhD
   * makes it unambiguous.
   *
   * Each separation goes through resolve('new'), so the incoming row
   * becomes its own alumnus and both records persist.
   *
   * Skips reviews where either side has no canonicalizable branch OR no
   * canonicalizable degree — can't be sure they differ.
   */
  async bulkSeparateByDifferentBranchAndDegree(userId, batchSize = 500) {
    const pendingRes = await db.query(
      `SELECT rq.id, rq.incoming_data,
              a.branch AS ex_branch, a.degree AS ex_degree
       FROM review_queue rq
       JOIN alumni a ON a.id = rq.existing_alumni_id
       WHERE rq.status = 'pending'
         AND a.branch IS NOT NULL AND a.branch <> ''
         AND a.degree IS NOT NULL AND a.degree <> ''
         AND rq.incoming_data->>'branch' IS NOT NULL
         AND rq.incoming_data->>'branch' <> ''
         AND rq.incoming_data->>'degree' IS NOT NULL
         AND rq.incoming_data->>'degree' <> ''
       LIMIT $1`,
      [batchSize]
    );

    let separated = 0;
    let skipped = 0;
    let errored = 0;

    for (const review of pendingRes.rows) {
      const incoming = typeof review.incoming_data === 'string'
        ? JSON.parse(review.incoming_data)
        : review.incoming_data || {};

      if (!incoming.full_name || !incoming.full_name.trim()) {
        skipped++;
        continue;
      }

      const inB = canonicalBranch(incoming.branch);
      const exB = canonicalBranch(review.ex_branch);
      const inD = canonicalDegree(incoming.degree);
      const exD = canonicalDegree(review.ex_degree);

      // Need a canonical on every side to be sure values truly differ.
      if (!inB || !exB || !inD || !exD) { skipped++; continue; }
      // The matched canonical strings — must be literally different on both axes.
      if (inB === exB || inD === exD) { skipped++; continue; }

      try {
        await this.resolve(
          review.id, 'new', userId,
          `Auto-separated: different canonical branch (${exB}≠${inB}) AND degree (${exD}≠${inD})`,
          {}, null
        );
        separated++;
      } catch (e) {
        errored++;
        logger.warn({ reviewId: review.id, err: e.message },
          'Bulk separate-by-branch-degree failed for review');
      }
    }

    const remRes = await db.query(
      `SELECT count(*)::int AS n FROM review_queue rq
       JOIN alumni a ON a.id = rq.existing_alumni_id
       WHERE rq.status = 'pending'
         AND a.branch IS NOT NULL AND a.branch <> ''
         AND a.degree IS NOT NULL AND a.degree <> ''
         AND rq.incoming_data->>'branch' IS NOT NULL
         AND rq.incoming_data->>'branch' <> ''
         AND rq.incoming_data->>'degree' IS NOT NULL
         AND rq.incoming_data->>'degree' <> ''`
    );

    logger.warn({ userId, separated, skipped, errored, remaining: remRes.rows[0].n },
      'Bulk separate-by-different-branch-degree batch done');

    return {
      separated, skipped, errored,
      processed: pendingRes.rows.length,
      remaining: remRes.rows[0].n,
    };
  }

  /**
   * Diagnostics for the merging algorithm. Used by the dev page to inspect
   * what data shape is in the alumni table vs. what's sitting in the pending
   * review queue — makes it easy to spot the values the canonicalizer can't
   * reconcile, the batches where multi-candidate problems concentrate, and
   * the duplicate-alumni clusters that keep generating new ambiguous reviews.
   *
   * Each query is bounded (LIMIT 300) so the page renders fast even with
   * very long tails. The canonical_code field on each branch row is computed
   * by canonicalBranch() — null means "unknown to the matcher".
   */
  async diagnostics() {
    const [
      alumniBranches, alumniBatches, alumniDupClusters,
      pendingBranches, pendingBatches, queueStats,
    ] = await Promise.all([
      db.query(
        `SELECT branch AS value, count(*)::int AS alumni_count
         FROM alumni
         WHERE branch IS NOT NULL AND branch <> ''
         GROUP BY branch
         ORDER BY count(*) DESC, branch ASC
         LIMIT 300`
      ),
      db.query(
        `SELECT batch_year::int AS year, count(*)::int AS alumni_count
         FROM alumni
         WHERE batch_year IS NOT NULL
         GROUP BY batch_year
         ORDER BY batch_year DESC
         LIMIT 300`
      ),
      // Duplicate alumni clusters — these are the rows that cause
      // identity_ambiguous reviews. Show top 100 by row count.
      db.query(
        `SELECT full_name AS name, batch_year, branch, count(*)::int AS row_count,
                array_agg(id) AS ids
         FROM alumni
         WHERE full_name IS NOT NULL AND batch_year IS NOT NULL AND branch IS NOT NULL
         GROUP BY LOWER(full_name), batch_year, LOWER(branch), full_name, branch
         HAVING count(*) > 1
         ORDER BY count(*) DESC
         LIMIT 100`
      ),
      db.query(
        `SELECT incoming_data->>'branch' AS value, count(*)::int AS pending_count
         FROM review_queue
         WHERE status = 'pending'
           AND incoming_data->>'branch' IS NOT NULL
           AND incoming_data->>'branch' <> ''
         GROUP BY incoming_data->>'branch'
         ORDER BY count(*) DESC
         LIMIT 300`
      ),
      db.query(
        `SELECT (incoming_data->>'batch_year')::int AS year, count(*)::int AS pending_count
         FROM review_queue
         WHERE status = 'pending'
           AND incoming_data->>'batch_year' ~ '^[0-9]+$'
           AND (incoming_data->>'batch_year')::int > 0
         GROUP BY (incoming_data->>'batch_year')::int
         ORDER BY year DESC
         LIMIT 300`
      ),
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'pending' AND review_type = 'identity_ambiguous') AS pending_multi_candidate,
          COUNT(*) FILTER (WHERE status = 'pending' AND COALESCE(review_type, 'fuzzy') = 'fuzzy') AS pending_fuzzy,
          COUNT(*) FILTER (WHERE status = 'pending' AND (incoming_data->>'branch' IS NULL OR incoming_data->>'branch' = '')) AS pending_no_branch
        FROM review_queue
      `),
    ]);

    // Tag each branch row with its canonical code so the UI can highlight
    // unknown-to-canonicalizer values (the ones causing manual work).
    const tagBranch = (rows) => rows.map(r => ({
      ...r,
      canonical: canonicalBranch(r.value) || null,
    }));

    return {
      queue: queueStats.rows[0],
      alumni_branches:        tagBranch(alumniBranches.rows),
      alumni_batches:         alumniBatches.rows,
      alumni_dup_clusters:    alumniDupClusters.rows,
      pending_branches:       tagBranch(pendingBranches.rows),
      pending_batches:        pendingBatches.rows,
    };
  }

  /**
   * Auto-merge pending reviews where the incoming row and the existing
   * alumnus share an email or phone number. Shared contact info is a much
   * stronger identity signal than the fuzzy match_score the matcher used,
   * so this resolves the long tail of "fuzzy-matched on email/phone but
   * name fuzzy-matched too" cases.
   *
   * One call processes one batch (default 500) so the 30s proxy timeout is
   * never hit. Frontend loops calling until remaining=0. Email comparison is
   * case-insensitive on the local-part + domain. Phone comparison normalizes
   * to last-10-digits (strips country codes, spaces, dashes, + signs).
   */
  async bulkResolveByContact(userId, batchSize = 500) {
    const pendingRes = await db.query(
      `SELECT rq.id, rq.incoming_data,
              a.emails AS ex_emails, a.phones AS ex_phones
       FROM review_queue rq
       JOIN alumni a ON a.id = rq.existing_alumni_id
       WHERE rq.status = 'pending'
         AND rq.existing_alumni_id IS NOT NULL
       LIMIT $1`,
      [batchSize]
    );

    let merged = 0;
    let skipped = 0;

    for (const review of pendingRes.rows) {
      const incoming = typeof review.incoming_data === 'string'
        ? JSON.parse(review.incoming_data)
        : review.incoming_data || {};

      const inEmail = (incoming.email || '').trim().toLowerCase();
      const inPhone = normalizePhoneLast10(incoming.phone || '');

      if (!inEmail && !inPhone) { skipped++; continue; }

      const exEmails = ensureArray(review.ex_emails);
      const exPhones = ensureArray(review.ex_phones);

      let matchedBy = null;
      if (inEmail) {
        for (const e of exEmails) {
          if ((e?.value || '').trim().toLowerCase() === inEmail) {
            matchedBy = 'email'; break;
          }
        }
      }
      if (!matchedBy && inPhone) {
        for (const p of exPhones) {
          if (normalizePhoneLast10(p?.value || '') === inPhone) {
            matchedBy = 'phone'; break;
          }
        }
      }

      if (matchedBy) {
        await db.query(
          `UPDATE review_queue
             SET status = 'merged',
                 resolved_by = $2,
                 resolved_at = NOW(),
                 resolution_note = $3
           WHERE id = $1 AND status = 'pending'`,
          [review.id, userId, `Auto-merged by shared ${matchedBy}`]
        );
        merged++;
      } else {
        skipped++;
      }
    }

    const remRes = await db.query(
      `SELECT count(*)::int AS n FROM review_queue
       WHERE status = 'pending' AND existing_alumni_id IS NOT NULL`
    );

    logger.warn({ userId, merged, skipped, remaining: remRes.rows[0].n },
      'Bulk resolve-by-contact batch done');

    return {
      merged,
      skipped,
      processed: pendingRes.rows.length,
      remaining: remRes.rows[0].n,
    };
  }

  /**
   * Conservative auto-merge for the review queue. Collapses alumni clusters
   * that share EXACT (LOWER name, batch_year, LOWER branch) ONLY when the
   * cluster cannot possibly be two different people:
   *   • no row has a linkedin_url,
   *   • the enrollment_no does NOT conflict — at most one distinct non-empty
   *     value across the cluster (both empty, one set, or all equal), and
   *   • EITHER at most ONE row carries contact info (email/phone), OR the rows
   *     SHARE a contact value (same email/phone on 2+ rows — a definitive
   *     same-person signal even when both sides have contact).
   * That shape is a bare identity/roster stub, OR two records that are clearly
   * the same person via a shared contact — definitively one person. The most-anchored
   * row (enrollment, then contact) is kept; the rest fold their fields in and
   * are deleted. Pending "possible duplicate" cards for that identity resolve
   * as 'merged'.
   *
   * The enrollment_no guard is the safety rail: two homonyms in the same
   * batch/branch carry DIFFERENT roster enrollment numbers, so the cluster has
   * 2 distinct values and is left untouched for a human. Batched (50
   * clusters/call) so the request returns under the proxy timeout; the
   * frontend loops until remaining = 0.
   */
  async bulkMergeBareDuplicates(userId, batchSize = 50) {
    // A row "has contact" if it carries a non-empty email or phone array.
    const HAS_CONTACT = `(
      (jsonb_typeof(emails) = 'array' AND jsonb_array_length(emails) > 0)
      OR (jsonb_typeof(phones) = 'array' AND jsonb_array_length(phones) > 0)
    )`;

    // A cluster is safe to auto-merge only when it cannot be two different
    // people:
    //   • no row has a linkedin_url,
    //   • enrollment_no does NOT conflict — count(DISTINCT non-empty) <= 1
    //     (all-empty / one-set / all-equal ok; two different numbers blocked), AND
    //   • EITHER at most one row carries contact (bare stub + one record)
    //     OR the rows SHARE a contact value (same email or phone in 2+ rows) —
    //     a shared contact is a definitive same-person signal even when both
    //     sides have contact. Phones compare on digits only.
    // Built as CTEs so the same logic drives both the batch fetch and the
    // remaining-count query.
    const SAFE_CLUSTER_CTE = `
      WITH base AS (
        SELECT id, LOWER(full_name) AS lname, batch_year, LOWER(branch) AS lbranch,
               enrollment_no, linkedin_url, emails, phones, created_at,
               ${HAS_CONTACT} AS has_contact
        FROM alumni
        WHERE full_name IS NOT NULL AND batch_year IS NOT NULL AND branch IS NOT NULL
      ),
      clusters AS (
        SELECT lname, batch_year, lbranch,
               array_agg(id ORDER BY
                 (enrollment_no IS NOT NULL AND enrollment_no <> '') DESC,
                 has_contact DESC, created_at ASC) AS ids,
               count(*) FILTER (WHERE has_contact) AS contact_rows
        FROM base
        GROUP BY lname, batch_year, lbranch
        HAVING count(*) > 1
           AND bool_or(linkedin_url IS NOT NULL AND linkedin_url <> '') = false
           AND count(DISTINCT NULLIF(enrollment_no, '')) <= 1
      ),
      cvals AS (
        SELECT b.lname, b.batch_year, b.lbranch, b.id, x.val
        FROM base b,
          LATERAL (
            SELECT lower(e->>'value') AS val
              FROM jsonb_array_elements(COALESCE(b.emails, '[]'::jsonb)) e
            UNION ALL
            SELECT regexp_replace(p->>'value', '\\D', '', 'g') AS val
              FROM jsonb_array_elements(COALESCE(b.phones, '[]'::jsonb)) p
          ) x
        WHERE x.val IS NOT NULL AND x.val <> ''
      ),
      shared AS (
        SELECT lname, batch_year, lbranch
        FROM cvals
        GROUP BY lname, batch_year, lbranch, val
        HAVING count(DISTINCT id) >= 2
      ),
      safe AS (
        SELECT c.lname, c.batch_year, c.lbranch, c.ids
        FROM clusters c
        WHERE c.contact_rows <= 1
           OR EXISTS (
             SELECT 1 FROM shared s
              WHERE s.lname = c.lname AND s.batch_year = c.batch_year
                AND s.lbranch = c.lbranch
           )
      )`;

    const clusterRes = await db.query(
      `${SAFE_CLUSTER_CTE}
       SELECT lname, batch_year, lbranch, ids FROM safe LIMIT $1`,
      [batchSize]
    );

    let clustersMerged = 0;
    let rowsDeleted = 0;
    let reviewsResolved = 0;

    for (const cluster of clusterRes.rows) {
      const ids = cluster.ids;
      const primary = ids[0];            // most-anchored row wins (enrollment, then contact)
      const duplicates = ids.slice(1);
      if (duplicates.length === 0) continue;

      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // Fold every duplicate's fields into the primary. Enrollment/contact
        // can live on a non-primary row (e.g. roster stub vs contact record),
        // so merge emails/phones (JSONB union) and COALESCE the scalars. NULL
        // the duplicate's enrollment_no first so handing it to the primary
        // can't briefly trip the partial unique index on enrollment_no.
        for (const dupId of duplicates) {
          const dupRes = await client.query(
            `SELECT emails, phones, enrollment_no,
                    current_company, current_title, current_city
             FROM alumni WHERE id = $1`,
            [dupId]
          );
          if (dupRes.rows.length === 0) continue;
          const dup = dupRes.rows[0];

          await client.query(
            `UPDATE alumni SET enrollment_no = NULL WHERE id = $1`,
            [dupId]
          );

          await client.query(
            `UPDATE alumni a
                SET emails = (
                  SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)
                  FROM (
                    SELECT e FROM jsonb_array_elements(COALESCE(a.emails, '[]'::jsonb)) e
                    UNION
                    SELECT e FROM jsonb_array_elements($2::jsonb) e
                  ) m
                ),
                phones = (
                  SELECT COALESCE(jsonb_agg(DISTINCT p), '[]'::jsonb)
                  FROM (
                    SELECT p FROM jsonb_array_elements(COALESCE(a.phones, '[]'::jsonb)) p
                    UNION
                    SELECT p FROM jsonb_array_elements($3::jsonb) p
                  ) m
                ),
                enrollment_no   = COALESCE(NULLIF(a.enrollment_no, ''), $4),
                current_company = COALESCE(NULLIF(a.current_company, ''), $5),
                current_title   = COALESCE(NULLIF(a.current_title, ''), $6),
                current_city    = COALESCE(NULLIF(a.current_city, ''), $7),
                updated_at = NOW()
              WHERE a.id = $1`,
            [
              primary,
              JSON.stringify(dup.emails || []),
              JSON.stringify(dup.phones || []),
              dup.enrollment_no,
              dup.current_company, dup.current_title, dup.current_city,
            ]
          );
        }

        // Re-point FK refs at the primary before deleting (NO ACTION FKs).
        await client.query(
          `UPDATE review_queue SET existing_alumni_id = $1
            WHERE existing_alumni_id = ANY($2::uuid[])`,
          [primary, duplicates]
        );
        await client.query(
          `UPDATE campaign_recipients SET alumni_id = $1
            WHERE alumni_id = ANY($2::uuid[])`,
          [primary, duplicates]
        );

        const del = await client.query(
          `DELETE FROM alumni WHERE id = ANY($1::uuid[])`,
          [duplicates]
        );
        rowsDeleted += del.rowCount;

        // Resolve the "possible duplicate" cards for THIS identity that now
        // point at the primary. Identity-scoped so unrelated fuzzy reviews on
        // the primary are left pending.
        const rq = await client.query(
          `UPDATE review_queue
              SET status = 'merged', resolved_by = $2, resolved_at = NOW(),
                  resolution_note = 'Auto-merged: exact name+batch+branch, no LinkedIn/enrollment, single contact source'
            WHERE status = 'pending'
              AND existing_alumni_id = $1
              AND LOWER(COALESCE(incoming_data->>'full_name', '')) = $3
              AND COALESCE(incoming_data->>'batch_year', '') = $4
              AND LOWER(COALESCE(incoming_data->>'branch', '')) = $5`,
          [primary, userId, cluster.lname, String(cluster.batch_year), cluster.lbranch]
        );
        reviewsResolved += rq.rowCount;

        await client.query('COMMIT');
        clustersMerged++;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        // One bad cluster shouldn't abort the batch — log and move on.
        logger.error({ err: err.message, primary, duplicates },
          'Bare-duplicate merge cluster failed');
      } finally {
        client.release();
      }
    }

    const remRes = await db.query(
      `${SAFE_CLUSTER_CTE} SELECT count(*)::int AS n FROM safe`
    );
    const remaining = remRes.rows[0].n;

    logger.warn({ userId, clustersMerged, rowsDeleted, reviewsResolved, remaining },
      'Bulk merge bare-duplicates batch done');

    return {
      merged: clustersMerged,
      rows_deleted: rowsDeleted,
      reviews_resolved: reviewsResolved,
      processed: clusterRes.rows.length,
      remaining,
    };
  }

  /**
   * Stored decisions, newest first — for the "Doubts solved" tab.
   */
  async listResolvedDecisions() {
    const r = await db.query(
      `SELECT field, value_a, value_b, decision, preferred, decided_at
       FROM branch_alias_decisions
       ORDER BY decided_at DESC
       LIMIT 500`
    );
    return r.rows;
  }

  /**
   * Strip "college as employer" / "Student" noise so the matcher decides on
   * real signals. Alumni who listed Thapar as their company (any spelling) and
   * a "Student" job title pollute the company/title fields — clearing them on
   * both the alumni rows AND pending-review incoming_data removes a false
   * "same company" signal before a re-match. With `preview: true`, returns only
   * the counts so the caller can confirm before mutating.
   */
  async cleanCollegeStudentValues(userId, { preview = false } = {}) {
    const COMPANY_MATCH = `current_company ILIKE '%thapar%'`;
    const TITLE_MATCH = `LOWER(TRIM(current_title)) = 'student'`;
    const INC_COMPANY = `incoming_data->>'company' ILIKE '%thapar%'`;
    const INC_TITLE = `LOWER(TRIM(incoming_data->>'title')) = 'student'`;

    if (preview) {
      const a = await db.query(
        `SELECT count(*) FILTER (WHERE ${COMPANY_MATCH})::int AS company,
                count(*) FILTER (WHERE ${TITLE_MATCH})::int AS title
         FROM alumni`);
      const r = await db.query(
        `SELECT count(*) FILTER (WHERE ${INC_COMPANY})::int AS company,
                count(*) FILTER (WHERE ${INC_TITLE})::int AS title
         FROM review_queue WHERE status = 'pending'`);
      return {
        alumni_company: a.rows[0].company, alumni_title: a.rows[0].title,
        review_company: r.rows[0].company, review_title: r.rows[0].title,
      };
    }

    // Clear on the alumni rows (denormalized display + matcher source).
    const co = await db.query(
      `UPDATE alumni SET current_company = '', updated_at = NOW() WHERE ${COMPANY_MATCH}`);
    const ti = await db.query(
      `UPDATE alumni SET current_title = '', updated_at = NOW() WHERE ${TITLE_MATCH}`);
    // Remove the same keys from pending-review incoming_data so cards + any
    // re-scoring no longer see the noise.
    const rco = await db.query(
      `UPDATE review_queue SET incoming_data = incoming_data - 'company'
       WHERE status = 'pending' AND ${INC_COMPANY}`);
    const rti = await db.query(
      `UPDATE review_queue SET incoming_data = incoming_data - 'title'
       WHERE status = 'pending' AND ${INC_TITLE}`);

    logger.warn({
      userId, companyCleared: co.rowCount, titleCleared: ti.rowCount,
      reviewCompanyCleared: rco.rowCount, reviewTitleCleared: rti.rowCount,
    }, 'Cleared college/student company+title noise');

    return {
      company_cleared: co.rowCount,
      title_cleared: ti.rowCount,
      review_company_cleared: rco.rowCount,
      review_title_cleared: rti.rowCount,
    };
  }

  async rematchPending(userId) {
    const pendingRes = await db.query(
      `SELECT id, incoming_data FROM review_queue WHERE status = 'pending'`
    );
    const pending = pendingRes.rows;

    let autoResolved = 0;
    let madeMulti = 0;
    let untouched = 0;

    for (const review of pending) {
      const incoming = typeof review.incoming_data === 'string'
        ? JSON.parse(review.incoming_data)
        : review.incoming_data || {};

      const fullName = (incoming.full_name || '').trim();
      const batchYear = parseInt(incoming.batch_year, 10);
      const rawBranch = (incoming.branch || '').trim();

      if (!fullName || !batchYear || !rawBranch) {
        untouched++;
        continue;
      }

      // Branch comparison must canonicalize BOTH sides — alumni rows can
      // hold "ECE", "Electronics & Communication Engineering",
      // "Electronics and Communication", etc., and a SQL string match misses
      // these. Fetch by name + batch only, then filter in JS where we can
      // run canonicalBranch() against each candidate.
      //
      // When canonicalBranch returns empty (branch isn't in our synonym map
      // — e.g. "Microbiology"), fall back to case-insensitive string equality
      // on the raw branch so the matcher still resolves same-string pairs
      // like MICROBIOLOGY ↔ Microbiology instead of leaving them pending.
      const incomingCanon = canonicalBranch(rawBranch);
      const rawBranchLower = rawBranch.toLowerCase();
      const candRes = await db.query(
        `SELECT id, branch FROM alumni
         WHERE LOWER(full_name) = LOWER($1)
           AND batch_year = $2`,
        [fullName, batchYear]
      );
      const candidateIds = candRes.rows
        .filter(r => {
          const cb = (r.branch || '').trim();
          if (incomingCanon && canonicalBranch(cb) === incomingCanon) return true;
          // Fallback for uncategorizable branches.
          if (cb && cb.toLowerCase() === rawBranchLower) return true;
          return false;
        })
        .map(r => r.id);

      if (candidateIds.length === 0) {
        untouched++;
        continue;
      }

      if (candidateIds.length === 1) {
        await db.query(
          `UPDATE review_queue
             SET status               = 'merged',
                 existing_alumni_id   = $2,
                 candidate_alumni_ids = $3::jsonb,
                 review_type          = 'fuzzy',
                 resolved_by          = $4,
                 resolved_at          = NOW(),
                 resolution_note      = 'Auto-resolved by roster rematch'
           WHERE id = $1`,
          [review.id, candidateIds[0], JSON.stringify(candidateIds), userId]
        );
        autoResolved++;
      } else {
        await db.query(
          `UPDATE review_queue
             SET review_type          = 'identity_ambiguous',
                 candidate_alumni_ids = $2::jsonb,
                 existing_alumni_id   = $3
           WHERE id = $1`,
          [review.id, JSON.stringify(candidateIds), candidateIds[0]]
        );
        madeMulti++;
      }
    }

    logger.warn({
      userId, total: pending.length, autoResolved, madeMulti, untouched,
    }, 'Pending reviews re-matched against current alumni');

    return {
      total: pending.length,
      auto_resolved: autoResolved,
      made_multi_candidate: madeMulti,
      untouched,
    };
  }

  /**
   * Get review stats.
   */
  async getStats() {
    const titlePattern = UNMERGEABLE_JOB_TITLES.join('|');
    const unmergeableSQL = `(
         (incoming_data->>'branch') ~ '^[0-9]+$'
      OR (incoming_data->>'branch') ~* '\\m(${titlePattern})\\M'
      OR (incoming_data->>'branch') IS NULL
      OR trim(incoming_data->>'branch') = ''
    )`;
    const result = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'merged') as merged,
        COUNT(*) FILTER (WHERE status = 'new') as new_records,
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending' AND review_type = 'identity_ambiguous')
          AS pending_identity_ambiguous,
        COUNT(*) FILTER (WHERE status = 'pending' AND ${unmergeableSQL})
          AS pending_unmergeable,
        COUNT(*) FILTER (WHERE status = 'pending'
          AND COALESCE(review_type, 'fuzzy') = 'fuzzy'
          AND NOT ${unmergeableSQL})
          AS pending_fuzzy
      FROM review_queue
    `);
    return result.rows[0];
  }
}

module.exports = new ReviewService();
