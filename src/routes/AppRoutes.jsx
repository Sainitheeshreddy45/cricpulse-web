import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../api';
import AuthDialog from '../components/auth/AuthDialog';
import Footer from '../components/layout/Footer';
import Header from '../components/layout/Header';
import MatchSetup from '../components/cricket/MatchSetup';
import { useAuth } from '../hooks/useAuth';
import HomePage from '../pages/HomePage';
import LivePage from '../pages/LivePage';
import MatchPage from '../pages/MatchPage';
import MyMatchesPage from '../pages/MyMatchesPage';
import SettingsPage from '../pages/SettingsPage';
import { unwrapMatch, unwrapMatches } from '../utils/matches';
import { saveUserMatch } from '../utils/userData';
import { matchService } from '../services/matchService';
import { teamService } from '../services/teamService';

const PLAYER_LIST_KEYS = ['players', 'playerList', 'roster', 'members', 'results', 'content', 'items', 'data'];

function unwrapPlayers(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;
  for (const key of PLAYER_LIST_KEYS) {
    if (value[key] !== undefined) {
      const players = unwrapPlayers(value[key]);
      if (players) return players;
    }
  }
  return null;
}

function teamFor(match, slot) {
  const teamIndex = slot === 'teamA' ? 0 : 1;
  const candidates = [
    match[slot],
    match[slot === 'teamA' ? 'team_a' : 'team_b'],
    match.teams?.[teamIndex],
  ];
  return candidates.find((candidate) => candidate && typeof candidate === 'object') ?? null;
}

function teamIdFor(match, slot) {
  const team = teamFor(match, slot);
  return match[`${slot}Id`]
    ?? match[slot === 'teamA' ? 'team_a_id' : 'team_b_id']
    ?? team?.id
    ?? team?.teamId
    ?? team?.team_id;
}

function embeddedPlayersFor(match, slot) {
  const team = teamFor(match, slot);
  const key = slot === 'teamA' ? 'team_a_players' : 'team_b_players';
  return unwrapPlayers(
    match[`${slot}Players`]
      ?? match[`${slot}players`]
      ?? match[key]
      ?? team?.players
      ?? match.squad_stats?.[key]
      ?? match.squadStats?.[slot === 'teamA' ? 'teamAPlayers' : 'teamBPlayers'],
  );
}

async function loadMatchBundle(matchId) {
  const match = unwrapMatch(await matchService.getMatch(matchId));
  if (!match || typeof match !== 'object') {
    throw new Error('The match response did not contain match details.');
  }

  const teamAId = teamIdFor(match, 'teamA');
  const teamBId = teamIdFor(match, 'teamB');
  const [teamAPlayers, teamBPlayers] = await Promise.all([
    embeddedPlayersFor(match, 'teamA') ?? (teamAId != null ? teamService.getPlayers(teamAId).then(unwrapPlayers) : []),
    embeddedPlayersFor(match, 'teamB') ?? (teamBId != null ? teamService.getPlayers(teamBId).then(unwrapPlayers) : []),
  ]);

  return {
    ...match,
    teamAPlayers: teamAPlayers ?? [],
    teamBPlayers: teamBPlayers ?? [],
    rostersLoaded: true,
  };
}

function readRoute(pathname = window.location.pathname) {
  const matchRoute = pathname.match(/^\/matches\/([^/]+)\/?$/);
  if (matchRoute) return { page: 'match', matchId: decodeURIComponent(matchRoute[1]) };
  if (/^\/live\/?$/.test(pathname)) return { page: 'live', matchId: null };
  if (/^\/create-match\/?$/.test(pathname)) return { page: 'create-match', matchId: null };
  if (/^\/my-matches\/?$/.test(pathname)) return { page: 'my-matches', matchId: null };
  if (/^\/settings\/?$/.test(pathname)) return { page: 'settings', matchId: null };
  return { page: 'home', matchId: null };
}

export default function AppRoutes() {
  const { user, signIn, signOut, updateUser } = useAuth();
  const [route, setRoute] = useState(() => readRoute());
  const [matchesStatus, setMatchesStatus] = useState('LIVE');
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState('');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);

  const navigatePath = useCallback((path) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setMatchesError('');
    setRoute(readRoute(path));
  }, []);

  useEffect(() => {
    const handlePopState = () => setRoute(readRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const loadMatches = useCallback(async () => {
    setMatchesLoading(true);
    setMatchesError('');
    try {
      setMatches(unwrapMatches(await matchService.getByStatus(matchesStatus)));
    } catch (error) {
      setMatchesError(getErrorMessage(error));
    } finally {
      setMatchesLoading(false);
    }
  }, [matchesStatus]);

  // Initial route data is loaded through the same retryable path as the refresh action.
  // oxlint-disable react/set-state-in-effect
  useEffect(() => {
    if (['home', 'live', 'my-matches'].includes(route.page)) loadMatches();
  }, [loadMatches, route.page]);
  // oxlint-enable react/set-state-in-effect

  useEffect(() => {
    if (!route.matchId) {
      return;
    }
    let active = true;
    loadMatchBundle(route.matchId)
      .then((match) => { if (active) setSelectedMatch(match); })
      .catch((error) => {
        if (active) {
          setMatchesError(getErrorMessage(error));
          setSelectedMatch(null);
        }
      });
    return () => { active = false; };
  }, [route.matchId]);

  const navigatePage = (page) => {
    const paths = { live: '/live', 'my-matches': '/my-matches', settings: '/settings' };
    navigatePath(paths[page] || '/');
  };
  const createMatch = () => navigatePath('/create-match');
  const openMatch = (match) => {
    const normalizedMatch = unwrapMatch(match);
    const matchId = normalizedMatch?.matchId ?? normalizedMatch?.id;
    if (!matchId) return;
    setSelectedMatch(normalizedMatch);
    navigatePath(`/matches/${encodeURIComponent(matchId)}`);
  };
  const onCreated = (match) => {
    const normalizedMatch = unwrapMatch(match);
    const matchId = normalizedMatch?.matchId ?? normalizedMatch?.id;
    if (matchId) {
      saveUserMatch(user, normalizedMatch);
      setSelectedMatch(normalizedMatch);
      navigatePath(`/matches/${encodeURIComponent(matchId)}`);
    } else {
      navigatePage('live');
    }
    loadMatches();
  };
  const reloadMatch = useCallback((id, updatedResponse) => {
    if (updatedResponse) {
      const responseMatch = unwrapMatch(updatedResponse);
      if (!responseMatch || typeof responseMatch !== 'object') {
        setMatchesError('The match was updated, but the response did not contain match details.');
        return;
      }
      const updatedMatch = { ...responseMatch, id: responseMatch.id ?? id };
      setSelectedMatch((current) => (
        String(current?.id) === String(id) ? { ...current, ...updatedMatch } : updatedMatch
      ));
      setMatches((current) => {
        const exists = current.some((match) => String(match.id) === String(id));
        return exists
          ? current.map((match) => (String(match.id) === String(id) ? { ...match, ...updatedMatch } : match))
          : [updatedMatch, ...current];
      });
      return;
    }
    if (id) {
      loadMatchBundle(id)
        .then((match) => setSelectedMatch(match))
        .catch((error) => setMatchesError(getErrorMessage(error)));
    }
  }, []);
  const retryMatch = () => {
    if (!route.matchId) return;
    setMatchesError('');
    setSelectedMatch(null);
    loadMatchBundle(route.matchId)
      .then((match) => setSelectedMatch(match))
      .catch((error) => setMatchesError(getErrorMessage(error)));
  };

  let currentPage;
  if (route.page === 'live') {
    currentPage = <LivePage
      matches={matches}
      status={matchesStatus}
      loading={matchesLoading}
      error={matchesError}
      onStatusChange={setMatchesStatus}
      onRetry={loadMatches}
      onOpen={openMatch}
    />;
  } else if (route.page === 'create-match') {
    currentPage = <MatchSetup user={user} onClose={() => navigatePage('live')} onRequireAuth={() => setAuthOpen(true)} onCreated={onCreated} />;
  } else if (route.page === 'match') {
    currentPage = String(selectedMatch?.id) === route.matchId && selectedMatch?.rostersLoaded
      ? <MatchPage match={selectedMatch} matchId={route.matchId} user={user} onAuth={() => setAuthOpen(true)} onBack={() => navigatePage('live')} onReload={reloadMatch} />
      : <main className="inner-page">{matchesError ? <div className="inline-error"><span>{matchesError}</span><button onClick={retryMatch}>Try again</button></div> : <div className="loading-row">Loading match…</div>}</main>;
  } else if (route.page === 'my-matches') {
    currentPage = <MyMatchesPage user={user} liveMatches={matches} onCreate={createMatch} onOpen={openMatch} />;
  } else if (route.page === 'settings') {
    currentPage = user
      ? <SettingsPage user={user} onUpdate={updateUser} />
      : <main className="inner-page"><div className="empty-state"><h2>Sign in to manage your profile.</h2><button className="text-link" onClick={() => setAuthOpen(true)}>Sign in <span aria-hidden="true">→</span></button></div></main>;
  } else {
    currentPage = <HomePage matches={matches} loading={matchesLoading} error={matchesError} onPage={navigatePage} onCreate={createMatch} onOpen={openMatch} onRetry={loadMatches} />;
  }

  return (
    <div className="app-shell">
      <Header user={user} page={route.page} onPage={navigatePage} onAuth={() => setAuthOpen(true)} onLogout={signOut} onCreate={createMatch} />
      {currentPage}
      <Footer onPage={navigatePage} onAuth={() => setAuthOpen(true)} />
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} onSuccess={(account) => { signIn(account); setAuthOpen(false); }} />}
    </div>
  );
}
