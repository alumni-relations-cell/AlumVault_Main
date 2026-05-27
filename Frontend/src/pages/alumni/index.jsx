import { useState, useEffect } from 'react';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

export default function Alumni() {
  const [alumni, setAlumni] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [cursorStack, setCursorStack] = useState([]); // stack of cursors used for prev navigation
  const [currentCursor, setCurrentCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [count, setCount] = useState(0);

  const fetchPage = async (cursor, q, size) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', size);
      if (cursor) params.set('cursor', cursor);
      if (q) params.set('query', q);
      const data = await apiFetch(`/alumni?${params.toString()}`);
      setAlumni(data.data || []);
      setCount(data.metadata?.count || data.data?.length || 0);
      setNextCursor(data.metadata?.nextCursor || null);
      setHasMore(!!data.metadata?.hasMore);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPage(null, '', pageSize); }, []);

  const search = () => {
    setCursorStack([]);
    setCurrentCursor(null);
    fetchPage(null, query, pageSize);
  };

  const nextPage = () => {
    if (!hasMore || !nextCursor) return;
    setCursorStack(prev => [...prev, currentCursor]);
    setCurrentCursor(nextCursor);
    fetchPage(nextCursor, query, pageSize);
  };

  const prevPage = () => {
    if (cursorStack.length === 0) return;
    const prevStack = [...cursorStack];
    const prevCursor = prevStack.pop();
    setCursorStack(prevStack);
    setCurrentCursor(prevCursor);
    fetchPage(prevCursor, query, pageSize);
  };

  const changePageSize = (newSize) => {
    setPageSize(newSize);
    setCursorStack([]);
    setCurrentCursor(null);
    fetchPage(null, query, newSize);
  };

  const remove = async (id, name) => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      await apiFetch(`/alumni/${id}`, { method: 'DELETE' });
      setMsg('Deleted');
      fetchPage(currentCursor, query, pageSize);
    } catch (e) { setError(e.message); }
  };

  const pageNumber = cursorStack.length + 1;

  return (
    <Layout>
      <h1>Alumni</h1>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      <div className="row" style={{ marginBottom: '1.5rem', alignItems: 'center', gap: '1rem' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, company, batch..." onKeyDown={e => e.key === 'Enter' && search()} style={{ marginBottom: 0, flex: 1 }} />
        <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? '...' : 'Search'}</button>
        <label style={{ marginBottom: 0 }}>
          Per page:{' '}
          <select value={pageSize} onChange={e => changePageSize(parseInt(e.target.value, 10))}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
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
                <td style={{ fontWeight: 600 }}>
                  <Link href={`/alumni/${a.id}`}>{a.full_name || '(unnamed)'}</Link>
                </td>
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

      <div className="row" style={{ marginTop: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#666' }}>
          Page {pageNumber} — showing {count} record{count === 1 ? '' : 's'}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={prevPage} disabled={loading || cursorStack.length === 0}>← Prev</button>
          <button className="btn" onClick={nextPage} disabled={loading || !hasMore}>Next →</button>
        </div>
      </div>
    </Layout>
  );
}
