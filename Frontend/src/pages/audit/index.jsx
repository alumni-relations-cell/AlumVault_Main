import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = (p = 1) => {
    apiFetch(`/audit?page=${p}&limit=20`)
      .then(d => { setLogs(d.data || d || []); setTotal(d.metadata?.total || 0); })
      .catch(e => setError(e.message));
  };
  useEffect(() => { load(page); }, [page]);

  return (
    <Layout>
      <h1>Audit Log</h1>
      {error && <div className="error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>IP</th><th>Status</th></tr></thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>No logs</td></tr>}
            {logs.map((l, i) => (
              <tr key={l.id || i}>
                <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{l.created_at ? new Date(l.created_at).toLocaleString() : '-'}</td>
                <td>{l.user_email || l.user_id?.substring(0,8)}</td>
                <td><span className="badge badge-blue">{l.action}</span></td>
                <td>{l.resource_type} {l.resource_id ? `#${l.resource_id.substring(0,8)}` : ''}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{l.ip_address}</td>
                <td><span className={`badge ${l.status_code < 400 ? 'badge-green' : 'badge-red'}`}>{l.status_code || '-'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>← Prev</button>
        <span style={{ fontSize: '0.875rem', color: '#666' }}>Page {page} · {total} total</span>
        <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p+1)}>Next →</button>
      </div>
    </Layout>
  );
}
