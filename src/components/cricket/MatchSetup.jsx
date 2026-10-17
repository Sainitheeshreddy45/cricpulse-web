import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CircleHelp, Plus, Search, Shield, Trophy, UserRound,
} from 'lucide-react';
import { getErrorMessage } from '../../api';
import { authService } from '../../services/authService';
import { matchService } from '../../services/matchService';
import { teamService } from '../../services/teamService';
import { unwrapMatch } from '../../utils/matches';
import Button from '../common/Button';
import UserSearchInput from '../UserSearchInput';

const LIST_KEYS = [
  'teams', 'teamList', 'userTeams', 'players', 'playerList', 'roster',
  'results', 'content', 'items', 'members', 'data',
];

function unwrapList(value, keys = LIST_KEYS) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of keys) {
    if (value[key] !== undefined) {
      const result = unwrapList(value[key], keys);
      if (result.length) return result;
    }
  }
  return [];
}

function normalizeTeam(team) {
  if (!team || typeof team !== 'object') return null;
  const id = team.id ?? team.teamId;
  const name = team.name ?? team.teamName ?? team.displayName;
  return name ? { ...team, id: id ?? null, name: String(name) } : null;
}

function normalizePlayer(player, index) {
  if (typeof player === 'string') {
    return { id: `player-${index}-${player}`, username: player, isGuest: false, isPersisted: false };
  }
  if (!player || typeof player !== 'object') return null;
  const username = player.username ?? player.name ?? player.fullName ?? player.displayName;
  if (!username) return null;
  const playerId = player.id ?? player.userId ?? player.playerId;
  return {
    ...player,
    id: playerId ?? `player-${index}-${username}`,
    username: String(username),
    isGuest: false,
    isPersisted: playerId != null,
  };
}

function TeamPicker({
  slot,
  title,
  team,
  ownTeams,
  ownTeamsLoading,
  ownTeamsError,
  hasUserId,
  canCreateTeam,
  userId,
  excludedTeamId,
  onSelect,
  onTeamCreated,
}) {
  const [tab, setTab] = useState('yours');
  const [query, setQuery] = useState('');
  const [opponentTeams, setOpponentTeams] = useState([]);
  const [opponentsLoading, setOpponentsLoading] = useState(false);
  const [opponentsError, setOpponentsError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const searchId = `team-search-${slot}`;

  useEffect(() => {
    if (tab !== 'opponents' || userId == null) return undefined;
    const controller = new AbortController();
    // oxlint-disable react/set-state-in-effect -- loading state reflects this external request.
    setOpponentsLoading(true);
    setOpponentsError('');
    // oxlint-enable react/set-state-in-effect
    teamService.getOpponentTeams(userId, { signal: controller.signal })
      .then((response) => {
        setOpponentTeams(unwrapList(response, LIST_KEYS).map(normalizeTeam).filter(Boolean));
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setOpponentTeams([]);
          setOpponentsError(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setOpponentsLoading(false);
      });
    return () => controller.abort();
  }, [tab, userId]);

  const createTeam = async () => {
    const name = newTeamName.trim();
    if (creatingTeam) return;
    if (!canCreateTeam) {
      setSearchError('Sign in to create a team.');
      return;
    }
    if (!name) {
      setSearchError('Enter a team name before adding it.');
      return;
    }
    setCreatingTeam(true);
    setSearchError('');
    try {
      const response = await teamService.createTeam(name);
      const createdTeam = normalizeTeam(response?.team ?? response?.data?.team ?? response?.data ?? response);
      if (!createdTeam) {
        throw new Error('The team was created, but the server response did not include a team name.');
      }
      setNewTeamName('');
      onTeamCreated(createdTeam);
    } catch (error) {
      setSearchError(getErrorMessage(error));
    } finally {
      setCreatingTeam(false);
    }
  };
  const chooseTab = (nextTab) => {
    setTab(nextTab);
    setQuery('');
    setSearchError('');
  };
  const select = (candidate) => {
    if (String(candidate.id) === String(excludedTeamId)) return;
    onSelect(candidate);
  };
  const sourceTeams = tab === 'yours' ? ownTeams : opponentTeams;
  const visibleTeams = sourceTeams
    .filter((candidate) => String(candidate.id) !== String(excludedTeamId))
    .filter((candidate) => tab !== 'opponents'
      || candidate.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return (
    <section className="setup-team-card" aria-label={title}>
      <div className="setup-team-heading">
        <span className="setup-team-icon"><Shield size={15} /></span>
        <div><span>{title}</span><strong title={team.name}>{team.name || 'Choose a team'}</strong></div>
      </div>
      {team.id && <p className="team-selection-status">Team selected · squad loads below</p>}
      <div className="team-picker-tabs" role="tablist" aria-label={`${title} team source`}>
        {[
          ['yours', 'Your Teams'],
          ['opponents', 'Opponent Teams'],
          ['add', 'Add Team'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${slot}-${value}-tab`}
            aria-selected={tab === value}
            aria-controls={`${slot}-team-panel`}
            onClick={() => chooseTab(value)}
          >{label}</button>
        ))}
      </div>
      <div className="team-picker-panel" id={`${slot}-team-panel`} role="tabpanel" aria-labelledby={`${slot}-${tab}-tab`}>
        {tab === 'yours' && (
          <>
            {ownTeamsLoading && <p className="team-picker-message" role="status">Loading your teams…</p>}
            {!ownTeamsLoading && ownTeamsError && <p className="team-picker-message form-error" role="alert">{ownTeamsError}</p>}
            {!ownTeamsLoading && !ownTeamsError && !ownTeams.length && (
              <p className="team-picker-message">
                {hasUserId
                  ? 'No teams found for your account. Search Opponent Teams or add a team.'
                  : 'Sign in to view your teams. You can still search the team directory.'}
              </p>
            )}
            <TeamOptions teams={visibleTeams} selectedId={team.id} onSelect={select} />
          </>
        )}
        {tab === 'opponents' && (
          <>
            {!hasUserId && <p className="team-picker-message" role="status">Sign in to view opponent teams.</p>}
            {opponentsLoading && <p className="team-picker-message" role="status">Loading opponent teams…</p>}
            {!opponentsLoading && opponentsError && <p className="team-picker-message form-error" role="alert">{opponentsError}</p>}
            <label className="team-search-field" htmlFor={searchId}>
              <Search size={15} aria-hidden="true" />
              <input
                id={searchId}
                type="search"
                value={query}
                maxLength={60}
                placeholder="Search teams by name"
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
            </label>
            {query.trim() && !opponentsLoading && !opponentsError && visibleTeams.length === 0 && (
              <p className="team-picker-message" role="status">No matching teams found.</p>
            )}
            <TeamOptions teams={visibleTeams} selectedId={team.id} onSelect={select} />
          </>
        )}
        {tab === 'add' && (
          <div className="team-add-form">
            <label htmlFor={`${slot}-new-team`}>New team name</label>
            <input
              id={`${slot}-new-team`}
              value={newTeamName}
              maxLength={40}
              placeholder="Enter a team name"
              onChange={(event) => setNewTeamName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  createTeam();
                }
              }}
            />
            <button type="button" onClick={createTeam} disabled={creatingTeam}>
              <Plus size={14} /> {creatingTeam ? 'Creating…' : 'Add team'}
            </button>
            {!canCreateTeam && <p className="team-picker-message" role="status">Sign in to create a team.</p>}
            {searchError && <p id={`${slot}-team-create-error`} className="team-picker-message form-error" role="alert">{searchError}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function TeamOptions({ teams, selectedId, onSelect }) {
  if (!teams.length) return null;
  return (
    <ul className="team-picker-options" aria-label="Available teams">
      {teams.map((team, index) => (
        <li key={team.id ?? `${team.name}-${index}`}>
          <button type="button" className={String(selectedId) === String(team.id) ? 'selected' : ''} onClick={() => onSelect(team)}>
            <Shield size={14} aria-hidden="true" />
            <span>{team.name}</span>
            {String(selectedId) === String(team.id) && <span className="team-option-selected">Selected</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function MatchSetup({ onClose, onRequireAuth, user, onCreated }) {
  const [teamA, setTeamA] = useState({ id: null, name: '' });
  const [teamB, setTeamB] = useState({ id: null, name: '' });
  const [playersA, setPlayersA] = useState([]);
  const [playersB, setPlayersB] = useState([]);
  const [rosterLoading, setRosterLoading] = useState({ teamA: false, teamB: false });
  const [ownTeams, setOwnTeams] = useState([]);
  const [ownTeamsLoading, setOwnTeamsLoading] = useState(false);
  const [ownTeamsError, setOwnTeamsError] = useState('');
  const [activeTeamSlot, setActiveTeamSlot] = useState('teamA');
  const [activeRoster, setActiveRoster] = useState('teamA');
  const [overs, setOvers] = useState(6);
  const [venue, setVenue] = useState('');
  const [customOvers, setCustomOvers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [error, setError] = useState('');
  const rosterRequests = useRef({});
  const userId = user?.id ?? user?.userId;
  const selectableOwnTeams = userId != null && !ownTeamsLoading && !ownTeamsError ? ownTeams : [];
  const teamsAreLoading = userId != null && ownTeamsLoading;
  const teamListError = userId == null ? '' : ownTeamsError;
  const knownPlayers = useMemo(() => [...playersA, ...playersB], [playersA, playersB]);
  const activePlayers = activeRoster === 'teamA' ? playersA : playersB;
  const setActivePlayers = activeRoster === 'teamA' ? setPlayersA : setPlayersB;
  const activeTeam = activeRoster === 'teamA' ? teamA : teamB;

  useEffect(() => {
    if (userId == null) return undefined;
    const controller = new AbortController();
    // oxlint-disable react/set-state-in-effect -- loading state reflects this external request.
    setOwnTeamsLoading(true);
    setOwnTeamsError('');
    // oxlint-enable react/set-state-in-effect
    teamService.getUserTeams(userId, { signal: controller.signal })
      .then((response) => setOwnTeams(
        unwrapList(response, LIST_KEYS)
          .map(normalizeTeam).filter(Boolean),
      ))
      .catch((requestError) => {
        if (!controller.signal.aborted) setOwnTeamsError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setOwnTeamsLoading(false);
      });
    return () => controller.abort();
  }, [userId]);

  const selectTeam = async (slot, selectedTeam) => {
    const setter = slot === 'teamA' ? setTeamA : setTeamB;
    const setPlayers = slot === 'teamA' ? setPlayersA : setPlayersB;
    rosterRequests.current[slot]?.abort();
    setter(selectedTeam);
    setPlayers([]);
    setRosterLoading((loading) => ({ ...loading, [slot]: false }));
    setError('');
    if (selectedTeam.id == null) return;
    const controller = new AbortController();
    rosterRequests.current[slot] = controller;
    setRosterLoading((loading) => ({ ...loading, [slot]: true }));
    try {
      const response = await teamService.getPlayers(selectedTeam.id, { signal: controller.signal });
      const roster = unwrapList(response, LIST_KEYS)
        .map(normalizePlayer).filter(Boolean);
      setPlayers(roster);
    } catch (requestError) {
      if (!controller.signal.aborted) setError(`Could not load ${selectedTeam.name} players: ${getErrorMessage(requestError)}`);
    } finally {
      if (!controller.signal.aborted) {
        setRosterLoading((loading) => ({ ...loading, [slot]: false }));
        if (rosterRequests.current[slot] === controller) delete rosterRequests.current[slot];
      }
    }
  };

  const addPlayer = async (player) => {
    if (activeTeam.id != null && player.isPersisted) {
      setAddingPlayer(true);
      setError('');
      try {
        await teamService.addPlayer(activeTeam.id, player.id);
        const removeFromOtherRoster = activeRoster === 'teamA' ? setPlayersB : setPlayersA;
        removeFromOtherRoster((players) => players.filter((item) => String(item.id) !== String(player.id)));
      } catch (requestError) {
        setError(`Could not add ${player.username} to ${activeTeam.name}: ${getErrorMessage(requestError)}`);
        return;
      } finally {
        setAddingPlayer(false);
      }
    }
    setActivePlayers((players) => (
      players.some((item) => String(item.id) === String(player.id)) ? players : [...players, player]
    ));
  };

  const create = async (event) => {
    event.preventDefault();
    if (!teamA.name.trim() || !teamB.name.trim()) {
      setError('Choose a team for both sides before creating the match.');
      return;
    }
    if (teamA.id == null || teamB.id == null) {
      setError('Select saved teams for both sides before creating the match.');
      return;
    }
    if (!user || userId == null) { onRequireAuth(); return; }
    setBusy(true);
    setError('');
    try {
      const match = unwrapMatch(await matchService.createMatch({
        teamAId: teamA.id == null ? null : String(teamA.id),
        teamBId: teamB.id == null ? null : String(teamB.id),
        teamAName: teamA.name.trim(),
        teamBName: teamB.name.trim(),
        venue: venue.trim(),
        totalOvers: Number(overs),
        scorerId: userId == null ? null : String(userId),
      }));
      onCreated(match);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="inner-page match-setup-page">
      <button className="back-link" type="button" onClick={onClose}><ArrowLeft size={15} /> Back to live matches</button>
      <div className="page-title match-setup-title">
        <div className="dialog-icon icon-lime"><Trophy size={21} /></div>
        <span className="eyebrow">GULLY CRICKET SETUP</span>
        <h1 id="setup-title">Set up your match.</h1>
        <p className="dialog-subtitle">A few details, then you&apos;re ready for the first ball.</p>
      </div>
      <form onSubmit={create} className="form-stack match-setup-form">
        <section className="setup-team-selection" aria-label="Choose match teams">
          <div className="team-selection-steps" role="group" aria-label="Team selection progress">
            <button
              type="button"
              className={activeTeamSlot === 'teamA' ? 'active' : teamA.name ? 'complete' : ''}
              onClick={() => setActiveTeamSlot('teamA')}
              aria-current={activeTeamSlot === 'teamA' ? 'step' : undefined}
            >
              <span>1</span>
              <span><small>TEAM A</small><strong>{teamA.name || 'Choose a team'}</strong></span>
            </button>
            <span className="team-selection-connector" aria-hidden="true" />
            <button
              type="button"
              className={activeTeamSlot === 'teamB' ? 'active' : teamB.name ? 'complete' : ''}
              onClick={() => setActiveTeamSlot('teamB')}
              disabled={!teamA.name}
              aria-current={activeTeamSlot === 'teamB' ? 'step' : undefined}
            >
              <span>2</span>
              <span><small>TEAM B</small><strong>{teamB.name || 'Choose a team'}</strong></span>
            </button>
          </div>
          {activeTeamSlot === 'teamA' ? (
            <TeamPicker
              slot="teamA"
              title="Select Team A"
              team={teamA}
              ownTeams={selectableOwnTeams}
              ownTeamsLoading={teamsAreLoading}
              ownTeamsError={teamListError}
              hasUserId={userId != null}
              canCreateTeam={Boolean(user)}
              userId={userId}
              excludedTeamId={teamB.id}
              onSelect={(selectedTeam) => {
                selectTeam('teamA', selectedTeam);
                setActiveRoster('teamA');
                setActiveTeamSlot('teamB');
              }}
              onTeamCreated={(createdTeam) => {
                setOwnTeams((teams) => [...teams.filter((item) => String(item.id) !== String(createdTeam.id)), createdTeam]);
                selectTeam('teamA', createdTeam);
                setActiveRoster('teamA');
                setActiveTeamSlot('teamB');
              }}
            />
          ) : (
            <TeamPicker
              slot="teamB"
              title="Select Team B"
              team={teamB}
              ownTeams={selectableOwnTeams}
              ownTeamsLoading={teamsAreLoading}
              ownTeamsError={teamListError}
              hasUserId={userId != null}
              canCreateTeam={Boolean(user)}
              userId={userId}
              excludedTeamId={teamA.id}
              onSelect={(selectedTeam) => {
                selectTeam('teamB', selectedTeam);
                setActiveRoster('teamB');
              }}
              onTeamCreated={(createdTeam) => {
                setOwnTeams((teams) => [...teams.filter((item) => String(item.id) !== String(createdTeam.id)), createdTeam]);
                selectTeam('teamB', createdTeam);
                setActiveRoster('teamB');
              }}
            />
          )}
        </section>

        <section className="setup-players" aria-labelledby="players-title">
          <div className="setup-section-heading">
            <div><span className="eyebrow">SQUADS</span><strong id="players-title">Team players</strong></div>
            <div className="setup-roster-switch" role="group" aria-label="Choose team roster">
              <button type="button" className={activeRoster === 'teamA' ? 'active' : ''} onClick={() => setActiveRoster('teamA')} aria-pressed={activeRoster === 'teamA'}>{teamA.name || 'Team one'}</button>
              <button type="button" className={activeRoster === 'teamB' ? 'active' : ''} onClick={() => setActiveRoster('teamB')} aria-pressed={activeRoster === 'teamB'}>{teamB.name || 'Team two'}</button>
            </div>
          </div>
          <UserSearchInput
            initialMode="user"
            allowedModes={['user']}
            placeholder={`Add a player to ${activeTeam.name || 'this team'}`}
            localUsers={knownPlayers}
            excludedUserIds={activePlayers.flatMap((player) => [player.id, player.username])}
            searchUsers={authService.searchUsers}
            onSelectUser={addPlayer}
          />
          {addingPlayer && <p className="setup-roster-empty" role="status">Adding player to {activeTeam.name}…</p>}
          {rosterLoading[activeRoster] && <p className="setup-roster-empty" role="status">Loading team players…</p>}
          {activePlayers.length > 0 ? (
            <ul className="setup-player-list" aria-label={`${activeRoster === 'teamA' ? teamA.name || 'Team one' : teamB.name || 'Team two'} players`}>
              {activePlayers.map((player) => (
                <li key={player.id}>
                  <span className="setup-player-avatar"><UserRound size={14} /></span>
                  <span>{player.username}</span>
                  {player.isGuest && <small>Guest</small>}
                  <button
                    type="button"
                    aria-label={`Remove ${player.username}`}
                    onClick={() => setActivePlayers((players) => players.filter((item) => item.id !== player.id))}
                  >×</button>
                </li>
              ))}
            </ul>
          ) : !rosterLoading[activeRoster] ? (
            <p className="setup-roster-empty">
              {(activeRoster === 'teamA' ? teamA.name : teamB.name)
                ? 'No players returned for this team yet.'
                : 'Choose a team to load its players.'}
            </p>
          ) : null}
          <p className="setup-integration-note">Players selected here are added to their teams. Match creation uses the selected team IDs and names.</p>
        </section>
        <label className="match-venue-field">
          Venue
          <input
            type="text"
            maxLength={120}
            value={venue}
            onChange={(event) => setVenue(event.target.value)}
            placeholder="Enter match venue (optional)"
          />
        </label>
        <div className="overs-label"><span>Overs per innings</span><button type="button" className={`toggle ${customOvers ? 'toggle-on' : ''}`} onClick={() => setCustomOvers(!customOvers)} aria-pressed={customOvers}><span /> Custom</button></div>
        {customOvers
          ? <label className="sr-only" htmlFor="custom-overs">Number of overs</label>
          : null}
        {customOvers
          ? <input id="custom-overs" className="overs-input" type="number" min="1" max="50" required value={overs} onChange={(event) => setOvers(event.target.value)} />
          : <div className="overs-picker" role="group" aria-label="Select overs">{[5, 6, 8, 10, 20].map((count) => <button type="button" key={count} className={Number(overs) === count ? 'selected' : ''} onClick={() => setOvers(count)}>{count}</button>)}</div>}
        {!user && <p className="setup-note"><CircleHelp size={15} /> Sign in is required to start scoring this match.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Creating match…' : user ? 'Create match' : 'Sign in to continue'}<ArrowRight size={16} /></Button>
      </form>
    </main>
  );
}
