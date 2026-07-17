import React from 'react';

/**
 * Liquid-Glass bottom dock — fully rounded, theme-aware pink tint,
 * rim-lit. Tab navigation for the full-access dashboard.
 */
export default function LiquidDock({ tabs, active, onChange }) {
  return (
    <nav className="dock" role="tablist" aria-label="Dashboard sections">
      {tabs.map(t => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={active === t.id ? 'active' : ''}
            onClick={() => onChange(t.id)}
            title={t.label}
          >
            <Icon size={18} strokeWidth={active === t.id ? 2.4 : 2} />
            <span className="dock-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
