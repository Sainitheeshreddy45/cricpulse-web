import { ArrowRight, Swords } from 'lucide-react';
import MatchCard from '../components/cricket/MatchCard';
import { getUserMatches } from '../utils/userData';

export default function MyMatchesPage({ user, liveMatches, onCreate, onOpen }) {
  const matches = getUserMatches(user).map((saved) => (
    liveMatches.find((match) => String(match.id) === String(saved.id)) || saved
  ));

  return (
    <main className="inner-page">
      <div className="page-title">
        <span className="eyebrow">YOUR CRICPULSE</span>
        <h1>My Matches.</h1>
        <p>Matches you have started on this device, all in one place.</p>
      </div>
      {matches.length ? (
        <div className="match-grid">
          {matches.map((match) => <MatchCard key={match.id} match={match} onOpen={onOpen} />)}
        </div>
      ) : (
        <section className="empty-state my-matches-empty">
          <div className="empty-icon"><Swords size={22} /></div>
          <h2>Your scorebook is ready.</h2>
          <p>Start a match and it will be saved here for you.</p>
          <button className="text-link" onClick={onCreate}>Start a match <ArrowRight size={16} /></button>
        </section>
      )}
    </main>
  );
}
