import { useState } from 'react';
import {
  Activity, ChevronDown, LogOut, Menu, Settings, Swords, UserRound, X,
} from 'lucide-react';

export default function Header({ user, page, onPage, onAuth, onLogout, onCreate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const nav = (next) => {
    onPage(next);
    setMenuOpen(false);
  };
  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="wordmark" onClick={() => nav('live')} aria-label="CricPulse live matches">
          <span className="brand-mark"><Activity size={19} strokeWidth={2.5} /></span>
          <span>cric<span>pulse</span><i>.</i></span>
        </button>
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav className={`main-nav ${menuOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
          <button className={['live', 'match', 'my-matches'].includes(page) ? 'nav-active' : ''} onClick={() => nav('live')}>
            <span className="live-dot" /> Live Matches
          </button>
          <button className="start-match-tab" onClick={() => { onCreate(); setMenuOpen(false); }}>
            Start a match
          </button>
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <div className="account-menu">
                <button className="user-chip" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen} aria-haspopup="menu">
                  <span className="user-avatar">{(user.name || user.firstName || user.username || 'C').slice(0, 1).toUpperCase()}</span>
                  <span className="user-name">{user.name || user.username || 'My account'}</span>
                  <ChevronDown size={14} />
                </button>
                {accountOpen && (
                  <div className="account-dropdown" role="menu">
                    <button role="menuitem" onClick={() => { nav('my-matches'); setAccountOpen(false); }}><Swords size={15} /> My Matches</button>
                    <button role="menuitem" onClick={() => { nav('settings'); setAccountOpen(false); }}><Settings size={15} /> Settings</button>
                    <button role="menuitem" onClick={() => { onLogout(); setAccountOpen(false); }}><LogOut size={15} /> Sign out</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button className="header-auth" onClick={onAuth}><UserRound size={16} /> Sign in</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
