/** App shell: sticky header, scrolling content area, bottom navigation. */

import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Home', glyph: '🏠' },
  { to: '/customers', label: 'Customers', glyph: '👥' },
  { to: '/check-in', label: 'Check-In', glyph: '＋', primary: true },
  { to: '/rooms', label: 'Rooms', glyph: '🚪' },
  { to: '/settings', label: 'Settings', glyph: '⚙️' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `nav-item${item.primary ? ' primary' : ''}${isActive ? ' active' : ''}`
          }
        >
          <span className="glyph" aria-hidden="true">
            {item.glyph}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Screen({
  title,
  subtitle,
  back,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Shows a back chevron; pass a path or `true` for history back. */
  back?: string | boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="app-header">
        {back ? (
          <button
            type="button"
            className="icon-button"
            aria-label="Go back"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          >
            ←
          </button>
        ) : null}
        <h1>
          {title}
          {subtitle ? <span className="sub">{subtitle}</span> : null}
        </h1>
        {action}
      </header>
      <main className="app-main">{children}</main>
      <BottomNav />
    </div>
  );
}
