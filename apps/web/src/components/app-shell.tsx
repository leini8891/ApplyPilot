import Link from 'next/link';
import { PropsWithChildren } from 'react';

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/picks', label: 'Daily Picks' },
  { href: '/settings', label: 'Profile & Settings' },
  { href: '/runs', label: 'Automation Lab' },
  { href: '/applications', label: 'Applications' },
  { href: '/interviews', label: 'Interviews' },
  { href: '/knowledge-base', label: 'Knowledge Base' },
];

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <p className="eyebrow">ApplyPilot</p>
          <h1>Your job search copilot</h1>
          <p>Recommendation-first job search support, with manual apply kept calm and deliberate.</p>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <Link className="nav-link" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="content-shell">
        <header className="page-header">
          <div>
            <p className="eyebrow">Single-user MVP</p>
            <h2>Review the shortlist, keep the process human</h2>
          </div>
          <div className="page-header-note">
            Daily picks are now the mainline: parse your resume, tune preferences, then review the best roles before applying manually.
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
