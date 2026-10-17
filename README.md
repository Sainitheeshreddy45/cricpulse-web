# CricPulse Web

## Backend API

The frontend uses the shared client in `src/api.js` for the `/api/v1` routes.
Authentication uses `/api/v1/users/auth/register`, `/login`, `/me`, and
`/search`. By default, requests go directly to
`http://localhost:8080`. Set `VITE_API_BASE_URL` to override the backend origin.
To use Vite's development proxy instead, set `VITE_API_BASE_URL` to an empty
value; Vite forwards `/api` requests to `http://localhost:8080`.

Ball submissions use `POST /api/v1/scoring/ball` with the backend's
`SubmitBallRequest` delivery-event DTO:

```json
{
  "matchId": "m_101",
  "inningsNumber": 1,
  "overNumber": 1,
  "ballNumber": 1,
  "strikerId": "u_01",
  "strikerName": "A. Batter",
  "nonStrikerId": "u_02",
  "nonStrikerName": "B. Batter",
  "bowlerId": "u_05",
  "bowlerName": "C. Bowler",
  "runsOffBat": 4,
  "extraRuns": 0,
  "extraType": "NONE",
  "isWicket": false,
  "wicketType": null,
  "scorerId": "u_scorer",
  "dismissedPlayerId": null,
  "dismissedPlayerName": null,
  "newBatterId": null,
  "newBatterName": null,
  "newBowlerId": null,
  "newBowlerName": null,
  "fielderName": null
}
```

The frontend reads the innings and delivery numbers from the loaded match state,
player IDs and names from the selected team rosters, and scorer ID from the
signed-in user. Every DTO property is sent. Scoring is blocked if the match,
innings, selected players, or scorer ID is unavailable. `wicketType`,
`dismissedPlayerId`, and `dismissedPlayerName` are null when the delivery is not
a wicket. `newBatterId`, `newBatterName`, `newBowlerId`, and `newBowlerName`
are explicitly null because the current scoring flow does not collect those
replacement details before submission. For caught, stumped, and run-out
dismissals, the scorer selects a fielder from the bowling team's roster; that
player's name is sent as `fielderName` and can be shown in the scorecard
dismissal text. The scorecard displays the backend's `dismissalText` verbatim
(for example, `c fielder b bowler`). For other delivery outcomes, `fielderName`
is null.
The server applies the event to its stored match state and returns the updated
state for the scorecard. The page takes the innings number from the live match
state for ball submissions and undo; scorers do not enter it manually.

The match page also loads the live snapshot from
`GET /api/v1/scoring/match/{matchId}/live` and subscribes to
`/topic/match/{matchId}` over STOMP. The frontend currently uses SockJS at
`{VITE_API_BASE_URL}/ws` (or `VITE_STOMP_ENDPOINT` when set) as the STOMP
transport endpoint. Websocket messages are expected to be JSON containing the
updated match/innings state, using the same field conventions as the live
snapshot or ball-submission response. The live scorecard supports the
`LiveMatchStateDTO` shape, including batting and bowling cards, extras, yet-to-bat
players, recent deliveries, and fall-of-wicket details.
Scorers can export the generated scorecard PDF from the bottom of the scoring
panel and share it with the device's native share sheet where supported.

The client covers match creation, live/detail lookup, status and scorer updates;
roster lookup and saving; ball scoring, undo and live-state lookup; innings
second-innings creation, match innings list/detail lookup and active-player
updates; team creation, user-team listing, search, details and players; user
career stats, match-stat recording and paginated runs/wickets leaderboards; and
registration, login, current-user and user search. Requests automatically
include the locally stored bearer token when available. The Teams & Stats screen
uses the same client to show team rosters, player profiles and leaderboards.

The API client keeps route construction and request serialization centralized
in `src/api.js`. The innings and player methods accept backend request
parameters as provided by their callers rather than synthesizing domain
payloads. Route paths follow the
Java controller endpoints supplied for this integration.
Match creation uses `POST /api/v1/matches/newmatch`; status changes use
`PATCH /api/v1/matches/{matchId}/status?status={status}`; scorer assignment
uses `PUT /api/v1/matches/assign-scorer` with `matchId` and `scorerId`.
The match creation body follows `CreateMatchRequest`: `teamAId`, `teamBId`,
`teamAName`, `teamBName`, `venue`, `totalOvers`, and `scorerId`.

Match initialization and delivery scoring are separate steps. Before a
scheduled match starts, the scorer selects the toss winner/decision and the
opening striker, non-striker, and bowler. The app starts the match with
`PUT /api/v1/matches/{matchId}/start` and the existing body
`{ "tossWinnerTeamId": "...", "tossDecision": "BAT|FIELD" }`. Once the first
innings exists, it persists the three opening IDs with
`PUT /api/v1/matches/{matchId}/innings/{inningsNumber}/active-players` and the
body `{ "strikerId": "...", "nonStrikerId": "...", "bowlerId": "..." }`
before reloading the live match. The scorer then records only delivery
outcomes with the `SubmitBallRequest` payload described above; selected players
are not requested again after every ball. A replacement batter is selected
after a wicket, and a new bowler is selected at the end of a legal over; those
changes use the same active-player endpoint. Live batter and bowler figures are
rendered in separate scorecard tables from the latest innings state. A bowler
who completed the previous over is excluded from the next-over selection and
cannot be saved as the next bowler.
When innings 1 reaches its overs limit or the batting side is all out, the
scorer stops scoring and calls
`POST /api/v1/matches/{matchId}/innings/second` with no request body. The
backend creates innings 2, swaps the teams, and sets the target; the scorer
then selects and saves the opening players for innings 2.
The Scorecard tab loads completed innings snapshots from
`GET /api/v1/matches/{matchId}/innings/snapshots`. Each response item supplies
its innings number and an `inningsSnapshotJson` value containing that innings'
match-state snapshot. The UI parses and normalizes each snapshot independently;
it uses the response item's innings number as the report identity because the
embedded match state can contain a match-wide `currentInnings` value. If a
selected innings is not present in the snapshots list, the page falls back to
`GET /api/v1/matches/{matchId}/innings/{inningsNumber}`.

Match setup searches the team directory through
`GET /api/v1/teams/search?name={teamName}`. The search result is a list of
teams and supports cancellation when the user changes the query.
The Start Match team picker also uses `GET /api/v1/teams/user/{userId}` for
scorer teams, `GET /api/v1/teams/user/{scorerId}/opponents` for opponent teams,
`GET /api/v1/teams/{teamId}/players` for rosters, and `POST
/api/v1/teams/newteam` with a `{ "name": "..." }` body to create a team.
Registered players added to a selected squad are sent to
`POST /api/v1/teams/{teamId}/players/{playerId}`.
Player lookup in the Start Match squad picker queries
`GET /api/v1/users/auth/search?query={text}` after the user pauses typing.

The signed-in session token and a non-sensitive user profile cache are stored
in browser local storage so a refresh can restore the current account while
`/users/auth/me` is checked. Temporary API/network failures do not discard the
session; an unauthorized response clears it. Profile edits in Settings and
matches started by the signed-in account are currently kept in that browser,
because this API integration does not expose profile-update or user-match-list
routes.

When opening a match, the app loads its details and attaches `teamAPlayers` and
`teamBPlayers` to the selected match object. Embedded rosters are reused when
provided by the match endpoint; otherwise the team-roster endpoints are fetched
once and cached in memory. The match scorer consumes these attached roster
arrays rather than fetching the same player data again.

## Development

Run `npm install`, then `npm run dev` for local development. Use `npm run build`
to create the production bundle and `npm run lint` for Oxlint checks.
