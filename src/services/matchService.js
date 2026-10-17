import { api } from '../api';

const pendingMatchLists = new Map();
const pendingMatchRequests = new Map();

function  requestOnce(requests, key, request) {
  if (!requests.has(key)) {
    const pending = request().finally(() => requests.delete(key));
    requests.set(key, pending);
  }
  return requests.get(key);
}

export const matchService = {
  getLiveMatches: () => matchService.getByStatus('LIVE'),
  getByStatus: (status) => {
    const key = String(status).toUpperCase();
    return requestOnce(pendingMatchLists, key, () => api.getMatchesByStatus(key));
  },
  getMatch: (id) => requestOnce(pendingMatchRequests, `match:${id}`, () => api.getMatch(id)),
  getLiveState: (id) => api.getLiveMatch(id),
  createMatch: (details) => api.createMatch(details),
  updateStatus: (matchId, status) => api.updateMatchStatus(matchId, status),
  startMatch: (matchId, request) => api.startMatch(matchId, request),
  assignScorer: (matchId, scorerId) => api.assignScorer({ matchId, scorerId }),
  submitBall: (ball) => api.submitBall(ball),
  undoLastBall: (matchId, inningsNumber) => api.undoLastBall(matchId, inningsNumber),
  getInnings: (matchId) => requestOnce(
    pendingMatchRequests,
    `innings:${matchId}`,
    () => api.getMatchInnings(matchId),
  ),
  getInningsReport: (matchId, inningsNumber) => api.getInnings(matchId, inningsNumber),
  getMatchSnapshots: (matchId) => api.getMatchSnapshots(matchId),
  startSecondInnings: (matchId) => api.startSecondInnings(matchId),
  setActivePlayers: (matchId, inningsNumber, players) => (
    api.setInningsActivePlayers(matchId, inningsNumber, players)
  ),
  downloadScorecard: (id) => api.downloadScorecard(id),
};
