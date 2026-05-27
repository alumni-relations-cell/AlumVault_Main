import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

export default function Alumni() {
  const [alumni, setAlumni] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [total, setTotal] = useState(0);

  const search = async () => {
    setLoading(true); setError('');
    try {
      const params = query ? `?query=${encodeURIComponent(query)}` : '';
      const data = await apiFetch(`/alumni${params}`);
      setAlumni(data.data || []);
      setTotal(data.metadata?.total || data.data?.length || 0);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { search(); }, []);

  const remove = async (id, name) => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      await apiFetch(`/alumni/${id}`, { method: 'DELETE' });
      setMsg('Deleted'); search();
    } catch (e) { setError(e.message); }
  };

  return (
    <Layout>
      <h1>Alumni ({total})</h1>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      <div className="row" style={{ marginBottom: '1.5rem' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, company, batch..." onKeyDown={e => e.key === 'Enter' && search()} style={{ marginBottom: 0 }} />
        <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? '...' : 'Search'}</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Batch</th><th>Branch</th><th>Company</th>
              <th>Title</th><th>City</th><th>Confidence</th><th>Verified</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {alumni.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>No records found</td></tr>
            )}
            {alumni.map(a => (
              <tr key={a.id}>
                <td style={{ fontWeight: 600 }}>{a.full_name}</td>
                <td>{a.batch_year}</td>
                <td>{a.branch}</td>
                <td>{a.current_company}</td>
                <td>{a.current_title}</td>
                <td>{a.current_city}</td>
                <td>{a.overall_confidence ? `${Math.round(a.overall_confidence)}%` : '-'}</td>
                <td>
                  <span className={`badge ${a.is_verified ? 'badge-green' : 'badge-yellow'}`}>
                    {a.is_verified ? 'Verified' : 'Pending'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(a.id, a.full_name)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
