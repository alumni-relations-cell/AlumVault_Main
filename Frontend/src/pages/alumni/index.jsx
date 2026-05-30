import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

const EMPTY_FILTERS = {
  batch_year: '',
  branch: '',
  company: '',
  is_verified: '',
  min_completeness: '',
};

function buildSearchParams({ q, filters, limit, cursor }) {
  const params = new URLSearchParams();
  params.set('limit', limit);
  if (cursor) params.set('cursor', cursor);
  if (q && q.trim()) params.set('q', q.trim());
  if (filters.batch_year) params.set('batch_year', filters.batch_year);
  if (filters.branch) params.set('branch', filters.branch.trim());
  if (filters.company) params.set('company', filters.company.trim());
  if (filters.is_verified !== '') params.set('is_verified', filters.is_verified);
  if (filters.min_completeness) params.set('min_completeness', filters.min_completeness);
  return params;
}

export default function Alumni() {
  const router = useRouter();
  const [alumni, setAlumni] = useState([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [cursorStack, setCursorStack] = useState([]);
  const [currentCursor, setCurrentCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [count, setCount] = useState(0);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const searchBoxRef = useRef(null);

  // Distinct values from the DB to drive the filter dropdowns. Loaded once
  // on mount; refresh if the filter panel reopens after a large mutation.
  const [filterOpts, setFilterOpts] = useState({ batch_years: [], branches: [], companies: [] });
  useEffect(() => {
    apiFetch('/alumni/filter-options')
      .then(d => setFilterOpts({
        batch_years: d.batch_years || [],
        branches: d.branches || [],
        companies: d.companies || [],
      }))
      .catch(() => {});
  }, []);

  const fetchPage = useCallback(async (cursor, q, currentFilters, size) => {
    setLoading(true); setError('');
    try {
      const params = buildSearchParams({ q, filters: currentFilters, limit: size, cursor });
      const data = await apiFetch(`/alumni?${params.toString()}`);
      setAlumni(data.data || []);
      setCount(data.metadata?.count || data.data?.length || 0);
      setNextCursor(data.metadata?.nextCursor || null);
      setHasMore(!!data.metadata?.hasMore);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  // Initial load
  useEffect(() => { fetchPage(null, '', EMPTY_FILTERS, pageSize); }, []); // eslint-disable-line

  // Debounced auto-search when query or filters change
  useEffect(() => {
    const t = setTimeout(() => {
      setCursorStack([]);
      setCurrentCursor(null);
      fetchPage(null, query, filters, pageSize);
    }, 350);
    return () => clearTimeout(t);
  }, [query, filters, pageSize, fetchPage]);

  // Debounced suggestion fetch (≥ 2 chars)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const params = buildSearchParams({ q, filters: EMPTY_FILTERS, limit: 6 });
        const data = await apiFetch(`/alumni?${params.toString()}`);
        setSuggestions(data.data || []);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // Close suggestions on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const nextPage = () => {
    if (!hasMore || !nextCursor) return;
    setCursorStack(prev => [...prev, currentCursor]);
    setCurrentCursor(nextCursor);
    fetchPage(nextCursor, query, filters, pageSize);
  };

  const prevPage = () => {
    if (cursorStack.length === 0) return;
    const prevStack = [...cursorStack];
    const prevCursor = prevStack.pop();
    setCursorStack(prevStack);
    setCurrentCursor(prevCursor);
    fetchPage(prevCursor, query, filters, pageSize);
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const remove = async (id, name) => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      await apiFetch(`/alumni/${id}`, { method: 'DELETE' });
      setMsg('Deleted');
      fetchPage(currentCursor, query, filters, pageSize);
    } catch (e) { setError(e.message); }
  };

  const onSuggestionClick = (s) => {
    setShowSuggestions(false);
    router.push(`/alumni/${s.id}`);
  };

  const onSearchKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightedIdx >= 0) {
      e.preventDefault();
      onSuggestionClick(suggestions[highlightedIdx]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== '' && v != null).length;
  const pageNumber = cursorStack.length + 1;

  return (
    <Layout>
      <h1>Alumni</h1>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      <div className="row" style={{ marginBottom: '0.75rem', alignItems: 'center', gap: '0.75rem' }}>
        <div ref={searchBoxRef} style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setShowSuggestions(true); setHighlightedIdx(-1); }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search by name… (type 2+ letters for suggestions)"
            style={{ marginBottom: 0 }}
          />
          {showSuggestions && query.trim().length >= 2 && suggestions.length > 0 && (
            <ul style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: '#fff', border: '1px solid #e0e0e0', borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,.08)', listStyle: 'none',
              padding: '0.25rem 0', margin: 0, zIndex: 20, maxHeight: 280, overflowY: 'auto',
            }}>
              {suggestions.map((s, i) => (
                <li
                  key={s.id}
                  onMouseDown={() => onSuggestionClick(s)}
                  onMouseEnter={() => setHighlightedIdx(i)}
                  style={{
                    padding: '0.5rem 0.75rem', cursor: 'pointer',
                    background: i === highlightedIdx ? '#f3f1ff' : 'transparent',
                    fontSize: '0.875rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{s.full_name || '(unnamed)'}</div>
                  <div style={{ fontSize: '0.75rem', color: '#888' }}>
                    {[s.batch_year, s.branch, s.current_company].filter(Boolean).join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          className={`btn ${activeFilterCount > 0 ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowFilters(s => !s)}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>

        <label style={{ marginBottom: 0 }}>
          Per page:{' '}
          <select value={pageSize} onChange={e => setPageSize(parseInt(e.target.value, 10))}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      {showFilters && (
        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label>Batch year</label>
              <select
                value={filters.batch_year}
                onChange={e => setFilters(f => ({ ...f, batch_year: e.target.value }))}
                style={{ marginBottom: 0 }}
              >
                <option value="">Any ({filterOpts.batch_years.length})</option>
                {filterOpts.batch_years.map(b => (
                  <option key={b.value} value={b.value}>
                    {b.value} — {b.count.toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Branch</label>
              <select
                value={filters.branch}
                onChange={e => setFilters(f => ({ ...f, branch: e.target.value }))}
                style={{ marginBottom: 0 }}
              >
                <option value="">Any ({filterOpts.branches.length})</option>
                {filterOpts.branches.map(b => (
                  <option key={b.value} value={b.value}>
                    {b.value} — {b.count.toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Company (top 100)</label>
              {/* datalist gives a free-text + autocomplete combo so users can
                  pick from the populated companies or type a less common one. */}
              <input
                type="text"
                list="company-options"
                placeholder="Pick or type…"
                value={filters.company}
                onChange={e => setFilters(f => ({ ...f, company: e.target.value }))}
                style={{ marginBottom: 0 }}
              />
              <datalist id="company-options">
                {filterOpts.companies.map(c => (
                  <option key={c.value} value={c.value}>{c.count.toLocaleString()} alumni</option>
                ))}
              </datalist>
            </div>
            <div>
              <label>Verification</label>
              <select
                value={filters.is_verified}
                onChange={e => setFilters(f => ({ ...f, is_verified: e.target.value }))}
                style={{ marginBottom: 0 }}
              >
                <option value="">Any</option>
                <option value="true">Verified</option>
                <option value="false">Pending</option>
              </select>
            </div>
            <div>
              <label>Min completeness %</label>
              <input
                type="number"
                min={0} max={100}
                placeholder="0–100"
                value={filters.min_completeness}
                onChange={e => setFilters(f => ({ ...f, min_completeness: e.target.value }))}
                style={{ marginBottom: 0 }}
              />
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={clearFilters} disabled={activeFilterCount === 0}>
              Clear filters
            </button>
          </div>
        </div>
      )}

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
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>
                {loading ? 'Searching…' : 'No records found'}
              </td></tr>
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
          {loading && ' · loading…'}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={prevPage} disabled={loading || cursorStack.length === 0}>← Prev</button>
          <button className="btn" onClick={nextPage} disabled={loading || !hasMore}>Next →</button>
        </div>
      </div>
    </Layout>
  );
}
