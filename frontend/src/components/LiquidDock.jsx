import React from 'react';

/**
 * Apple Liquid-Glass style bottom dock — fully rounded, very light pink tint,
 * rim-lit glass. Navigation for the full-access dashboard tabs.
 */
export default function LiquidDock({ tabs, active, onChange }) {
  return (
    <nav className="liquid-dock" role="tablist" aria-label="Dashboard sections">
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
