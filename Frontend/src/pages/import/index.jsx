import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const SOURCE_PRESETS = [
  { key: 'manual_mined',   tier: 1, label: 'Manually mined / verified',         confidence: 95 },
  { key: 'thapar_portal',  tier: 2, label: 'Thapar alumni portal',              confidence: 82 },
  { key: 'cell_excel',     tier: 3, label: 'Cell Excel sheet',                  confidence: 70 },
  { key: 'apollo_bulk',    tier: 4, label: 'Apollo bulk export',                confidence: 58 },
  { key: 'unverified',     tier: 5, label: 'Unverified / external scrape',      confidence: 40 },
];

export default function Import() {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sourceKey, setSourceKey] = useState('cell_excel');
  const [sourceName, setSourceName] = useState('');
  const fileRef = useRef();

  const load = () => apiFetch('/import').then(d => setJobs(d.data || d || [])).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    e.preventDefault();
    const file = fileRef.current.files[0];
    if (!file) return;
    const preset = SOURCE_PRESETS.find(p => p.key === sourceKey) || SOURCE_PRESETS[2];
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
    if (!confirm('Rollback this import?')) return;
    try { await apiFetch(`/import/${id}/rollback`, { method: 'POST' }); setMsg('Rolled back'); load(); }
    catch (e) { setError(e.message); }
  };

  const statusBadge = (s) => {
    const map = { pending: 'badge-yellow', processing: 'badge-blue', completed: 'badge-green', failed: 'badge-red', cancelled: 'badge-gray' };
    return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
  };

  return (
    <Layout>
      <h1>Import Jobs</h1>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}

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
                  {j.status === 'completed' && <button className="btn btn-secondary btn-sm" onClick={() => rollback(j.id)}>Rollback</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
