import { ChevronRight } from 'lucide-react';
import { isComplete, matchScore, teamName } from '../../utils/matches';

export default function MatchCard({ match, onOpen }) {
  const completed = isComplete(match);
  const status = match.status || match.state || 'Live';
  return (
    <button className="match-card" onClick={() => onOpen(match)} aria-label={`View ${teamName(match, 'teamA')} versus ${teamName(match, 'teamB')}`}>
      <div className="match-card-top">
        <span className={`match-status ${completed ? 'status-done' : ''}`}>
          {!completed && <span className="live-dot" />}{completed ? 'COMPLETED' : String(status).toUpperCase()}
        </span>
        <span className="match-format">{match.format || `${match.overs || '—'} overs`}</span>
      </div>
      <div className="match-team">
        <span className="team-emblem">{teamName(match, 'teamA').slice(0, 1).toUpperCase()}</span>
        <span className="team-label">{teamName(match, 'teamA')}</span>
        <strong>{matchScore(match, 'teamA') ?? '—'}</strong>
      </div>
      <div className="match-team">
        <span className="team-emblem team-emblem-alt">{teamName(match, 'teamB').slice(0, 1).toUpperCase()}</span>
        <span className="team-label">{teamName(match, 'teamB')}</span>
        <strong>{matchScore(match, 'teamB') ?? '—'}</strong>
      </div>
      <div className="match-card-bottom">
        <span>{match.venue || (completed ? 'Match complete' : 'Tap to follow the score')}</span>
        <ChevronRight size={17} />
      </div>
    </button>
  );
}
