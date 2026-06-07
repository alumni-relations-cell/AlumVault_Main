import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

// Map matcher-incoming field names -> existing alumni column names so we
// can diff them side-by-side. `column` is the alumni table column name used
// when sending overrides back to the API.
const FIELDS = [
  { label: 'Full name',  column: 'full_name',       existing: 'existing_full_name',       incoming: 'full_name',    type: 'text' },
  { label: 'Batch year', column: 'batch_year',      existing: 'existing_batch_year',      incoming: 'batch_year',   type: 'number' },
  { label: 'Branch',     column: 'branch',          existing: 'existing_branch',          incoming: 'branch',       type: 'text' },
  { label: 'Degree',     column: 'degree',          existing: 'existing_degree',          incoming: 'degree',       type: 'text' },
  { label: 'Company',    column: 'current_company', existing: 'existing_current_company', incoming: 'company',      type: 'text' },
  { label: 'Title',      column: 'current_title',   existing: 'existing_current_title',   incoming: 'title',        type: 'text' },
  { label: 'City',       column: 'current_city',    existing: 'existing_current_city',    incoming: 'city',         type: 'text' },
  { label: 'LinkedIn',   column: 'linkedin_url',    existing: 'existing_linkedin_url',    incoming: 'linkedin_url', type: 'text' },
];

function normalize(v) {
  if (v == null) return '';
  return String(v).trim().toLowerCase();
}

// Minimal mirror of backend's canonicalBranch + canonicalDegree so the diff
// view doesn't show "differs" when two values reduce to the same canonical.
// Keep in lockstep with backend/src/services/review.service.js — when adding
// synonyms there, mirror them here.
const BRANCH_SYNONYMS_UI = {
  'cse': 'CSE', 'cs': 'CSE', 'computer science': 'CSE',
  'computer science and': 'CSE', 'comp sci': 'CSE', 'comp science': 'CSE',
  'computer': 'CSE', 'coe': 'CSE',
  'software': 'CSE', 'se': 'CSE',
  'software engg': 'CSE', 'computer software': 'CSE',
  'ece': 'ECE', 'ec': 'ECE', 'enc': 'ECE',
  'electronics and communication': 'ECE',
  'electronics and communications': 'ECE',
  'electronics communication': 'ECE', 'electronics': 'ECE',
  'eic': 'EIC', 'electronics instrumentation': 'EIC',
  'electronics and instrumentation': 'EIC',
  'instrumentation and control': 'EIC',
  'electronics instrumentation and control': 'EIC',
  'ee': 'EE', 'eee': 'EE', 'electrical': 'EE',
  'me': 'ME', 'mech': 'ME', 'mechanical': 'ME',
  'cad cam': 'ME', 'cad cam and robotics': 'ME', 'cad cam robotics': 'ME',
  'che': 'CHE', 'chem': 'CHE', 'chemical': 'CHE',
  'ce': 'CIVIL', 'civil': 'CIVIL',
  'bt': 'BIO', 'bio': 'BIO', 'biotech': 'BIO', 'biotechnology': 'BIO',
  'it': 'IT', 'information technology': 'IT',
  'mba': 'MBA', 'mca': 'MCA', 'bba': 'BBA', 'bca': 'BCA',
  'master of computer applications': 'MCA',
  'computer applications': 'MCA', 'computer application': 'MCA',
  'master of business administration': 'MBA',
  'thermal': 'THERMAL', 'thr': 'THERMAL',
  'vlsi': 'VLSI', 'vlsi design': 'VLSI', 'vlsi design and cad': 'VLSI',
  'vlsi and cad': 'VLSI',
  'microbiology': 'MICRO', 'mbio': 'MICRO',
  'biochemistry': 'BIOCHEM', 'bio chemistry': 'BIOCHEM',
};
function uiCanonicalBranch(raw) {
  if (!raw) return '';
  let key = String(raw).toLowerCase()
    .replace(/[&]/g, ' and ')
    .replace(/[.,\-/_()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  key = key.replace(/\s+(engineering|engg|engr)$/, '').trim();
  return BRANCH_SYNONYMS_UI[key] || '';
}
function uiCanonicalDegree(raw) {
  if (!raw) return '';
  const k = String(raw).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) return '';
  if (k === 'BE' || k === 'BTECH' || k === 'BENGG'
      || k.startsWith('BACHELOROFENGINEERING')
      || k.startsWith('BACHELOROFTECHNOLOGY')) return 'BE';
  if (k === 'ME' || k === 'MTECH' || k === 'MENGG'
      || k.startsWith('MASTEROFENGINEERING')
      || k.startsWith('MASTEROFTECHNOLOGY')) return 'ME';
  if (k === 'MBA' || k.startsWith('MASTEROFBUSINESS')) return 'MBA';
  if (k === 'MCA' || k.startsWith('MASTEROFCOMPUTER')) return 'MCA';
  if (k === 'BBA' || k.startsWith('BACHELOROFBUSINESS')) return 'BBA';
  if (k === 'BCA' || k.startsWith('BACHELOROFCOMPUTERAPPLICATIONS')) return 'BCA';
  if (k === 'BSC' || k.startsWith('BACHELOROFSCIENCE')) return 'BSc';
  if (k === 'MSC' || k.startsWith('MASTEROFSCIENCE')) return 'MSc';
  if (k === 'BPHARM' || k.startsWith('BACHELOROFPHARMACY')) return 'BPharm';
  if (k === 'MPHARM' || k.startsWith('MASTEROFPHARMACY')) return 'MPharm';
  if (k.includes('PHD') || k.includes('DOCTOR')) return 'PhD';
  return '';
}
// Field-aware equality: branch and degree compare canonicals first, fall
// back to plain normalize() for everything else.
function fieldsEquivalent(column, a, b) {
  if (column === 'branch') {
    const ca = uiCanonicalBranch(a), cb = uiCanonicalBranch(b);
    if (ca && cb) return ca === cb;
  } else if (column === 'degree') {
    const ca = uiCanonicalDegree(a), cb = uiCanonicalDegree(b);
    if (ca && cb) return ca === cb;
  }
  return normalize(a) === normalize(b);
}

function scoreClass(score) {
  if (score >= 70) return 'badge-red';     // very likely dup
  if (score >= 55) return 'badge-yellow';  // probable dup
  return 'badge-blue';                     // weak signal
}

// Pick a sensible default "Final" value when the diff first loads.
// Prefer incoming if it has new info; otherwise keep existing.
function defaultFinal(existing, incoming) {
  const e = existing == null ? '' : String(existing);
  const i = incoming == null ? '' : String(incoming);
  if (!e && i) return i;
  if (e && !i) return e;
  if (!e && !i) return '';
  return normalize(e) === normalize(i) ? e : i;
}

// Map an alumni row (the shape returned by `getById` for each candidate) onto
// the same `existing_*` keys the 1-vs-1 view expects. Lets us reuse the diff
// table whether the source is `existing_alumni_id` (single) or one of N
// candidates picked from candidate_alumni_ids.
function candidateToExisting(c) {
  if (!c) return {};
  return {
    existing_full_name:       c.full_name,
    existing_batch_year:      c.batch_year,
    existing_branch:          c.branch,
    existing_degree:          c.degree,
    existing_current_company: c.current_company,
    existing_current_title:   c.current_title,
    existing_current_city:    c.current_city,
    existing_linkedin_url:    c.linkedin_url,
    existing_enrollment_no:   c.enrollment_no,
    existing_emails:          c.emails,
    existing_phones:          c.phones,
  };
}

function ReviewDetail({ review, onResolved, onCancel }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resolution, setResolution] = useState('merged');
  const [note, setNote] = useState('');
  const [overrides, setOverrides] = useState({});
  // Picked candidate row for multi-candidate (identity_ambiguous) reviews.
  // null = "none of these, create new"; a UUID = merge into that candidate.
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    apiFetch(`/review/${review.id}`)
      .then(d => {
        if (cancelled) return;
        setDetail(d);
        // For multi-candidate reviews, pre-select the first candidate so the
        // diff table renders something useful immediately.
        const cands = Array.isArray(d.candidates) ? d.candidates : [];
        if (cands.length > 1) {
          setSelectedCandidateId(cands[0].id);
        }
        // Seed overrides — for multi-candidate, seed against the first
        // candidate; for 1-vs-1, use existing_* fields directly.
        const inc = typeof d.incoming_data === 'string'
          ? JSON.parse(d.incoming_data) : d.incoming_data || {};
        const baseExisting = cands.length > 1 ? candidateToExisting(cands[0]) : d;
        const seed = {};
        for (const f of FIELDS) {
          seed[f.column] = defaultFinal(baseExisting[f.existing], inc[f.incoming]);
        }
        setOverrides(seed);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [review.id]);

  // When the reviewer picks a different candidate in multi-candidate mode,
  // re-seed the "Final" column against that candidate's values so the diff
  // makes sense for the new comparison target.
  useEffect(() => {
    if (!detail || !selectedCandidateId) return;
    const cands = Array.isArray(detail.candidates) ? detail.candidates : [];
    if (cands.length < 2) return;
    const picked = cands.find(c => c.id === selectedCandidateId);
    if (!picked) return;
    const inc = typeof detail.incoming_data === 'string'
      ? JSON.parse(detail.incoming_data) : detail.incoming_data || {};
    const baseExisting = candidateToExisting(picked);
    const seed = {};
    for (const f of FIELDS) {
      seed[f.column] = defaultFinal(baseExisting[f.existing], inc[f.incoming]);
    }
    setOverrides(seed);
  }, [selectedCandidateId, detail]);

  const submit = async () => {
    setSubmitting(true); setError('');
    try {
      // Strip empty strings so a blank field means "don't touch" rather than
      // "clear it" — except when the reviewer explicitly typed an empty value.
      const payloadOverrides = {};
      for (const f of FIELDS) {
        const v = overrides[f.column];
        if (v === undefined || v === null) continue;
        if (f.type === 'number') {
          if (v === '') continue;
          const n = parseInt(v, 10);
          if (!Number.isNaN(n)) payloadOverrides[f.column] = n;
        } else {
          payloadOverrides[f.column] = v;
        }
      }
      await apiFetch(`/review/${review.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          resolution,
          note: note || undefined,
          overrides: payloadOverrides,
          // selected_alumni_id is only meaningful for multi-candidate (identity-
          // ambiguous) reviews; backend ignores it for 1-vs-1.
          selected_alumni_id: selectedCandidateId || undefined,
        }),
      });
      onResolved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="card">Loading review…</div>;
  if (error)   return <div className="card"><div className="error">{error}</div></div>;
  if (!detail) return null;

  const incoming = typeof detail.incoming_data === 'string'
    ? JSON.parse(detail.incoming_data) : detail.incoming_data || {};
  const breakdown = typeof detail.score_breakdown === 'string'
    ? JSON.parse(detail.score_breakdown) : detail.score_breakdown || {};

  const score = Math.round(detail.match_score || 0);
  const candidates = Array.isArray(detail.candidates) ? detail.candidates : [];
  const isMultiCandidate = candidates.length > 1
    || detail.review_type === 'identity_ambiguous';

  // For multi-candidate reviews, the picked candidate becomes the "existing"
  // side of the diff. For 1-vs-1, the existing_* fields on `detail` are used
  // directly (legacy fuzzy path).
  const pickedCandidate = isMultiCandidate
    ? candidates.find(c => c.id === selectedCandidateId)
    : null;
  const existingSource = pickedCandidate ? candidateToExisting(pickedCandidate) : detail;

  // Existing contact summary (emails/phones are JSONB arrays of {value, type, ...})
  const existingEmailsRaw = existingSource.existing_emails;
  const existingPhonesRaw = existingSource.existing_phones;
  const existingEmails = Array.isArray(existingEmailsRaw)
    ? existingEmailsRaw.map(e => e?.value).filter(Boolean) : [];
  const existingPhones = Array.isArray(existingPhonesRaw)
    ? existingPhonesRaw.map(p => p?.value).filter(Boolean) : [];

  return (
    <div className="card" style={{ borderLeft: '4px solid #6c63ff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>
            Possible duplicate — match score{' '}
            <span className={`badge ${scoreClass(score)}`} style={{ fontSize: '0.85rem' }}>{score}</span>
          </h2>
          <div style={{ fontSize: '0.78rem', color: '#888' }}>
            Review id <code>{detail.id?.substring(0, 8)}</code> · created {new Date(detail.created_at).toLocaleString()}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Close</button>
      </div>

      {/* Multi-candidate picker: the matcher found 2+ alumni with the same
          (name, batch, branch) as the incoming row. The reviewer must pick
          which one is the same person before merging. */}
      {isMultiCandidate && (
        <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#fffaf0', border: '1px solid #f0c674', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
            {candidates.length} candidates share this name + batch + branch
          </div>
          <div style={{ fontSize: '0.78rem', color: '#7a5a00', marginBottom: '0.5rem' }}>
            The roster says these are different people. Pick the one the incoming row matches,
            or choose <em>None of these — create new</em> if it's yet another person.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
            {candidates.map(c => {
              const picked = selectedCandidateId === c.id;
              return (
                <label
                  key={c.id}
                  style={{
                    border: `1px solid ${picked ? '#6c63ff' : '#e0c97a'}`,
                    background: picked ? '#f3f1ff' : '#fffdf6',
                    borderRadius: 6, padding: '0.5rem 0.6rem', cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio" name="candidate"
                    checked={picked}
                    onChange={() => setSelectedCandidateId(c.id)}
                    style={{ width: 'auto', marginRight: 6 }}
                  />
                  <strong>{c.full_name || '(unnamed)'}</strong>
                  <div style={{ fontSize: '0.72rem', color: '#666', marginTop: 2 }}>
                    {c.enrollment_no && <div>Enrollment: <code>{c.enrollment_no}</code></div>}
                    {[c.batch_year, c.branch].filter(Boolean).join(' · ')}
                    {c.current_company && <div>{c.current_company}</div>}
                    {c.current_city && <div style={{ color: '#888' }}>{c.current_city}</div>}
                  </div>
                </label>
              );
            })}
            <label
              style={{
                border: `1px solid ${selectedCandidateId === null ? '#6c63ff' : '#e0c97a'}`,
                background: selectedCandidateId === null ? '#f3f1ff' : '#fffdf6',
                borderRadius: 6, padding: '0.5rem 0.6rem', cursor: 'pointer',
              }}
            >
              <input
                type="radio" name="candidate"
                checked={selectedCandidateId === null}
                onChange={() => setSelectedCandidateId(null)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              <strong>None of these</strong>
              <div style={{ fontSize: '0.72rem', color: '#666', marginTop: 2 }}>
                Create a new alumnus instead (the incoming row is yet another person not in the roster).
              </div>
            </label>
          </div>
          {selectedCandidateId === null && resolution === 'merged' && (
            <div style={{ fontSize: '0.78rem', color: '#a05a00', marginTop: '0.5rem' }}>
              <strong>Heads up:</strong> with no candidate picked, "Merge" can't proceed —
              switch to <em>Keep separate</em> below.
            </div>
          )}
        </div>
      )}

      {/* Score breakdown */}
      {Object.keys(breakdown).length > 0 && (
        <details style={{ marginBottom: '0.75rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#555' }}>
            Why this score?
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {Object.entries(breakdown).map(([k, v]) => (
              <span key={k} className="badge badge-gray" style={{ fontFamily: 'monospace' }}>
                {k}: {typeof v === 'number' ? v.toFixed(1) : String(v)}
              </span>
            ))}
          </div>
        </details>
      )}

      {/* Side-by-side diff with editable "Final" column */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ marginBottom: '0.5rem' }}>
          <thead>
            <tr>
              <th style={{ width: '14%' }}>Field</th>
              <th style={{ width: '24%' }}>Existing</th>
              <th style={{ width: '24%' }}>Incoming</th>
              <th>Final (will be written)</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map(f => {
              const ex  = existingSource[f.existing];
              const inc = incoming[f.incoming];
              const exStr  = ex  == null ? '' : String(ex);
              const incStr = inc == null ? '' : String(inc);
              const exDisplay  = exStr  !== '' ? exStr  : <em style={{ color: '#aaa' }}>—</em>;
              const incDisplay = incStr !== '' ? incStr : <em style={{ color: '#aaa' }}>—</em>;
              // For branch/degree, use canonical equality — so
              // "Computer Science & Engineering" vs "COMPUTER ENGINEERING"
              // (both → CSE) and "BE" vs "B.Tech." (both → BE) no longer
              // light up as "differs".
              const equivalent = fieldsEquivalent(f.column, ex, inc);
              const conflict     = exStr && incStr && !equivalent;
              const canonMatched = exStr && incStr && !conflict && normalize(ex) !== normalize(inc);
              const incomingOnly = !exStr && incStr;
              const rowBg = conflict ? '#fff7e6'
                          : canonMatched ? '#eaf7ec'
                          : incomingOnly ? '#eaf5ff'
                          : 'transparent';
              const finalVal = overrides[f.column] ?? '';
              const setFinal = (v) => setOverrides(o => ({ ...o, [f.column]: v }));
              return (
                <tr key={f.label} style={{ background: rowBg }}>
                  <td style={{ fontWeight: 600, color: '#555' }}>{f.label}</td>
                  <td>
                    <div>{exDisplay}</div>
                    {exStr !== '' && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: 4, fontSize: '0.7rem', padding: '2px 6px' }}
                        onClick={() => setFinal(exStr)}
                        disabled={normalize(finalVal) === normalize(exStr)}
                      >Use this</button>
                    )}
                  </td>
                  <td>
                    <div>
                      {incDisplay}
                      {conflict && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>differs</span>}
                      {canonMatched && (
                        <span
                          className="badge badge-green"
                          style={{ marginLeft: 6 }}
                          title={`Different spelling but canonical-equivalent (${
                            f.column === 'branch' ? uiCanonicalBranch(ex) : uiCanonicalDegree(ex)
                          }) — safe to merge.`}
                        >
                          same · {f.column === 'branch' ? uiCanonicalBranch(ex) : uiCanonicalDegree(ex)}
                        </span>
                      )}
                      {incomingOnly && <span className="badge badge-blue" style={{ marginLeft: 6 }}>new</span>}
                    </div>
                    {incStr !== '' && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: 4, fontSize: '0.7rem', padding: '2px 6px' }}
                        onClick={() => setFinal(incStr)}
                        disabled={normalize(finalVal) === normalize(incStr)}
                      >Use this</button>
                    )}
                  </td>
                  <td>
                    <input
                      type={f.type}
                      value={finalVal}
                      onChange={e => setFinal(e.target.value)}
                      placeholder="—"
                      style={{ marginBottom: 0 }}
                    />
                  </td>
                </tr>
              );
            })}
            {/* Email / phone aren't editable here — they live in JSONB arrays
                with smtp_status etc. that the verifier maintains. */}
            <tr>
              <td style={{ fontWeight: 600, color: '#555' }}>Email</td>
              <td>{existingEmails.length > 0 ? existingEmails.join(', ') : <em style={{ color: '#aaa' }}>—</em>}</td>
              <td>{incoming.email || <em style={{ color: '#aaa' }}>—</em>}</td>
              <td style={{ fontSize: '0.75rem', color: '#888' }}>
                Managed by the verifier — edit on the alumni detail page.
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600, color: '#555' }}>Phone</td>
              <td>{existingPhones.length > 0 ? existingPhones.join(', ') : <em style={{ color: '#aaa' }}>—</em>}</td>
              <td>{incoming.phone || <em style={{ color: '#aaa' }}>—</em>}</td>
              <td style={{ fontSize: '0.75rem', color: '#888' }}>
                Managed by the verifier — edit on the alumni detail page.
              </td>
            </tr>
          </tbody>
        </table>
        {resolution === 'skipped' && (
          <p style={{ fontSize: '0.78rem', color: '#888', marginBottom: '0.75rem' }}>
            Skip with edits also works — any value you change above will be applied to the <strong>existing</strong> alumnus,
            then the incoming row will be discarded.
          </p>
        )}
      </div>

      {/* Action picker */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ marginBottom: '0.5rem', fontWeight: 600 }}>What should we do?</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
          {[
            { v: 'merged',  title: 'Merge',         desc: 'Same person. Update the existing alumnus with the Final column above.' },
            { v: 'new',     title: 'Keep separate', desc: 'Different people. Create a new alumni record from the Final column.' },
            { v: 'skipped', title: 'Skip',          desc: 'Incoming row is junk. Any Final edits still apply to the existing alumnus.' },
          ].map(opt => (
            <label
              key={opt.v}
              style={{
                border: `1px solid ${resolution === opt.v ? '#6c63ff' : '#e0e0e0'}`,
                background: resolution === opt.v ? '#f3f1ff' : '#fff',
                borderRadius: 6, padding: '0.6rem 0.75rem', cursor: 'pointer', display: 'block',
              }}
            >
              <input
                type="radio" name="resolution" value={opt.v}
                checked={resolution === opt.v}
                onChange={() => setResolution(opt.v)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              <strong>{opt.title}</strong>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: 2 }}>{opt.desc}</div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label>Note (optional)</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="Why did you make this call? (visible in audit log)"
        />
      </div>

      {error && <div className="error">{error}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onCancel} disabled={submitting}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={
            submitting ||
            (resolution === 'merged' && isMultiCandidate && !selectedCandidateId)
          }
        >
          {submitting ? 'Submitting…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}

export default function Review() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  // 'all' | 'fuzzy' | 'identity_ambiguous' | 'unmergeable'
  const [category, setCategory] = useState('all');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterBatch,  setFilterBatch]  = useState('');
  // Populates the filter dropdowns with values that actually exist in the
  // alumni table. Fetched once on mount.
  const [filterOpts, setFilterOpts] = useState({ batch_years: [], branches: [] });
  useEffect(() => {
    apiFetch('/alumni/filter-options')
      .then(d => setFilterOpts({
        batch_years: d.batch_years || [],
        branches: d.branches || [],
      }))
      .catch(() => {});
  }, []);

  const load = useCallback(async (q, cat, branch, batchYear) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: '50', category: cat });
      if (q && q.trim()) params.set('q', q.trim());
      if (branch && branch.trim()) params.set('branch', branch.trim());
      if (batchYear) params.set('batch_year', String(batchYear));
      const [list, s] = await Promise.all([
        apiFetch(`/review?${params.toString()}`),
        apiFetch('/review/stats').catch(() => null),
      ]);
      setItems(list.data || []);
      setTotal(list.total || 0);
      if (s) setStats(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { load('', category, '', ''); }, [load]); // eslint-disable-line

  // Debounced reload when any filter changes
  useEffect(() => {
    const t = setTimeout(() => load(query, category, filterBranch, filterBatch), 350);
    return () => clearTimeout(t);
  }, [query, category, filterBranch, filterBatch, load]);

  const onResolved = () => {
    setMsg('Resolved');
    setSelected(null);
    load(query);
    setTimeout(() => setMsg(''), 2500);
  };

  // Interactive rematch state.
  //   'idle'      no modal open
  //   'scanning'  POST /review/rematch/scan in flight
  //   'doubts'    walking the operator through doubts one-by-one
  //   'deciding'  POST /review/rematch/decide-batch in flight
  //   'done'      all doubts processed — modal shows summary
  const [rematchStep, setRematchStep] = useState('idle');
  const [scan, setScan] = useState(null);
  const [doubtIdx, setDoubtIdx] = useState(0);
  // 3-decision buffer. Each Same/Different click appends; once length === 3
  // (or the user reaches the last doubt / hits Finish) the batch is sent to
  // /decide-batch, persisted, applied, and the buffer is cleared. Undo pops
  // the most recent unsent entry.
  const [buffer, setBuffer] = useState([]);
  const [resolvedDecisions, setResolvedDecisions] = useState([]);
  const [modalTab, setModalTab] = useState('decide'); // 'decide' | 'solved'
  // Running totals across all committed batches.
  const [progress, setProgress] = useState({
    auto_resolved: 0,
    made_multi_candidate: 0,
    branch_rows_rewritten: 0,
    degree_rows_rewritten: 0,
    remaining_pending: 0,
    initial_pending: 0,
  });
  // 'impact' (highest count first), 'low_impact' (rarest first — useful to
  // sweep up the long tail at the end), 'alphabetical' (a-z by pair).
  const [doubtSort, setDoubtSort] = useState('impact');

  const allDoubts = (() => {
    if (!scan) return [];
    const combined = [...scan.branch_doubts, ...scan.degree_doubts];
    if (doubtSort === 'impact') return combined.sort((a, b) => b.count - a.count);
    if (doubtSort === 'low_impact') return combined.sort((a, b) => a.count - b.count);
    if (doubtSort === 'alphabetical') {
      return combined.sort((a, b) => {
        const ak = `${a.field}|${a.a}|${a.b}`.toLowerCase();
        const bk = `${b.field}|${b.a}|${b.b}`.toLowerCase();
        return ak.localeCompare(bk);
      });
    }
    return combined;
  })();

  const openRematch = async () => {
    setRematchStep('scanning');
    setScan(null);
    setDoubtIdx(0);
    setBuffer([]);
    setModalTab('decide');
    setProgress({
      auto_resolved: 0, made_multi_candidate: 0,
      branch_rows_rewritten: 0, degree_rows_rewritten: 0,
      remaining_pending: 0, initial_pending: 0,
    });
    try {
      const data = await apiFetch('/review/rematch/scan', { method: 'POST' });
      setScan(data);
      // Auto-decides happen inside the scan call and already updated the DB.
      // Seed the running totals so the progress bar reflects that work.
      const aa = data.auto_applied || {};
      setProgress(p => ({
        ...p,
        remaining_pending: aa.remaining_pending ?? data.total_pending,
        initial_pending:   data.total_pending,
        auto_resolved:     aa.auto_resolved || 0,
        made_multi_candidate: aa.made_multi_candidate || 0,
        branch_rows_rewritten: aa.branch_rows_rewritten || 0,
        degree_rows_rewritten: aa.degree_rows_rewritten || 0,
      }));
      apiFetch('/review/rematch/resolved')
        .then(r => setResolvedDecisions(r.data || []))
        .catch(() => {});
      const hasDoubts = (data.branch_doubts.length + data.degree_doubts.length) > 0;
      setRematchStep(hasDoubts ? 'doubts' : 'done');
      if (!hasDoubts) await load(query, category, filterBranch, filterBatch);
    } catch (e) {
      setError(e.message);
      setRematchStep('idle');
    }
  };

  // Send the current buffer of decisions to the backend, update progress
  // from the deltas, append to the local resolved-list view, and clear the
  // buffer. No-op if the buffer is empty.
  const flushBuffer = async (currentBuffer) => {
    const decisions = currentBuffer ?? buffer;
    if (decisions.length === 0) return;
    setRematchStep('deciding');
    try {
      const res = await apiFetch('/review/rematch/decide-batch', {
        method: 'POST',
        body: JSON.stringify({ decisions }),
      });
      setProgress(p => ({
        ...p,
        auto_resolved:         p.auto_resolved + (res.auto_resolved || 0),
        made_multi_candidate:  p.made_multi_candidate + (res.made_multi_candidate || 0),
        branch_rows_rewritten: p.branch_rows_rewritten + (res.branch_rows_rewritten || 0),
        degree_rows_rewritten: p.degree_rows_rewritten + (res.degree_rows_rewritten || 0),
        remaining_pending:     res.remaining_pending ?? p.remaining_pending,
      }));
      // Optimistically add to the solved list (newest first).
      setResolvedDecisions(prev => [
        ...decisions.map(d => ({
          field: d.field, value_a: d.a, value_b: d.b,
          decision: d.same ? 'same' : 'different',
          preferred: d.preferred || null,
          decided_at: new Date().toISOString(),
        })),
        ...prev,
      ]);
      setBuffer([]);
    } catch (e) {
      setError(e.message);
    }
  };

  const advanceOrFinish = (nextBuffer) => {
    if (doubtIdx + 1 < allDoubts.length) {
      setDoubtIdx(i => i + 1);
      setRematchStep('doubts');
    } else {
      // Last doubt — flush whatever's left in the buffer, then end.
      if ((nextBuffer ?? buffer).length > 0) {
        flushBuffer(nextBuffer ?? buffer).then(() => setRematchStep('done'));
      } else {
        setRematchStep('done');
      }
      load(query, category, filterBranch, filterBatch);
    }
  };

  const decideDoubt = (doubt, choice, preferred) => {
    if (choice === 'skip') {
      advanceOrFinish();
      return;
    }
    const entry = {
      field: doubt.field, a: doubt.a, b: doubt.b,
      same: choice === 'same',
      preferred: choice === 'same' ? (preferred || null) : null,
    };
    const next = [...buffer, entry];
    setBuffer(next);

    if (next.length >= 3) {
      // Hit commit point — flush, then advance.
      flushBuffer(next).then(() => advanceOrFinish([]));
    } else {
      advanceOrFinish(next);
    }
  };

  const skipDoubt = () => decideDoubt(allDoubts[doubtIdx], 'skip');

  // Undo pulls the most recent entry off the buffer, rewinds the doubt
  // index by one, and tells the backend to forget the persisted row that
  // would have been written (only if it was actually persisted — which
  // for the buffered model is only after the batch commit). Buffered but
  // not-yet-committed decisions only live in local state, so undo there
  // is purely a local pop.
  const undoDecision = async () => {
    if (buffer.length === 0) return;
    const popped = buffer[buffer.length - 1];
    setBuffer(buffer.slice(0, -1));
    setDoubtIdx(i => Math.max(0, i - 1));
    // Pre-commit entries were never persisted, so no backend forget call.
    // Kept structured here so the wiring is obvious when we extend undo
    // to apply to *committed* decisions later.
    void popped;
  };

  const closeRematch = async () => {
    // If the operator closes mid-buffer, flush so nothing is lost.
    if (buffer.length > 0) await flushBuffer(buffer);
    setRematchStep('idle');
    setScan(null);
    setDoubtIdx(0);
    setBuffer([]);
  };

  // Bulk cleanup runner — chained normalize → dedupe → rematch, with the
  // user confirming once. Each step's result is shown sequentially in the
  // success banner. This is the "clear the backlog" button.
  const [bulkRunning, setBulkRunning] = useState(false);
  const [contactRunning, setContactRunning] = useState(false);
  const [separateRunning, setSeparateRunning] = useState(false);
  const [junkRunning, setJunkRunning] = useState(false);
  const [bdSepRunning, setBdSepRunning] = useState(false);

  const runSeparateByBranchDegree = async () => {
    if (!confirm(
      'Auto-separate pending reviews where the canonical branch AND the canonical degree both differ between incoming and existing?\n\n' +
      'Example: existing is "Chemical Engineering · MSc", incoming is "Computer Science · PhD" → definitely different people.\n\n' +
      'Each such review is resolved as "new" — the incoming row becomes its own alumnus.'
    )) return;
    setBdSepRunning(true); setError(''); setMsg('');
    try {
      let totalSep = 0, totalSkipped = 0, totalErr = 0, calls = 0;
      for (;;) {
        const res = await apiFetch('/review/bulk/separate-by-branch-degree', {
          method: 'POST',
          body: JSON.stringify({ batch_size: 500 }),
        });
        totalSep += res.separated || 0;
        totalSkipped += res.skipped || 0;
        totalErr += res.errored || 0;
        calls++;
        setMsg(
          `Separating by different branch+degree: ${totalSep} separated, ${totalSkipped} skipped` +
          ` · ${res.remaining ?? 0} reviews left to scan…`
        );
        if (!res.processed || res.processed === 0) break;
        if (res.remaining === 0) break;
        if (calls > 200) break;
      }
      setMsg(`Branch+degree separation complete: ${totalSep} reviews resolved as 'new' (different canonical branch AND degree).`);
      await load(query, category, filterBranch, filterBatch);
    } catch (e) {
      setError(e.message);
    } finally {
      setBdSepRunning(false);
    }
  };

  // Loops the resolve-unmergeable endpoint until none remain. Marks every
  // pending review with a junk branch (year-only, job title, empty) as
  // 'skipped' with an audit note. Clears the noise tab and lets the
  // subsequent bulk-merge buttons actually act on real candidates.
  const runJunkSkip = async () => {
    if (!confirm(
      'Clear junk branch values from pending reviews?\n\n' +
      'For every pending review whose incoming branch is a year ("2018"), a job title ("Lecturer", "Manager", ...), or other noise:\n' +
      '  • The garbage branch value is wiped (set to empty string)\n' +
      '  • The review STAYS pending so the bulk-merge buttons (contact / LinkedIn) can decide using email/phone/linkedin signals\n' +
      '  • Year-only values in alumni.branch are also NULLed\n\n' +
      'Also restores any reviews that were wrongly marked "skipped" by the previous version of this button.'
    )) return;
    setJunkRunning(true); setError(''); setMsg('');
    try {
      let totalCleared = 0, totalRestored = 0, totalAlumniCleaned = 0, calls = 0;
      for (;;) {
        const res = await apiFetch('/review/bulk/resolve-unmergeable', {
          method: 'POST',
          body: JSON.stringify({ batch_size: 1000 }),
        });
        totalCleared += res.cleared || 0;
        if (totalRestored === 0) totalRestored = res.restored || 0;
        if (totalAlumniCleaned === 0) totalAlumniCleaned = res.alumni_branches_nulled || 0;
        calls++;
        setMsg(
          `Clearing junk branches: ${totalCleared} cleared` +
          (totalRestored > 0 ? `, ${totalRestored} restored from prior skip` : '') +
          ` · ${res.remaining ?? 0} left…`
        );
        if (!res.processed || res.processed === 0) break;
        if (res.remaining === 0) break;
        if (calls > 200) break;
      }
      setMsg(
        `Junk-branch cleanup complete: ` +
        `${totalCleared} review branches cleared` +
        (totalRestored > 0 ? `, ${totalRestored} reviews restored from earlier wrong skip` : '') +
        (totalAlumniCleaned > 0 ? `, ${totalAlumniCleaned} year-only alumni branches NULLed` : '') +
        '. Now click Merge by shared contact / Separate by LinkedIn / Run bulk cleanup to let those reviews resolve.'
      );
      await load(query, category, filterBranch, filterBatch);
    } catch (e) {
      setError(e.message);
    } finally {
      setJunkRunning(false);
    }
  };

  // Loops the separate-by-linkedin endpoint until none remain. Same pattern
  // as the contact merge — batches of 500, accumulates the totals.
  const runSeparateByLinkedin = async () => {
    if (!confirm(
      'Auto-separate every pending review where the incoming row AND the existing alumnus both have a LinkedIn URL, AND those URLs are different?\n\n' +
      'Different LinkedIn URLs is a near-definitive "two different people" signal. Each such review is resolved as "new" — the incoming row becomes its own alumnus, both records persist.\n\n' +
      'This is destructive (creates new alumni rows) but it is what a human reviewer would do.'
    )) return;
    setSeparateRunning(true); setError(''); setMsg('');
    try {
      let totalSep = 0, totalSkipped = 0, totalErr = 0, calls = 0;
      for (;;) {
        const res = await apiFetch('/review/bulk/separate-by-linkedin', {
          method: 'POST',
          body: JSON.stringify({ batch_size: 500 }),
        });
        totalSep += res.separated || 0;
        totalSkipped += res.skipped || 0;
        totalErr += res.errored || 0;
        calls++;
        setMsg(
          `Separating by LinkedIn diff: ${totalSep} separated, ${totalSkipped} skipped, ${totalErr} errored` +
          ` · ${res.remaining ?? 0} reviews left to scan…`
        );
        if (!res.processed || res.processed === 0) break;
        if (res.remaining === 0) break;
        if (calls > 200) break;
      }
      setMsg(`LinkedIn-based separation complete: ${totalSep} reviews resolved as 'new' (different people).`);
      await load(query, category, filterBranch, filterBatch);
    } catch (e) {
      setError(e.message);
    } finally {
      setSeparateRunning(false);
    }
  };

  // Loops the resolve-by-contact endpoint until the backend reports 0
  // remaining. Each call processes 500 reviews and returns in a few
  // seconds so the proxy never times out.
  const runContactMerge = async () => {
    if (!confirm(
      'Auto-merge every pending review where the incoming row and the existing alumnus share an email or phone number?\n\n' +
      'Shared contact info is treated as a definitive identity match — the review is resolved as "merged" with note "Auto-merged by shared email/phone".\n\n' +
      'This processes the queue in batches of 500 and may take a few minutes for a large queue.'
    )) return;
    setContactRunning(true); setError(''); setMsg('');
    try {
      let totalMerged = 0, totalSkipped = 0, calls = 0;
      for (;;) {
        const res = await apiFetch('/review/bulk/resolve-by-contact', {
          method: 'POST',
          body: JSON.stringify({ batch_size: 500 }),
        });
        totalMerged += res.merged || 0;
        totalSkipped += res.skipped || 0;
        calls++;
        setMsg(
          `Merging by shared contact: ${totalMerged} merged, ${totalSkipped} no-match` +
          ` · ${res.remaining ?? 0} reviews left to scan…`
        );
        if (!res.processed || res.processed === 0) break;
        if (res.remaining === 0) break;
        if (calls > 200) break; // safety: 200 × 500 = 100k reviews
      }
      setMsg(`Contact-based merge complete: ${totalMerged} reviews auto-merged by shared email or phone (${totalSkipped} had no usable contact match).`);
      await load(query, category, filterBranch, filterBatch);
    } catch (e) {
      setError(e.message);
    } finally {
      setContactRunning(false);
    }
  };

  const runBulkCleanup = async () => {
    if (!confirm(
      'Bulk cleanup will:\n\n' +
      '  1. Normalize every alumnus branch + degree to canonical form\n' +
      '  2. Dedupe alumni rows that share (name, batch_year, branch)\n' +
      '  3. Re-run the matcher against pending reviews\n\n' +
      'This can rewrite tens of thousands of rows and may take a few minutes. ' +
      'It cannot be undone. Proceed?'
    )) return;
    setBulkRunning(true); setError(''); setMsg('');
    try {
      setMsg('Step 1/3: normalizing branch + degree values…');
      const norm = await apiFetch('/alumni/bulk/normalize', { method: 'POST' });
      setMsg(
        `Step 1/3 done: rewrote ${norm.branch_rewrites} branches and ${norm.degree_rewrites} degrees. ` +
        `Starting step 2/3: deduping alumni clusters…`
      );

      // Dedupe loops one batch at a time so each request finishes well under
      // the 30s proxy window. Stop when the backend reports 0 remaining.
      let totalDedupClusters = 0, totalDedupDeleted = 0, totalDedupRepointed = 0;
      let safety = 0;
      for (;;) {
        const dedupe = await apiFetch('/alumni/bulk/dedupe', { method: 'POST' });
        totalDedupClusters += dedupe.clusters_processed || 0;
        totalDedupDeleted += dedupe.rows_deleted || 0;
        totalDedupRepointed += dedupe.reviews_repointed || 0;
        setMsg(
          `Step 2/3 running: ${totalDedupClusters} clusters collapsed, ${totalDedupDeleted} rows deleted` +
          ` · ${dedupe.remaining_clusters ?? 0} clusters left…`
        );
        if (!dedupe.remaining_clusters || dedupe.remaining_clusters === 0) break;
        if (++safety > 5000) break; // 5k batches × 50 = 250k clusters safety cap
        if (!dedupe.clusters_processed) break; // no progress — bail
      }

      setMsg(
        `Step 2/3 done: collapsed ${totalDedupClusters} clusters, deleted ${totalDedupDeleted} rows, re-pointed ${totalDedupRepointed} reviews. ` +
        `Starting step 3/3: re-matching pending reviews…`
      );
      const rematch = await apiFetch('/review/rematch', { method: 'POST' });
      setMsg(
        `Bulk cleanup complete. Normalized ${norm.branch_rewrites + norm.degree_rewrites} values, ` +
        `deleted ${totalDedupDeleted} duplicate alumni, ` +
        `auto-resolved ${rematch.auto_resolved} reviews, ` +
        `${rematch.made_multi_candidate} now multi-candidate, ` +
        `${rematch.untouched} still pending.`
      );
      await load(query, category, filterBranch, filterBatch);
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkRunning(false);
    }
  };

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Review Queue</h1>
        <Link
          href="/review/diagnostics"
          style={{ fontSize: '0.85rem', color: '#1d4e89', textDecoration: 'underline' }}
        >
          Merging diagnostics →
        </Link>
      </div>
      <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '-0.75rem', marginBottom: '1rem' }}>
        Records the matcher could not confidently place. Decide whether the incoming row is the same person, a new person, or junk.
      </p>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      {stats && (
        <div className="grid-stats">
          <div className="stat-card"><div className="stat-value">{stats.pending ?? 0}</div><div className="stat-label">Pending</div></div>
          <div className="stat-card"><div className="stat-value">{stats.merged ?? 0}</div><div className="stat-label">Merged</div></div>
          <div className="stat-card"><div className="stat-value">{stats.new_records ?? 0}</div><div className="stat-label">Kept separate</div></div>
          <div className="stat-card"><div className="stat-value">{stats.skipped ?? 0}</div><div className="stat-label">Skipped</div></div>
        </div>
      )}

      {(stats?.pending ?? 0) > 1000 && (
        <div className="card" style={{
          background: '#fff7e6', border: '1px solid #f0d480',
          padding: '0.85rem 1rem', marginBottom: '0.75rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <strong style={{ color: '#8a5a00' }}>Backlog cleanup</strong>
              <div style={{ fontSize: '0.85rem', color: '#555', marginTop: 4 }}>
                With {stats.pending.toLocaleString()} pending reviews, manual doubt-walking is slow.
                This button: <strong>normalize</strong> all branch/degree values → <strong>dedupe</strong> alumni rows with the same identity → <strong>re-run the matcher</strong>. Usually clears 80%+ of the backlog in one pass.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap', flexWrap: 'wrap' }}>
              <button
                className="btn btn-sm"
                style={{ background: '#555', color: '#fff' }}
                onClick={runJunkSkip}
                disabled={junkRunning || bulkRunning || contactRunning || separateRunning || bdSepRunning}
                title="Clear junk branch values (year, job title) from pending reviews so the rest of the pipeline can decide. Also restores reviews wrongly skipped by the previous version."
              >
                {junkRunning ? 'Clearing…' : 'Clear junk branches'}
              </button>
              <button
                className="btn btn-sm"
                style={{ background: '#1d4e89', color: '#fff' }}
                onClick={runContactMerge}
                disabled={contactRunning || bulkRunning || separateRunning || junkRunning || bdSepRunning}
                title="Auto-merge reviews where incoming and existing alumnus share an email or phone — strongest identity signal."
              >
                {contactRunning ? 'Merging…' : 'Merge by shared contact'}
              </button>
              <button
                className="btn btn-sm"
                style={{ background: '#a02020', color: '#fff' }}
                onClick={runSeparateByLinkedin}
                disabled={separateRunning || bulkRunning || contactRunning || junkRunning || bdSepRunning}
                title="Auto-separate reviews where both sides have a LinkedIn URL and the URLs differ — definitive 'different people'."
              >
                {separateRunning ? 'Separating…' : 'Separate by different LinkedIn'}
              </button>
              <button
                className="btn btn-sm"
                style={{ background: '#a02020', color: '#fff' }}
                onClick={runSeparateByBranchDegree}
                disabled={bdSepRunning || bulkRunning || contactRunning || junkRunning || separateRunning}
                title="Auto-separate reviews where canonical branch AND canonical degree both differ — e.g. Chemical Engineering MSc vs Computer Science PhD."
              >
                {bdSepRunning ? 'Separating…' : 'Separate by different branch + degree'}
              </button>
              <button
                className="btn btn-sm"
                style={{ background: '#8a5a00', color: '#fff' }}
                onClick={runBulkCleanup}
                disabled={bulkRunning || contactRunning || separateRunning || junkRunning || bdSepRunning}
              >
                {bulkRunning ? 'Running…' : 'Run bulk cleanup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {[
            { key: 'all',                  label: 'All pending',      count: stats.pending },
            { key: 'fuzzy',                label: 'Fuzzy',            count: stats.pending_fuzzy },
            { key: 'identity_ambiguous',   label: 'Multi-candidate',  count: stats.pending_identity_ambiguous },
            { key: 'unmergeable',          label: 'Hard to merge',    count: stats.pending_unmergeable },
          ].map(tab => {
            const active = category === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setCategory(tab.key)}
                className="btn btn-sm"
                style={{
                  background: active ? (tab.key === 'unmergeable' ? '#a02020' : '#1d4e89') : '#eef1f5',
                  color: active ? '#fff' : '#333',
                  border: '1px solid ' + (active ? 'transparent' : '#cdd3db'),
                }}
                title={tab.key === 'unmergeable'
                  ? 'Rows where the incoming branch is a year, job title, or unrecognised noise — usually a column-mapping error in the source sheet.'
                  : undefined}
              >
                {tab.label} ({tab.count ?? 0})
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ReviewDetail
          review={selected}
          onResolved={onResolved}
          onCancel={() => setSelected(null)}
        />
      )}

      <div className="row" style={{ marginBottom: '0.75rem', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or company (existing or incoming)…"
          style={{ marginBottom: 0, flex: 1, minWidth: 220 }}
        />
        <select
          value={filterBranch}
          onChange={e => setFilterBranch(e.target.value)}
          style={{ marginBottom: 0, minWidth: 160 }}
          title="Filter pending reviews by branch (either side matches via canonical comparison)"
        >
          <option value="">All branches ({filterOpts.branches.length})</option>
          {filterOpts.branches.map(b => (
            <option key={b.value} value={b.value}>
              {b.value} — {b.count.toLocaleString()}
            </option>
          ))}
        </select>
        <select
          value={filterBatch}
          onChange={e => setFilterBatch(e.target.value)}
          style={{ marginBottom: 0, minWidth: 130 }}
          title="Filter pending reviews by batch year (either side matches)"
        >
          <option value="">All years</option>
          {filterOpts.batch_years.map(b => (
            <option key={b.value} value={b.value}>
              {b.value} — {b.count.toLocaleString()}
            </option>
          ))}
        </select>
        {(query || filterBranch || filterBatch) && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setQuery(''); setFilterBranch(''); setFilterBatch(''); }}
          >
            Clear filters
          </button>
        )}
        <button
          className="btn btn-secondary btn-sm"
          onClick={openRematch}
          disabled={loading || rematchStep !== 'idle'}
          title="Step through every branch/degree the system can't auto-canonicalize, then merge"
        >
          Re-match pending
        </button>
        <span style={{ fontSize: '0.8rem', color: '#666', whiteSpace: 'nowrap' }}>
          {loading ? 'Loading…' : `${total} match${total === 1 ? '' : 'es'}`}
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Score</th>
              <th>Existing alumnus</th>
              <th>Incoming candidate</th>
              <th>Created</th>
              <th style={{ width: 120 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>No pending reviews 🎉</td></tr>
            )}
            {items.map(r => {
              const score = Math.round(r.match_score || 0);
              return (
                <tr key={r.id} style={{ background: selected?.id === r.id ? '#f3f1ff' : undefined }}>
                  <td>
                    <span className={`badge ${scoreClass(score)}`}>{score}</span>
                    {(r.review_type === 'identity_ambiguous' || (r.candidate_count || 0) > 1) && (
                      <div style={{ marginTop: 4 }}>
                        <span className="badge badge-yellow" title="The roster has multiple alumni with this name+batch+branch — a human must pick which one">
                          {r.candidate_count || 2} candidates
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.existing_name || <em style={{ color: '#aaa' }}>(unknown)</em>}</div>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>
                      {[r.existing_batch, r.existing_branch, r.existing_company].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.incoming_name || <em style={{ color: '#aaa' }}>(unnamed)</em>}</div>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>
                      {[r.incoming_batch, r.incoming_branch, r.incoming_company].filter(Boolean).join(' · ') || '—'}
                    </div>
                    {r.is_unmergeable && (
                      <div style={{ marginTop: 4 }}>
                        <span className="badge badge-red" title="Incoming branch looks like a year, job title, or noise — likely a column-mapping error in the source sheet.">
                          unmergeable: branch &ldquo;{r.incoming_branch || '∅'}&rdquo;
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: '#666' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setSelected(r)}
                      disabled={selected?.id === r.id}
                    >
                      {selected?.id === r.id ? 'Reviewing' : 'Review'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rematchStep !== 'idle' && (
        <RematchModal
          step={rematchStep}
          scan={scan}
          allDoubts={allDoubts}
          doubtIdx={doubtIdx}
          progress={progress}
          buffer={buffer}
          resolved={resolvedDecisions}
          tab={modalTab}
          onTab={setModalTab}
          sortMode={doubtSort}
          onSortMode={(m) => { setDoubtSort(m); setDoubtIdx(0); }}
          onSame={(preferred) => decideDoubt(allDoubts[doubtIdx], 'same', preferred)}
          onDifferent={() => decideDoubt(allDoubts[doubtIdx], 'different')}
          onSkip={skipDoubt}
          onUndo={undoDecision}
          onClose={closeRematch}
        />
      )}
    </Layout>
  );
}

function RematchModal({ step, scan, allDoubts, doubtIdx, progress, buffer, resolved, tab, onTab, sortMode, onSortMode, onSame, onDifferent, onSkip, onUndo, onClose }) {
  // Canonical-value picker state — resets each time the doubt advances.
  const doubt = allDoubts[doubtIdx];
  const [pickerMode, setPickerMode] = useState('b');
  const [customValue, setCustomValue] = useState('');
  useEffect(() => {
    setPickerMode('b'); // default: keep the second value
    setCustomValue('');
  }, [doubtIdx]);
  const preferredValue = pickerMode === 'a' ? doubt?.a
                       : pickerMode === 'b' ? doubt?.b
                       : customValue.trim();

  // Reusable progress bar — two lines:
  //   1. doubts decided  (i / total)
  //   2. reviews resolved (initial - remaining) / initial
  const renderProgressBar = () => {
    const totalDoubts = allDoubts.length || 1;
    const doubtsDone = doubtIdx;
    const doubtsPct = Math.round((doubtsDone / totalDoubts) * 100);

    const initial = progress?.initial_pending || 0;
    const remaining = progress?.remaining_pending || 0;
    const resolved = Math.max(0, initial - remaining);
    const reviewsPct = initial > 0 ? Math.round((resolved / initial) * 100) : 0;

    return (
      <div style={{ margin: '0.5rem 0 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#444', marginBottom: 4 }}>
          <span>Doubts decided</span>
          <span>{doubtsDone} of {totalDoubts}</span>
        </div>
        <div style={{ background: '#eef1f5', borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: '0.5rem' }}>
          <div style={{ width: `${doubtsPct}%`, height: '100%', background: '#1d4e89', transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#444', marginBottom: 4 }}>
          <span>Reviews resolved</span>
          <span>{resolved} of {initial} · {progress?.auto_resolved || 0} auto-merged · {progress?.made_multi_candidate || 0} multi-candidate</span>
        </div>
        <div style={{ background: '#eef1f5', borderRadius: 4, height: 8, overflow: 'hidden' }}>
          <div style={{ width: `${reviewsPct}%`, height: '100%', background: '#1e7b34', transition: 'width 0.3s' }} />
        </div>
        {(progress?.branch_rows_rewritten > 0 || progress?.degree_rows_rewritten > 0) && (
          <div style={{ fontSize: '0.75rem', color: '#1d4e89', marginTop: '0.4rem' }}>
            Normalized {progress.branch_rows_rewritten} branch values
            {progress.degree_rows_rewritten > 0 && <> and {progress.degree_rows_rewritten} degree values</>}
            {' '}in the alumni table so far.
          </div>
        )}
      </div>
    );
  };
  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const panel = {
    background: '#fff', borderRadius: 8, width: 'min(640px, 92vw)',
    padding: '1.5rem 1.75rem', boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
  };

  if (step === 'scanning') {
    return (
      <div style={overlay}><div style={panel}>
        <h2 style={{ marginTop: 0 }}>Scanning pending reviews…</h2>
        <p style={{ color: '#666' }}>Finding every branch and degree pair the system can&apos;t reconcile on its own.</p>
      </div></div>
    );
  }
  if (step === 'done') {
    const initial = progress?.initial_pending || 0;
    const remaining = progress?.remaining_pending || 0;
    return (
      <div style={overlay}><div style={panel}>
        <h2 style={{ marginTop: 0, color: '#1e7b34' }}>Re-match complete</h2>
        {renderProgressBar()}
        <ul style={{ lineHeight: 1.7 }}>
          <li><strong>{progress?.auto_resolved ?? 0}</strong> auto-resolved as merged</li>
          <li><strong>{progress?.made_multi_candidate ?? 0}</strong> now multi-candidate (need a human pick)</li>
          <li><strong>{Math.max(0, initial - (progress?.auto_resolved || 0) - (progress?.made_multi_candidate || 0))}</strong> left pending — currently {remaining} pending in the queue</li>
          {(progress?.branch_rows_rewritten > 0 || progress?.degree_rows_rewritten > 0) && (
            <li style={{ color: '#1d4e89' }}>
              Normalized {progress.branch_rows_rewritten || 0} branch values
              {progress.degree_rows_rewritten > 0 && <> and {progress.degree_rows_rewritten} degree values</>}
              {' '}in the alumni table.
            </li>
          )}
        </ul>
        <div style={{ textAlign: 'right' }}>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div></div>
    );
  }

  // step === 'doubts' or 'deciding'
  const fieldLabel = doubt?.field === 'branch' ? 'Branch' : 'Degree';
  const inFlight = step === 'deciding';
  const bufferLen = buffer?.length || 0;

  // Tab bar — switches between deciding (the doubt walker) and the history
  // of every persisted decision. Solved tab is read-only.
  const tabBar = (
    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
      <button
        className="btn btn-sm"
        style={{
          background: tab === 'decide' ? '#1d4e89' : '#eef1f5',
          color: tab === 'decide' ? '#fff' : '#333',
          border: '1px solid ' + (tab === 'decide' ? 'transparent' : '#cdd3db'),
        }}
        onClick={() => onTab('decide')}
      >
        Deciding ({allDoubts.length - doubtIdx} left)
      </button>
      <button
        className="btn btn-sm"
        style={{
          background: tab === 'solved' ? '#1e7b34' : '#eef1f5',
          color: tab === 'solved' ? '#fff' : '#333',
          border: '1px solid ' + (tab === 'solved' ? 'transparent' : '#cdd3db'),
        }}
        onClick={() => onTab('solved')}
      >
        Doubts solved ({resolved?.length || 0})
      </button>
    </div>
  );

  if (tab === 'solved') {
    return (
      <div style={overlay}><div style={{ ...panel, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>Doubts solved</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
        {tabBar}
        {(!resolved || resolved.length === 0) ? (
          <p style={{ color: '#888' }}>No decisions persisted yet.</p>
        ) : (
          <table style={{ width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f3f5f8' }}>
                <th style={{ textAlign: 'left', padding: '0.4rem' }}>Field</th>
                <th style={{ textAlign: 'left', padding: '0.4rem' }}>Pair</th>
                <th style={{ textAlign: 'left', padding: '0.4rem' }}>Decision</th>
                <th style={{ textAlign: 'left', padding: '0.4rem' }}>Canonical</th>
              </tr>
            </thead>
            <tbody>
              {resolved.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eef1f5' }}>
                  <td style={{ padding: '0.4rem' }}>{r.field}</td>
                  <td style={{ padding: '0.4rem' }}>
                    <code>{r.value_a}</code> ↔ <code>{r.value_b}</code>
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    {r.decision === 'same' ? (
                      <span className="badge badge-green">same</span>
                    ) : (
                      <span className="badge badge-red">different</span>
                    )}
                  </td>
                  <td style={{ padding: '0.4rem' }}>{r.preferred || <em style={{ color: '#aaa' }}>—</em>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div></div>
    );
  }

  return (
    <div style={overlay}><div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>Same or different?</h2>
        <span style={{ fontSize: '0.85rem', color: '#666' }}>
          Doubt {doubtIdx + 1} of {allDoubts.length}
        </span>
      </div>

      {tabBar}

      {scan?.auto_applied?.pairs > 0 && (
        <div style={{
          background: '#eaf7ec', border: '1px solid #a7d8ad',
          borderRadius: 4, padding: '0.5rem 0.75rem', marginBottom: '0.6rem',
          fontSize: '0.82rem', color: '#1e6a32',
        }}>
          <strong>Auto-resolved {scan.auto_applied.pairs} near-identical pair{scan.auto_applied.pairs === 1 ? '' : 's'}</strong>
          {' '}(case-only differences, typos, whitespace) without asking —
          {' '}{scan.auto_applied.auto_resolved} reviews auto-merged,
          {' '}{scan.auto_applied.branch_rows_rewritten} branch and {scan.auto_applied.degree_rows_rewritten} degree values normalized in the alumni table.
        </div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '0.75rem', margin: '0 0 0.6rem', fontSize: '0.82rem', color: '#444',
      }}>
        <label style={{ marginBottom: 0 }}>
          Sort doubts:{' '}
          <select
            value={sortMode}
            onChange={e => onSortMode(e.target.value)}
            style={{ marginBottom: 0, fontSize: '0.82rem' }}
          >
            <option value="impact">Highest impact first ({allDoubts[0]?.count ?? 0} reviews)</option>
            <option value="low_impact">Lowest impact first</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
        </label>
        <span style={{ color: '#888' }}>
          {sortMode === 'impact' && 'Top of the queue clears the most pending rows per click.'}
          {sortMode === 'low_impact' && 'Sweep the long-tail noise pairs first.'}
          {sortMode === 'alphabetical' && 'Useful when scanning for known typos.'}
        </span>
      </div>

      {renderProgressBar()}

      {/* Buffer indicator: which decisions are queued before next commit. */}
      <div style={{
        background: bufferLen > 0 ? '#fff8e1' : '#f3f5f8',
        border: '1px solid ' + (bufferLen > 0 ? '#f0d480' : '#e0e4e8'),
        borderRadius: 4, padding: '0.5rem 0.75rem',
        margin: '0.5rem 0 0.75rem', fontSize: '0.8rem', color: '#555',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem',
      }}>
        <span>
          {bufferLen === 0
            ? 'Buffer empty — next decision starts a new batch of 3.'
            : `Buffer ${bufferLen}/3 — commit happens automatically on the 3rd decision.`}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onUndo}
          disabled={bufferLen === 0 || inFlight}
          title={bufferLen === 0 ? 'Nothing to undo' : `Undo last buffered decision (max ${3} available)`}
        >
          Undo last
        </button>
      </div>

      <p style={{ fontSize: '0.85rem', color: '#666', marginTop: 0 }}>
        Affects <strong style={{ color: '#1d4e89', fontSize: '1.05rem' }}>{doubt?.count}</strong> review{doubt?.count === 1 ? '' : 's'} with this {fieldLabel.toLowerCase()} pair.
        Up to that many rows can merge from a single &ldquo;Same&rdquo; click.
      </p>

      <div style={{
        margin: '1rem 0', padding: '1rem', background: '#fafbfc',
        border: '1px solid #e6e9ed', borderRadius: 6,
      }}>
        <div style={{ fontSize: '0.78rem', color: '#888', marginBottom: '0.5rem' }}>
          {fieldLabel.toUpperCase()}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, textAlign: 'center', padding: '0.6rem', background: '#fff', border: '1px solid #d0d6dd', borderRadius: 4 }}>
            {doubt?.a || <em>(empty)</em>}
          </div>
          <div style={{ fontSize: '1.2rem', color: '#888' }}>vs</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, textAlign: 'center', padding: '0.6rem', background: '#fff', border: '1px solid #d0d6dd', borderRadius: 4 }}>
            {doubt?.b || <em>(empty)</em>}
          </div>
        </div>
      </div>

      <div style={{
        margin: '0 0 1rem', padding: '0.75rem 1rem', background: '#f5f9ff',
        border: '1px solid #b6d7ff', borderRadius: 6,
      }}>
        <div style={{ fontSize: '0.78rem', color: '#1d4e89', marginBottom: '0.5rem', fontWeight: 600 }}>
          IF YOU SAY &ldquo;SAME&rdquo; — STORE THIS VALUE IN ALL MERGED ROWS
        </div>
        <label style={{ display: 'block', marginBottom: '0.3rem', cursor: 'pointer' }}>
          <input type="radio" name="pref" checked={pickerMode === 'a'} onChange={() => setPickerMode('a')} />{' '}
          Use <strong>{doubt?.a || '(empty)'}</strong>
        </label>
        <label style={{ display: 'block', marginBottom: '0.3rem', cursor: 'pointer' }}>
          <input type="radio" name="pref" checked={pickerMode === 'b'} onChange={() => setPickerMode('b')} />{' '}
          Use <strong>{doubt?.b || '(empty)'}</strong>
        </label>
        <label style={{ display: 'block', marginBottom: 0, cursor: 'pointer' }}>
          <input type="radio" name="pref" checked={pickerMode === 'custom'} onChange={() => setPickerMode('custom')} />{' '}
          Custom:{' '}
          <input
            type="text"
            value={customValue}
            onChange={e => { setCustomValue(e.target.value); setPickerMode('custom'); }}
            placeholder="type a different canonical value"
            style={{ marginBottom: 0, width: '60%' }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
        <button className="btn btn-secondary btn-sm" onClick={onSkip} disabled={inFlight}>
          Skip — don&apos;t decide
        </button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-sm"
            style={{ background: inFlight ? '#bbb' : '#a02020', color: '#fff' }}
            onClick={() => onDifferent()}
            disabled={inFlight}
          >
            Different — keep separate
          </button>
          <button
            className="btn btn-sm"
            style={{ background: (inFlight || !preferredValue) ? '#bbb' : '#1e7b34', color: '#fff' }}
            onClick={() => onSame(preferredValue)}
            disabled={inFlight || !preferredValue}
            title={!preferredValue ? 'Pick a canonical value first' : `Merge as "${preferredValue}"`}
          >
            {inFlight ? 'Merging…' : `Same — store as "${preferredValue || '?'}"`}
          </button>
        </div>
      </div>

      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      </div>
    </div></div>
  );
}
