import {
  Activity, ArrowRight, Download, Plus, Radio, Shield, Sparkles, Users,
} from 'lucide-react';
import Button from '../components/common/Button';
import MatchCard from '../components/cricket/MatchCard';
import SectionHeading from '../components/cricket/SectionHeading';
import { isComplete } from '../utils/matches';

export default function HomePage({ matches, loading, error, onPage, onCreate, onOpen, onRetry }) {
  const current = matches.filter((match) => !isComplete(match));
  return (
    <main>
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-kicker"><span className="live-dot" /> THE GAME, AS IT HAPPENS</div>
          <h1>Every ball.<br /><span>Every heartbeat.</span></h1>
          <p>Live scores, local matchdays, and the stories happening on every pitch. Follow the game or get out there and play.</p>
          <div className="hero-actions">
            <Button onClick={() => onPage('live')}><Radio size={16} /> Follow live scores</Button>
            <Button variant="outline" onClick={onCreate}><Plus size={17} /> Start a match</Button>
          </div>
          <div className="hero-note"><Shield size={15} /> Free to follow. Easy to play.</div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="hero-ball"><span /></div>
          <div className="hero-stats"><span className="stat-live"><i /> LIVE NOW</span><strong>Play the moment.</strong><small>From the first toss to the last run.</small></div>
          <div className="hero-badge"><Sparkles size={15} /> MADE FOR THE LOVE OF CRICKET</div>
        </div>
      </section>

      <section className="content-section live-preview">
        <SectionHeading eyebrow="OUT ON THE PITCH" title="Live right now" action="All live matches" onAction={() => onPage('live')} />
        {loading ? <div className="loading-row">Checking the scoreboards…</div>
          : error ? <div className="inline-error"><span>{error}</span><button onClick={onRetry}>Try again</button></div>
            : current.length ? <div className="match-grid">{current.slice(0, 3).map((match) => <MatchCard key={match.id} match={match} onOpen={onOpen} />)}</div>
              : <div className="empty-card"><div className="empty-icon"><Radio size={20} /></div><div><strong>No live matches just yet</strong><p>Check back soon, or start a game of your own.</p></div><button onClick={onCreate}>Set up a match <ArrowRight size={15} /></button></div>}
      </section>

      <section className="feature-band">
        <div className="feature-intro"><span className="eyebrow">YOUR GROUND. YOUR RULES.</span><h2>Big stadium or<br />backyard boundary.</h2><p>CricPulse makes every match feel like match day. Set your overs, get a scorekeeper, and let the good times roll.</p><button className="text-link" onClick={onCreate}>Set up your game <ArrowRight size={16} /></button></div>
        <div className="feature-list">
          <div className="feature-item"><span className="feature-icon"><Activity size={18} /></span><div><strong>Every run, in real time</strong><p>Follow the action ball by ball, wherever you are.</p></div><span className="feature-number">01</span></div>
          <div className="feature-item"><span className="feature-icon"><Users size={18} /></span><div><strong>Made for your kind of cricket</strong><p>From a quick six-over game to a full day's play.</p></div><span className="feature-number">02</span></div>
          <div className="feature-item"><span className="feature-icon"><Download size={18} /></span><div><strong>Keep the memories</strong><p>Download the finished scorecard and relive the game.</p></div><span className="feature-number">03</span></div>
        </div>
      </section>
      <section className="bottom-cta"><div><span className="eyebrow">NEXT INNINGS STARTS HERE</span><h2>Who's up for a game?</h2></div><Button onClick={onCreate}>Create a match <ArrowRight size={16} /></Button></section>
    </main>
  );
}
