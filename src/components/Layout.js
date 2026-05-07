import React from 'react';
import { LayoutDashboard, Package, FolderOpen, Settings, Table2, Printer } from 'lucide-react';

const NAV = [
  { id: 'dashboard', label: 'לוח בקרה',   Icon: LayoutDashboard },
  { id: 'products',  label: 'מוצרים',     Icon: Package },
  { id: 'breakdown', label: 'פירוט מלא',  Icon: Table2 },
  { id: 'projects',  label: 'פרויקטים',   Icon: FolderOpen },
  { id: 'settings',  label: 'הגדרות',     Icon: Settings },
];

export default function Layout({ page, setPage, children, activeProject }) {
  return (
    <div className="app-layout">
      <div className="sidebar">
        <div className="sidebar-logo">
          <Package size={20} />
          עלות ממונפת
        </div>

        {activeProject && (
          <div className="sidebar-active-project">
            <FolderOpen size={13} />
            <span title={activeProject.name}>{activeProject.name}</span>
          </div>
        )}

        <nav className="sidebar-nav">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-btn ${page === id ? 'active' : ''}`}
              onClick={() => setPage(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => window.print()}>
            <Printer size={14} />
            הדפסה / PDF
          </button>
        </div>
      </div>

      <div className="main-content">{children}</div>
    </div>
  );
}
