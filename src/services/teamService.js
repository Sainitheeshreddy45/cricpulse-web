import { api } from '../api';

const pendingRosterRequests = new Map();
const rosterCache = new Map();

function getPlayers(teamId, options) {
  if (options?.signal) return api.getTeamPlayers(teamId, options);
  const key = String(teamId);
  if (rosterCache.has(key)) return Promise.resolve(rosterCache.get(key));
  if (!pendingRosterRequests.has(key)) {
    pendingRosterRequests.set(
      key,
      api.getTeamPlayers(teamId)
        .then((players) => {
          rosterCache.set(key, players);
          return players;
        })
        .finally(() => pendingRosterRequests.delete(key)),
    );
  }
  return pendingRosterRequests.get(key);
}

function addPlayer(teamId, playerId) {
  return api.addPlayerToTeam(teamId, playerId).then((result) => {
    rosterCache.delete(String(teamId));
    return result;
  });
}

export const teamService = {
  search: (name, options) => api.searchTeams(name, options),
  getUserTeams: (userId, options) => api.getUserTeams(userId, options),
  getOpponentTeams: (userId, options) => api.getOpponentTeams(userId, options),
  getById: (teamId, options) => api.getTeam(teamId, options),
  getPlayers,
  addPlayer,
  createTeam: (name) => api.createTeam({ name }),
};
