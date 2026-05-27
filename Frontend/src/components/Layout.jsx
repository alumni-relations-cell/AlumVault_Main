import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getUser, logout } from '../lib/api';

const navLinks = [
  { href: '/dashboard',  label: 'Dashboard' },
  { href: '/alumni',     label: 'Alumni' },
  { href: '/import',     label: 'Import' },
  { href: '/review',     label: 'Review Queue' },
  { href: '/campaigns',  label: 'Campaigns' },
  { href: '/users',      label: 'Users' },
  { href: '/audit',      label: 'Audit Log' },
  { href: '/admin',      label: 'Admin' },
];

export default function Layout({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const u = getUser();
    if (!u) { router.push('/login'); return; }
    setUser(u);
  }, []);

  if (!user) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: '#1e1e2e', color: '#cdd6f4', display: 'flex', flexDirection: 'column', padding: '1rem 0', flexShrink: 0 }}>
        <div style={{ padding: '0 1rem 1.5rem', fontWeight: 700, fontSize: '1.1rem', borderBottom: '1px solid #313244' }}>
          AUDMP
          <div style={{ fontSize: '0.72rem', color: '#6c7086', fontWeight: 400, marginTop: 2 }}>{user.role}</div>
        </div>
        <nav style={{ flex: 1, marginTop: '0.5rem' }}>
          {navLinks.map(l => (
            <Link key={l.href} href={l.href} style={{
              display: 'block', padding: '0.6rem 1rem', textDecoration: 'none',
              color: router.pathname.startsWith(l.href) ? '#cba6f7' : '#cdd6f4',
              background: router.pathname.startsWith(l.href) ? '#313244' : 'transparent',
              borderLeft: router.pathname.startsWith(l.href) ? '3px solid #cba6f7' : '3px solid transparent',
              fontSize: '0.9rem',
            }}>{l.label}</Link>
          ))}
        </nav>
        <div style={{ padding: '1rem', borderTop: '1px solid #313244' }}>
          <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem', color: '#a6adc8' }}>{user.name}</div>
          <button onClick={logout} style={{ width: '100%', padding: '0.4rem', background: '#313244', color: '#f38ba8', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem' }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '2rem', background: '#f5f5f5', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
