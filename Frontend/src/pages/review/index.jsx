import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

export default function Review() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [resolving, setResolving] = useState(null);
  const [resolution, setResolution] = useState({ action: 'approve', notes: '' });

  const load = () => {
    apiFetch('/review').then(d => setItems(d.data || d || [])).catch(e => setError(e.message));
    apiFetch('/review/stats').then(setStats).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const resolve = async (id) => {
    try {
      await apiFetch(`/review/${id}/resolve`, { method: 'POST', body: JSON.stringify(resolution) });
      setMsg('Resolved'); setResolving(null); load();
    } catch (e) { setError(e.message); }
  };

  return (
    <Layout>
      <h1>Review Queue</h1>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      {stats && (
        <div className="grid-stats">
          <div className="stat-card"><div className="stat-value">{stats.pending ?? 0}</div><div className="stat-label">Pending</div></div>
          <div className="stat-card"><div className="stat-value">{stats.resolved ?? 0}</div><div className="stat-label">Resolved</div></div>
          <div className="stat-card"><div className="stat-value">{stats.total ?? 0}</div><div className="stat-label">Total</div></div>
        </div>
      )}

      {resolving && (
        <div className="card" style={{ border: '2px solid #6c63ff' }}>
          <h2>Resolve Review #{resolving.id?.substring(0,8)}</h2>
          <label>Action</label>
          <select value={resolution.action} onChange={e => setResolution({...resolution, action: e.target.value})}>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
            <option value="merge">Merge</option>
          </select>
          <label>Notes</label>
          <textarea value={resolution.notes} onChange={e => setResolution({...resolution, notes: e.target.value})} rows={3} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-success" onClick={() => resolve(resolving.id)}>Submit</button>
            <button className="btn btn-secondary" onClick={() => setResolving(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Type</th><th>Status</th><th>Alumni</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>No reviews pending</td></tr>}
            {items.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.id?.substring(0,8)}...</td>
                <td><span className="badge badge-blue">{r.review_type || r.type}</span></td>
                <td><span className={`badge ${r.status === 'pending' ? 'badge-yellow' : 'badge-green'}`}>{r.status}</span></td>
                <td>{r.alumni_name || r.alumni_id?.substring(0,8)}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}</td>
                <td>
                  {r.status === 'pending' && (
                    <button className="btn btn-primary btn-sm" onClick={() => setResolving(r)}>Resolve</button>
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
