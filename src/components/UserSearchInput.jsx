import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Shield, User, UserPlus } from 'lucide-react';

const resultItems = (value, mode) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const collections = mode === 'user'
    ? ['users', 'results', 'content', 'items', 'data']
    : ['teams', 'results', 'content', 'items', 'data'];
  for (const key of collections) {
    const collection = value[key];
    if (Array.isArray(collection)) return collection;
    if (collection && typeof collection === 'object') {
      const nested = resultItems(collection, mode);
      if (nested.length) return nested;
    }
  }
  return [];
};

function userLabel(user) {
  return user.username
    || user.name
    || user.fullName
    || [user.firstName, user.lastName].filter(Boolean).join(' ')
    || user.email
    || user.phoneNumber
    || '';
}

export default function UserSearchInput({
  onSelectUser,
  onSelectTeam,
  placeholder,
  excludedUserIds = [],
  excludedTeamIds = [],
  localUsers = [],
  localTeams = [],
  searchUsers,
  searchTeams,
  initialMode = 'user',
  allowedModes = ['user', 'team'],
  maxLength = 80,
}) {
  const [searchMode, setSearchMode] = useState(initialMode);
  const [query, setQuery] = useState('');
  const [remoteSuggestions, setRemoteSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchError, setSearchError] = useState('');
  const dropdownRef = useRef(null);
  const searchFunction = searchMode === 'user' ? searchUsers : searchTeams;
  const localItems = searchMode === 'user' ? localUsers : localTeams;
  const excludedItems = searchMode === 'user' ? excludedUserIds : excludedTeamIds;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!term || !searchFunction) return undefined;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError('');
      try {
        const response = await searchFunction(term, { signal: controller.signal });
        setRemoteSuggestions(resultItems(response, searchMode));
        setIsOpen(true);
      } catch {
        if (!controller.signal.aborted) {
          setRemoteSuggestions([]);
          setSearchError('Could not search right now. You can still add this as a guest/custom team.');
          setIsOpen(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchFunction, searchMode]);

  const suggestions = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const localMatches = localItems.filter((item) => {
      const name = searchMode === 'user'
        ? userLabel(item)
        : item.name || '';
      return name.toLocaleLowerCase().includes(term);
    });
    const all = [...localMatches, ...remoteSuggestions];
    const seen = new Set();
    return all.filter((item) => {
      const key = String(item.id ?? item.username ?? item.name ?? '').toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return !excludedItems.some((excluded) => String(excluded).toLocaleLowerCase() === key);
    });
  }, [excludedItems, localItems, query, remoteSuggestions, searchMode]);

  const selectUser = (user) => {
    const username = userLabel(user);
    const id = user.id ?? user.userId ?? user.playerId;
    if (!username) return;
    onSelectUser?.({
      id: id ?? `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      username,
      isGuest: user.isGuest ?? id == null,
      isPersisted: user.isPersisted ?? (id != null && !user.isGuest),
    });
    setQuery('');
    setRemoteSuggestions([]);
    setIsOpen(false);
  };

  const selectTeam = (team) => {
    onSelectTeam?.({ id: team.id ?? null, name: team.name, isCustom: team.id == null });
    setQuery('');
    setRemoteSuggestions([]);
    setIsOpen(false);
  };

  const addCustom = () => {
    if (!query.trim()) return;
    if (searchMode === 'user') selectUser({ username: query.trim(), isGuest: true });
    else selectTeam({ name: query.trim() });
  };

  const chooseMode = (mode) => {
    setSearchMode(mode);
    setQuery('');
    setRemoteSuggestions([]);
    setSearchError('');
    setIsOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && query.trim()) {
      event.preventDefault();
      if (suggestions.length === 1) {
        if (searchMode === 'user') selectUser(suggestions[0]);
        else selectTeam(suggestions[0]);
      } else if (!suggestions.length) {
        addCustom();
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="user-search" ref={dropdownRef}>
      {allowedModes.length > 1 && (
        <div className="user-search-modes" role="group" aria-label="Search type">
          {allowedModes.map((mode) => (
            <button
              type="button"
              key={mode}
              onClick={() => chooseMode(mode)}
              className={searchMode === mode ? 'active' : ''}
              aria-pressed={searchMode === mode}
            >
              {mode === 'user' ? <User size={14} /> : <Shield size={14} />}
              {mode === 'user' ? 'Players' : 'Teams'}
            </button>
          ))}
        </div>
      )}
      <div className="user-search-field">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          maxLength={maxLength}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setRemoteSuggestions([]);
            setSearchError('');
            setIsOpen(Boolean(event.target.value.trim()));
          }}
          onFocus={() => query.trim() && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || (searchMode === 'user' ? 'Search or add a player' : 'Search or add a team')}
          aria-label={placeholder || (searchMode === 'user' ? 'Search players' : 'Search teams')}
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />
        {loading && <span className="user-search-spinner" aria-label="Searching" />}
      </div>
      {isOpen && query.trim() && (
        <div className="user-search-results" role="listbox">
          {suggestions.map((item) => {
            const label = searchMode === 'user' ? userLabel(item) : item.name;
            const key = item.id ?? item.userId ?? item.playerId ?? item.username ?? item.name;
            return (
              <button
                type="button"
                role="option"
                aria-selected="false"
                key={key}
                onClick={() => searchMode === 'user' ? selectUser(item) : selectTeam(item)}
              >
                {searchMode === 'user' ? <User size={15} /> : <Shield size={15} />}
                <span>{searchMode === 'user' && item.username ? `@${label}` : label}</span>
              </button>
            );
          })}
          {searchError && <p className="user-search-message" role="status">{searchError}</p>}
          {!loading && suggestions.length === 0 && !searchError && !searchFunction && (
            <p className="user-search-message" role="status">
              {searchMode === 'user'
                ? 'Player directory search is not available yet. Add a player as a guest.'
                : 'Team directory search is not available yet. Add a custom team or use a quick pick.'}
            </p>
          )}
          {suggestions.length === 0 && (
            <button type="button" className="user-search-add" onClick={addCustom}>
              {searchMode === 'user' ? <UserPlus size={15} /> : <Shield size={15} />}
              Add “{query.trim()}” as {searchMode === 'user' ? 'guest player' : 'custom team'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
