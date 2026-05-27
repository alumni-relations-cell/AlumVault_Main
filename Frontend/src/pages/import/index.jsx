import { useState, useEffect, useRef } from 'react';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function Import() {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const load = () => apiFetch('/import').then(d => setJobs(d.data || d || [])).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    e.preventDefault();
    const file = fileRef.current.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
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
        <form onSubmit={upload} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input type="file" ref={fileRef} accept=".csv,.xlsx,.tsv" style={{ marginBottom: 0 }} required />
          <button type="submit" className="btn btn-primary" disabled={uploading} style={{ whiteSpace: 'nowrap' }}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
        <p style={{ fontSize: '0.78rem', color: '#888', marginTop: '0.5rem' }}>Accepted: CSV, XLSX, TSV (max 50MB)</p>
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
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{j.id?.substring(0,8)}...</td>
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
