export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
export const AUTH_TOKEN_KEY = 'cricpulse_token';

async function request(path, options = {}) {
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const message = await response.text();
    const error = new Error(message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response;
}

async function json(path, options) {
  const response = await request(path, options);
  return response?.json();
}

export const api = {
  getMatchesByStatus: (status = 'LIVE', options) => {
    const params = new URLSearchParams({ status });
    return json(`/api/v1/matches?${params}`, options);
  },
  getLiveMatches: (options) => api.getMatchesByStatus('LIVE', options),
  getMatch: (id) => json(`/api/v1/matches/${encodeURIComponent(id)}`),
  getLiveMatch: (id) => json(
    `/api/v1/scoring/match/${encodeURIComponent(id)}/live`,
  ),
  searchTeams: (name, options) => {
    const params = new URLSearchParams({ name });
    return json(`/api/v1/teams/search?${params}`, options);
  },
  getUserTeams: (userId, options) => json(
    `/api/v1/teams/user/${encodeURIComponent(userId)}`,
    options,
  ),
  getOpponentTeams: (userId, options) => json(
    `/api/v1/teams/user/${encodeURIComponent(userId)}/opponents`,
    options,
  ),
  getTeam: (teamId, options) => json(
    `/api/v1/teams/${encodeURIComponent(teamId)}`,
    options,
  ),
  getTeamPlayers: (teamId, options) => json(
    `/api/v1/teams/${encodeURIComponent(teamId)}/players`,
    options,
  ),
  addPlayerToTeam: (teamId, playerId) => json(
    `/api/v1/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}`,
    { method: 'POST' },
  ),
  createTeam: (team) => json('/api/v1/teams/newteam', {
    method: 'POST',
    body: JSON.stringify(team),
  }),
  createMatch: (match) => json('/api/v1/matches/newmatch', {
    method: 'POST',
    body: JSON.stringify(match),
  }),
  updateMatchStatus: (matchId, status) => {
    const params = new URLSearchParams({ status });
    return json(`/api/v1/matches/${encodeURIComponent(matchId)}/status?${params}`, {
      method: 'PATCH',
    });
  },
  startMatch: (matchId, request) => json(
    `/api/v1/matches/${encodeURIComponent(matchId)}/start`,
    {
      method: 'PUT',
      body: JSON.stringify(request),
    },
  ),
  assignScorer: (assignment) => json('/api/v1/matches/assign-scorer', {
    method: 'PUT',
    body: JSON.stringify(assignment),
  }),
  submitBall: (ball) => json('/api/v1/scoring/ball', {
    method: 'POST',
    body: JSON.stringify(ball),
  }),
  getMatchInnings: (matchId, options) => json(
    `/api/v1/matches/${encodeURIComponent(matchId)}/innings`,
    options,
  ),
  getInnings: (matchId, inningsNumber, options) => json(
    `/api/v1/matches/${encodeURIComponent(matchId)}/innings/${encodeURIComponent(inningsNumber)}`,
    options,
  ),
  getMatchSnapshots: (matchId, options) => json(
    `/api/v1/matches/${encodeURIComponent(matchId)}/innings/snapshots`,
    options,
  ),
  startSecondInnings: (matchId) => json(
    `/api/v1/matches/${encodeURIComponent(matchId)}/innings/second`,
    { method: 'POST' },
  ),
  setInningsActivePlayers: (matchId, inningsNumber, activePlayers) => json(
    `/api/v1/matches/${encodeURIComponent(matchId)}/innings/${encodeURIComponent(inningsNumber)}/active-players`,
    {
      method: 'PUT',
      body: JSON.stringify(activePlayers),
    },
  ),
  undoLastBall: (matchId, inningsNumber) => {
    const params = new URLSearchParams({
      matchId: String(matchId),
      inningsNumber: String(inningsNumber),
    });
    return json(`/api/v1/scoring/undo?${params}`, { method: 'POST' });
  },
  login: (credentials) => json('/api/v1/users/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),
  register: (details) => json('/api/v1/users/auth/register', {
    method: 'POST',
    body: JSON.stringify(details),
  }),
  searchUsers: (query, options) => {
    const params = new URLSearchParams({ query });
    return json(`/api/v1/users/auth/search?${params}`, options);
  },
  me: () => json('/api/v1/users/auth/me'),
  async downloadScorecard(matchId) {
    const response = await request(
      `/api/v1/matches/${encodeURIComponent(matchId)}/scorecard/pdf`,
    );
    const blob = await response.blob();
    const contentType = (response.headers.get('content-type') || blob.type).toLowerCase();
    if (!blob.size) throw new Error('The scorecard PDF response was empty.');
    if (contentType && !contentType.includes('pdf') && !contentType.includes('octet-stream')) {
      const message = await blob.text();
      throw new Error(message || 'The scorecard endpoint did not return a PDF.');
    }

    const disposition = response.headers.get('content-disposition') || '';
    const encodedFilename = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
    const plainFilename = disposition.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
    let filename = encodedFilename || plainFilename || `cricpulse-scorecard-${matchId}.pdf`;
    try {
      filename = decodeURIComponent(filename);
    } catch {
      // Keep the original filename if the header contains malformed encoding.
    }
    filename = filename.replace(/[\\/:*?"<>|]/g, '_').trim();
    if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
    return { blob, filename };
  },
};

export function getErrorMessage(error) {
  try {
    const payload = JSON.parse(error.message);
    return payload.message || payload.error || error.message;
  } catch {
    return error.message || 'Something went wrong. Please try again.';
  }
}
