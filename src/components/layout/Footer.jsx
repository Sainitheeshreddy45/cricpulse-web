import { Activity } from 'lucide-react';

export default function Footer({ onPage, onAuth }) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <button className="wordmark footer-brand" onClick={() => onPage('live')}>
          <span className="brand-mark"><Activity size={17} strokeWidth={2.5} /></span>
          <span>cric<span>pulse</span><i>.</i></span>
        </button>
        <p>For every game, on every ground.</p>
        <div className="footer-links">
          <button onClick={() => onPage('live')}>Live Matches</button>
          <button onClick={onAuth}>Your account</button>
          <span>© {new Date().getFullYear()} CricPulse</span>
        </div>
      </div>
    </footer>
  );
}
