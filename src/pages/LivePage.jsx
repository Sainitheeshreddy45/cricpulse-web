import { Clock3, Radio } from 'lucide-react';
import MatchCard from '../components/cricket/MatchCard';

const MATCH_STATUSES = [
  { id: 'LIVE', label: 'Live' },
  { id: 'SCHEDULED', label: 'Scheduled' },
  { id: 'COMPLETED', label: 'Completed' },
];

export default function LivePage({
  matches, status, loading, error, onStatusChange, onRetry, onOpen,
}) {
  const selectedStatus = MATCH_STATUSES.some((item) => item.id === status) ? status : 'LIVE';
  const pageTitle = MATCH_STATUSES.find((item) => item.id === selectedStatus)?.label || 'Live';

  return (
    <main className="inner-page">
      <div className="page-title">
        <span className="eyebrow"><span className="live-dot" /> THE LIVE CENTRE</span>
        <h1>{pageTitle} matches.</h1>
        <p>Follow scheduled fixtures, live scores, and completed games.</p>
      </div>
      <div className="match-status-tabs" role="tablist" aria-label="Match status">
        {MATCH_STATUSES.map((item) => (
          <button
            key={item.id}
            id={`matches-${item.id.toLowerCase()}-tab`}
            type="button"
            role="tab"
            aria-selected={selectedStatus === item.id}
            onClick={() => onStatusChange(item.id)}
          >{item.label}</button>
        ))}
      </div>
      {loading ? <div className="loading-row">Loading matches…</div>
        : error ? <div className="inline-error"><span>{error}</span><button onClick={onRetry}>Try again</button></div>
          : matches.length ? <div className="match-grid">{matches.map((match) => <MatchCard key={match.id} match={match} onOpen={onOpen} />)}</div>
            : <div className="empty-state"><div className="empty-icon"><Radio size={22} /></div><h2>No {pageTitle.toLowerCase()} matches.</h2><p>{selectedStatus === 'SCHEDULED' ? 'Matches you create will appear here before the toss.' : selectedStatus === 'COMPLETED' ? 'Completed matches will appear here.' : 'When a match gets underway, you’ll find the live score here.'}</p><span className="refresh-hint"><Clock3 size={14} /> Scores refresh when you revisit this page.</span></div>}
    </main>
  );
}
