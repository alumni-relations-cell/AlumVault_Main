import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const SOURCE_PRESETS = [
  { key: 'admission_roster', tier: 0, label: 'Admission cell roster (authoritative identity)', confidence: 100 },
  { key: 'manual_mined',     tier: 1, label: 'Manually mined / verified',                      confidence: 95 },
  { key: 'thapar_portal',    tier: 2, label: 'Thapar alumni portal',                           confidence: 82 },
  { key: 'cell_excel',       tier: 3, label: 'Cell Excel sheet',                               confidence: 70 },
  { key: 'apollo_bulk',      tier: 4, label: 'Apollo bulk export',                             confidence: 58 },
  { key: 'unverified',       tier: 5, label: 'Unverified / external scrape',                   confidence: 40 },
];

// Admission roster bypasses the matcher entirely (enrollment_no is the dedup
// key) and contact fields go in as smtp_status=unknown — the SMTP verifier
// filters dead emails. Surfaced to the user so they don't expect a review
// queue from this import.
const ROSTER_HELP =
  'Admission roster rows are deduped by ENROLLMENTNO and skip the review queue. ' +
  'Identity fields (name, batch, branch, DOB) overwrite existing values; emails ' +
  'and phones are appended and queued for SMTP verification.';

export default function Import() {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sourceKey, setSourceKey] = useState('cell_excel');
  const [sourceName, setSourceName] = useState('');
  // Tracks rollbacks currently in flight. Keyed by job id; each value is
  // { startedAt, remaining, originally, status, fileName }. The POST request
  // is fire-and-forget (the proxy aborts at 30s but the DELETE keeps going
  // server-side), so we poll /rollback-status to know when it's actually done.
  const [rollbacks, setRollbacks] = useState({});
  const fileRef = useRef();

  const load = () => apiFetch('/import').then(d => setJobs(d.data || d || [])).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    e.preventDefault();
    const file = fileRef.current.files[0];
    if (!file) return;
    const preset = SOURCE_PRESETS.find(p => p.key === sourceKey) || SOURCE_PRESETS[3];
    const fd = new FormData();
    fd.append('file', file);
    fd.append('source_type', preset.key);
    fd.append('source_tier', String(preset.tier));
    if (sourceName.trim()) fd.append('source_name', sourceName.trim());
    setUploading(true); setError(''); setMsg('');
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${BASE}/import`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMsg(`Job created: ${data.id}`);
      fileRef.current.value = '';
      load();
    } catch (e) { setError(e.message); }
    finally { setUploading(false); }
  };

  const cancel = async (id) => {
    try { await apiFetch(`/import/${id}/cancel`, { method: 'POST' }); setMsg('Cancelled'); load(); }
    catch (e) { setError(e.message); }
  };

  const rollback = async (id) => {
    if (!confirm(
      'Rollback this import?\n\n' +
      'This will:\n' +
      '  • DELETE every alumnus this import created\n' +
      '  • Strip this import\u2019s email/phone entries off other rows\n' +
      '  • Cancel any still-pending review items it queued\n\n' +
      'Already-resolved reviews are kept. Big rollbacks may take a few ' +
      'minutes — the progress card at the top will keep updating.'
    )) return;
    const job = jobs.find(j => j.id === id);
    const fileName = job?.file_path?.split(/[\\/]/).pop() || id.slice(0, 8);
    const originally = job?.new_count || 0;
    setRollbacks(prev => ({
      ...prev,
      [id]: { startedAt: Date.now(), remaining: originally, originally, status: 'processing', fileName },
    }));
    // Fire and forget. The proxy aborts at 30s but the DELETE keeps running
    // server-side; the poller decides when we're actually done.
    apiFetch(`/import/${id}/rollback`, { method: 'POST' }).catch(() => {});
  };

  // Poll every 3s for each in-flight rollback until status flips to
  // 'rolled_back' or alumni-remaining hits 0.
  useEffect(() => {
    const inFlight = Object.keys(rollbacks).filter(id => rollbacks[id].status === 'processing');
    if (inFlight.length === 0) return undefined;
    const tick = async () => {
      for (const id of inFlight) {
        try {
          const s = await apiFetch(`/import/${id}/rollback-status`);
          let becameDone = false;
          setRollbacks(prev => {
            const cur = prev[id];
            if (!cur) return prev;
            if (s.done && cur.status !== 'done') becameDone = true;
            return {
              ...prev,
              [id]: {
                ...cur,
                remaining: s.alumni_remaining,
                originally: cur.originally || s.alumni_originally_created,
                status: s.done ? 'done' : 'processing',
              },
            };
          });
          if (becameDone) {
            setMsg('Rollback complete — 0 alumni remaining for this import.');
            load();
          }
        } catch (e) {
          setRollbacks(prev => ({ ...prev, [id]: { ...prev[id], status: 'error', error: e.message } }));
        }
      }
    };
    tick();
    const handle = setInterval(tick, 3000);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(rollbacks).filter(id => rollbacks[id].status === 'processing').join(',')]);

  const dismissRollback = (id) => {
    setRollbacks(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const statusBadge = (s) => {
    const map = { pending: 'badge-yellow', processing: 'badge-blue', completed: 'badge-green', failed: 'badge-red', cancelled: 'badge-gray', rolled_back: 'badge-gray' };
    return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
  };

  const purgeBatchYearZero = async () => {
    if (!confirm(
      'Delete every alumnus with batch_year = 0?\n\n' +
      'This targets the importer\u2019s "couldn\u2019t derive graduation year" rows from bad imports. ' +
      'Rows with NULL or missing batch_year are not touched.\n\n' +
      'This cannot be undone.'
    )) return;
    try {
      const res = await apiFetch(`/import/cleanup/batch-year-zero`, { method: 'POST' });
      setMsg(
        `Deleted ${res.deleted} alumni with batch_year = 0` +
        ` (also cleared ${res.reviews_cleared} review-queue refs, ${res.campaigns_cleared} campaign refs).` +
        (res.batches >= 2000 ? ' Hit batch ceiling — click again to continue.' : '')
      );
      load();
    } catch (e) { setError(e.message); }
  };

  const activeRollbacks = Object.entries(rollbacks);

  return (
    <Layout>
      <h1>Import Jobs</h1>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      {activeRollbacks.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          {activeRollbacks.map(([id, rb]) => {
            const total = Math.max(rb.originally || 0, rb.remaining || 0);
            const done = total - (rb.remaining || 0);
            const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (rb.status === 'done' ? 100 : 0);
            const elapsed = Math.floor((Date.now() - rb.startedAt) / 1000);
            const isDone = rb.status === 'done';
            const isErr = rb.status === 'error';
            const bg = isDone ? '#eaf7ec' : isErr ? '#fdecea' : '#eef6ff';
            const border = isDone ? '#a7d8ad' : isErr ? '#f4b6b0' : '#b6d7ff';
            const accent = isDone ? '#1e7b34' : isErr ? '#a02020' : '#1d4e89';
            return (
              <div key={id} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: '0.75rem 1rem', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <strong style={{ color: accent }}>
                    {isDone ? 'Rollback complete' : isErr ? 'Rollback status error' : 'Rolling back…'}
                    <span style={{ fontWeight: 400, marginLeft: '0.5rem', fontSize: '0.85rem', color: '#444' }}>
                      {rb.fileName}
                    </span>
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: '#666' }}>
                    {isDone ? `${total} alumni removed in ${elapsed}s` :
                     isErr ? rb.error || 'unknown error' :
                     `${rb.remaining ?? '?'} of ${total} remaining — ${elapsed}s`}
                  </span>
                </div>
                {!isErr && (
                  <div style={{ background: '#fff', border: '1px solid ' + border, borderRadius: 3, height: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: accent, transition: 'width 0.4s ease' }} />
                  </div>
                )}
                {(isDone || isErr) && (
                  <div style={{ textAlign: 'right', marginTop: '0.4rem' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => dismissRollback(id)}>Dismiss</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <h2>Upload File</h2>
        <form onSubmit={upload}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <label style={{ marginBottom: 0 }}>
              <div style={{ fontSize: '0.85rem', color: '#444', marginBottom: '0.25rem' }}>Where did this data come from?</div>
              <select value={sourceKey} onChange={e => setSourceKey(e.target.value)} style={{ width: '100%' }}>
                {SOURCE_PRESETS.map(p => (
                  <option key={p.key} value={p.key}>
                    Tier {p.tier} — {p.label} (base conf {p.confidence}%)
                  </option>
                ))}
              </select>
            </label>
            <label style={{ marginBottom: 0 }}>
              <div style={{ fontSize: '0.85rem', color: '#444', marginBottom: '0.25rem' }}>Label / batch name (optional)</div>
              <input
                type="text"
                value={sourceName}
                onChange={e => setSourceName(e.target.value)}
                placeholder="e.g. CSE 2018 batch sheet"
                style={{ width: '100%' }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <input type="file" ref={fileRef} accept=".csv,.xlsx,.tsv" style={{ marginBottom: 0 }} required />
            <button type="submit" className="btn btn-primary" disabled={uploading} style={{ whiteSpace: 'nowrap' }}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
        <p style={{ fontSize: '0.78rem', color: '#888', marginTop: '0.5rem' }}>
          Accepted: CSV, XLSX, TSV (max 50MB). The source tier sets the base confidence for every record in this file —
          higher tiers win conflicts when the same person turns up in multiple imports.
        </p>
        {sourceKey === 'admission_roster' && (
          <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.8rem', background: '#eef6ff', border: '1px solid #b6d7ff', borderRadius: 4, fontSize: '0.8rem', color: '#1d4e89' }}>
            <strong>Roster path:</strong> {ROSTER_HELP}
          </div>
        )}
      </div>

      <div className="card" style={{ borderColor: '#f4c4c4', background: '#fef7f7', marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0, color: '#a02020' }}>Cleanup tools</h3>
        <p style={{ fontSize: '0.85rem', color: '#444', marginBottom: '0.6rem' }}>
          Use this when a bad import left rows the per-job <em>Rollback</em> can&apos;t reach — typically alumni whose
          <code> batch_year</code> ended up as <strong>0</strong> because the importer couldn&apos;t derive a graduation year.
          Only rows with exactly <code>batch_year = 0</code> are deleted; NULL and valid years are untouched.
        </p>
        <button className="btn btn-danger btn-sm" onClick={purgeBatchYearZero}>
          Delete all alumni with batch_year = 0
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Status</th><th>File</th><th>Total</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {jobs.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>No jobs yet</td></tr>}
            {jobs.map(j => (
              <tr key={j.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  <Link href={`/import/${j.id}`}>{j.id?.substring(0,8)}...</Link>
                </td>
                <td>{statusBadge(j.status)}</td>
                <td>{j.file_name || j.original_filename || '-'}</td>
                <td>{j.total_rows ?? '-'}</td>
                <td>{j.created_at ? new Date(j.created_at).toLocaleString() : '-'}</td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  {j.status === 'processing' && <button className="btn btn-danger btn-sm" onClick={() => cancel(j.id)}>Cancel</button>}
                  {['completed', 'cancelled', 'failed'].includes(j.status) && (
                    <button className="btn btn-secondary btn-sm" onClick={() => rollback(j.id)}>Rollback</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
