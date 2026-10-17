import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Check, CircleDot, Download, LogIn, Share2, Undo2,
} from 'lucide-react';
import { getErrorMessage } from '../api';
import Button from '../components/common/Button';
import { matchService } from '../services/matchService';
import { subscribeToLiveMatch } from '../services/liveMatchSocket';
import { isComplete, teamName } from '../utils/matches';

const LIST_KEYS = ['players', 'playerList', 'roster', 'members', 'results', 'content', 'items', 'data'];
const MATCH_TABS = [
  { id: 'info', label: 'Info' },
  { id: 'live', label: 'Live' },
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'squads', label: 'Squads' },
  { id: 'overs', label: 'Overs' },
  { id: 'graphs', label: 'Graphs' },
];

function unwrapList(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of LIST_KEYS) {
    if (value[key] !== undefined) {
      const result = unwrapList(value[key]);
      if (result.length) return result;
    }
  }
  return [];
}

function rosterPlayerId(player) {
  return player?.playerId
    ?? player?.player_id
    ?? player?.batterId
    ?? player?.batter_id
    ?? player?.bowlerId
    ?? player?.bowler_id
    ?? player?.userId
    ?? player?.user_id
    ?? player?.user?.userId
    ?? player?.user?.user_id
    ?? player?.user?.id
    ?? player?.player?.playerId
    ?? player?.player?.player_id
    ?? player?.player?.id
    ?? player?.id
    ?? null;
}

function normalizePlayer(player) {
  if (!player || typeof player !== 'object') return null;
  const account = player.user ?? player.player ?? player;
  const name = player.username ?? player.name ?? player.fullName ?? player.displayName
    ?? account.username ?? account.name ?? account.fullName ?? account.displayName;
  const id = rosterPlayerId(player);
  if (!name || id == null || String(id).trim() === '') return null;
  return {
    ...player,
    id: String(id),
    scoringId: String(id),
    name: String(name),
  };
}

function unwrapInnings(response) {
  const payload = response?.data?.data ?? response?.data ?? response;
  const innings = Array.isArray(payload)
    ? payload
    : payload?.innings ?? payload?.snapshots ?? payload?.inningsSnapshots
      ?? payload?.content ?? payload?.results ?? payload?.data ?? [];
  return { payload, innings: Array.isArray(innings) ? innings : [] };
}

function inningsNumberFrom(response) {
  const { payload, innings } = unwrapInnings(response);
  const currentNumber = Number(
    payload?.currentInnings ?? payload?.current_innings ?? payload?.inningsNumber
    ?? payload?.innings_number ?? payload?.inningNumber,
  );
  if (Number.isInteger(currentNumber) && currentNumber > 0) return currentNumber;

  const numbers = innings
    .map((item) => Number(item?.inningsNumber ?? item?.innings_number ?? item?.inningNumber ?? item?.inningsNo ?? item?.number))
    .filter((number) => Number.isInteger(number) && number > 0);
  return numbers.length ? Math.max(...numbers) : null;
}

function legalBallCountFrom(innings) {
  const legalBallsValue = innings?.totalLegalBalls
    ?? innings?.total_legal_balls
    ?? innings?.legalBalls
    ?? innings?.legal_balls
    ?? innings?.ballsBowled
    ?? innings?.balls_bowled;
  if (legalBallsValue != null && legalBallsValue !== '') {
    const legalBalls = Number(legalBallsValue);
    if (Number.isInteger(legalBalls) && legalBalls >= 0) return legalBalls;
  }
  const formattedOvers = innings?.formattedOvers
    ?? innings?.totalOvers
    ?? innings?.oversBowled
    ?? innings?.overs_bowled
    ?? innings?.overs;
  if (formattedOvers == null) return null;
  const match = String(formattedOvers).match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const completedOvers = Number(match[1]);
  const ballsInOver = Number(match[2] ?? 0);
  if (!Number.isInteger(completedOvers) || !Number.isInteger(ballsInOver) || ballsInOver > 5) return null;
  return completedOvers * 6 + ballsInOver;
}

function oversLimitFrom(match) {
  const value = match.totalOvers ?? match.total_overs ?? match.overs;
  const limit = Number.parseFloat(value);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

function inningsCompleteFrom(innings, match, battingRosterSize) {
  if (!innings) return false;
  const totalWickets = Number(innings.totalWickets ?? innings.total_wickets ?? innings.wickets);
  const wicketsLost = Number.isInteger(totalWickets) && totalWickets >= 0
    ? totalWickets
    : (Array.isArray(innings.fallOfWickets ?? innings.fall_of_wickets)
      ? (innings.fallOfWickets ?? innings.fall_of_wickets).length
      : 0);
  const wicketsToEndInnings = battingRosterSize > 0
    ? Math.max(1, battingRosterSize - 1)
    : 10;
  const oversLimit = oversLimitFrom(match);
  const legalBalls = legalBallCountFrom(innings);
  const totalRuns = Number(innings.totalRuns ?? innings.total_runs);
  const targetRuns = Number(innings.targetRuns ?? innings.target_runs);
  return innings.isCompleted === true
    || innings.is_completed === true
    || /all.out|innings.complete/i.test(String(innings.status ?? innings.state ?? ''))
    || (oversLimit != null && legalBalls != null && legalBalls >= oversLimit * 6)
    || wicketsLost >= wicketsToEndInnings
    || (Number.isFinite(totalRuns) && Number.isFinite(targetRuns)
      && targetRuns > 0 && totalRuns >= targetRuns);
}

function inningsNumberFor(innings) {
  const number = Number(
    innings?.inningsNumber ?? innings?.innings_number ?? innings?.inningNumber ?? innings?.number,
  );
  return Number.isInteger(number) && number > 0 ? number : null;
}

function inningsStateJsonFrom(response) {
  const payload = response?.data?.data ?? response?.data ?? response;
  const rawState = payload?.inningsSnapshotJson ?? payload?.innings_snapshot_json
    ?? payload?.inningsSnapshotJSON ?? payload?.innings_snapshotJSON
    ?? payload?.inningsStateJson ?? payload?.innings_state_json
    ?? payload?.inningsStatejson ?? payload?.innings_stateJson
    ?? payload?.inningsStateJSON ?? payload?.innings_state ?? payload?.stateJson
    ?? payload?.state_json;
  if (rawState == null) {
    throw new Error('The innings response does not include inningsSnapshotJson.');
  }
  if (typeof rawState !== 'string') return rawState;
  try {
    return JSON.parse(rawState);
  } catch {
    throw new Error('The innings report contains invalid inningsStateJson.');
  }
}

function normalizeInningsSnapshot(snapshot) {
  const snapshotNumber = inningsNumberFor(snapshot);
  const state = inningsStateJsonFrom(snapshot);
  const normalized = currentInningsFrom(state) ?? normalizeMatchState(state);
  if (!normalized || typeof normalized !== 'object') return null;
  const inningsNumber = snapshotNumber ?? inningsNumberFor(normalized);
  return {
    ...normalized,
    ...(inningsNumber ? { inningsNumber } : {}),
  };
}

function normalizeMatchState(response) {
  const payload = response?.data?.data ?? response?.data ?? response;
  if (!payload || typeof payload !== 'object') return payload;
  const innings = payload.innings_data
    ?? payload.inningsData
    ?? (payload.innings && !Array.isArray(payload.innings) ? payload.innings : payload);
  if (!innings || typeof innings !== 'object') return payload;

  const battingTeamId = innings.batting_team_id ?? innings.battingTeamId
    ?? innings.battingSide ?? innings.battingTeam;
  const bowlingTeamId = innings.bowling_team_id ?? innings.bowlingTeamId
    ?? innings.bowlingSide ?? innings.bowlingTeam;
  const inningsBattingStats = innings.battingCard
    ?? innings.batting_card
    ?? innings.battingStats
    ?? innings.batting_stats
    ?? innings.battingScorecard
    ?? innings.batting_scorecard
    ?? innings.batsmen
    ?? innings.batters;
  const activeBatters = innings.active_batters ?? innings.activeBatters ?? {};
  const striker = activeBatters.striker ?? null;
  const nonStriker = activeBatters.non_striker ?? activeBatters.nonStriker ?? null;
  const activeBowler = innings.active_bowler ?? innings.activeBowler;
  const overs = innings.overs_bowled ?? innings.oversBowled
    ?? innings.formattedOvers ?? innings.totalOvers;
  const legalBalls = legalBallCountFrom({
    totalLegalBalls: innings.total_legal_balls ?? innings.totalLegalBalls,
    overs_bowled: overs,
  });
  const battingRows = Array.isArray(inningsBattingStats) && inningsBattingStats.length
    ? inningsBattingStats
    : [striker, nonStriker].filter(Boolean);
  const battingStats = Array.isArray(battingRows)
    ? battingRows.map((player) => {
        const stats = player.battingStats ?? player.batting_stats ?? player.stats ?? player;
        return {
          ...player,
          playerId: player.player_id ?? player.playerId ?? player.batter_id ?? player.batterId
            ?? player.batsman_id ?? player.batsmanId ?? player.userId ?? player.id,
          playerName: player.name ?? player.playerName ?? player.player_name
            ?? player.batterName ?? player.batter_name ?? player.batsmanName ?? player.batsman_name,
          status: player.status,
          dismissalText: player.dismissalText ?? player.dismissal_text ?? player.dismissal,
          runs: stats.runs ?? stats.runsScored ?? stats.runs_scored,
          ballsFaced: stats.ballsFaced ?? stats.balls_faced ?? stats.balls ?? stats.deliveryCount,
          fours: stats.fours ?? stats.boundaries ?? stats.boundaryCount,
          sixes: stats.sixes,
          strikeRate: stats.strikeRate ?? stats.strike_rate
            ?? (Number(stats.runs ?? stats.runsScored ?? stats.runs_scored) >= 0
              && Number(stats.ballsFaced ?? stats.balls_faced ?? stats.balls ?? stats.deliveryCount) > 0
              ? (Number(stats.runs ?? stats.runsScored ?? stats.runs_scored) * 100
                / Number(stats.ballsFaced ?? stats.balls_faced ?? stats.balls ?? stats.deliveryCount)).toFixed(2)
              : undefined),
        };
      })
    : inningsBattingStats;
  const hasBattingStats = Array.isArray(inningsBattingStats) || striker || nonStriker;

  return {
    ...payload,
    currentInnings: payload.current_innings ?? payload.currentInnings,
    tossWinnerTeamId: payload.toss?.winner_team_id ?? payload.toss?.winnerTeamId
      ?? payload.tossWinnerTeamId,
    tossDecision: payload.toss?.decision ?? payload.tossDecision,
    ...innings,
    inningsNumber: payload.current_innings ?? payload.currentInnings
      ?? payload.innings_number ?? payload.inningsNumber ?? payload.inningNumber
      ?? innings.innings_number ?? innings.inningsNumber,
    battingTeamId,
    bowlingTeamId,
    totalRuns: innings.total_runs ?? innings.totalRuns,
    totalWickets: innings.wickets ?? innings.total_wickets ?? innings.totalWickets,
    formattedOvers: overs,
    totalLegalBalls: legalBalls ?? innings.total_legal_balls,
    runRate: innings.run_rate ?? innings.runRate,
    activePlayers: {
      strikerId: striker?.player_id ?? striker?.playerId ?? striker?.userId ?? striker?.id,
      nonStrikerId: nonStriker?.player_id ?? nonStriker?.playerId ?? nonStriker?.userId ?? nonStriker?.id,
      bowlerId: activeBowler?.player_id ?? activeBowler?.playerId ?? activeBowler?.userId ?? activeBowler?.id,
    },
    activeBatters: activeBatters.striker || activeBatters.non_striker || activeBatters.nonStriker
      ? { striker, nonStriker }
      : undefined,
    activeBowler,
    battingStats: hasBattingStats ? battingStats : undefined,
    battingCard: hasBattingStats ? battingStats : undefined,
    bowlingCard: innings.bowlingCard ?? innings.bowling_card
      ?? innings.bowlingStats ?? innings.bowling_stats ?? innings.bowlers,
    yetToBatPlayerIds: innings.yetToBatPlayerIds ?? innings.yet_to_bat_player_ids,
    fallOfWickets: innings.fallOfWickets ?? innings.fall_of_wickets,
    recentDeliveries: payload.ball_history_stack ?? payload.ballHistoryStack
      ?? innings.ball_history_stack ?? innings.ballHistoryStack
      ?? innings.recentDeliveries ?? payload.recentDeliveries,
    extras: innings.extras,
  };
}

function mergeLiveState(current, incoming) {
  if (!incoming) return current;
  if (!current) return incoming;
  if (current.inningsNumber && incoming.inningsNumber
    && Number(current.inningsNumber) !== Number(incoming.inningsNumber)) {
    return incoming;
  }
  const definedIncoming = Object.fromEntries(
    Object.entries(incoming).filter(([, value]) => value !== undefined),
  );
  const merged = { ...current, ...definedIncoming };
  for (const key of ['activePlayers', 'activeBatters', 'extras']) {
    if (current[key] && incoming[key] && typeof incoming[key] === 'object') {
      merged[key] = {
        ...current[key],
        ...Object.fromEntries(
          Object.entries(incoming[key]).filter(([, value]) => value !== undefined),
        ),
      };
    }
  }
  return merged;
}

function nextDeliveryFrom(innings, hasNewFirstInnings = false) {
  const totalLegalBalls = legalBallCountFrom(innings);
  if (totalLegalBalls == null && hasNewFirstInnings) {
    return { overNumber: 1, ballNumber: 1 };
  }
  const explicitOver = innings?.nextOverNumber ?? innings?.next_over_number;
  const explicitBall = innings?.nextBallNumber ?? innings?.next_ball_number;
  if (totalLegalBalls == null && explicitOver != null && explicitBall != null) {
    const overNumber = Number(explicitOver);
    const ballNumber = Number(explicitBall);
    if (Number.isInteger(overNumber) && overNumber > 0
      && Number.isInteger(ballNumber) && ballNumber > 0) {
      return { overNumber, ballNumber };
    }
  }
  if (!Number.isInteger(totalLegalBalls) || totalLegalBalls < 0) return null;
  return {
    overNumber: Math.floor(totalLegalBalls / 6) + 1,
    ballNumber: (totalLegalBalls % 6) + 1,
  };
}

function currentInningsFrom(response) {
  const { payload, innings } = unwrapInnings(response);
  if (!innings.length) return payload && !Array.isArray(payload) ? normalizeMatchState(payload) : null;
  const currentNumber = Number(
    payload?.currentInnings ?? payload?.current_innings ?? payload?.inningsNumber
    ?? payload?.innings_number ?? payload?.inningNumber,
  );
  const currentInnings = innings.find((item) => Number(
    item?.inningsNumber ?? item?.innings_number ?? item?.inningNumber ?? item?.inningsNo ?? item?.number,
  ) === currentNumber) || [...innings].sort((a, b) => Number(
    b?.inningsNumber ?? b?.innings_number ?? b?.inningNumber ?? b?.inningsNo ?? b?.number ?? 0,
  ) - Number(a?.inningsNumber ?? a?.innings_number ?? a?.inningNumber ?? a?.inningsNo ?? a?.number ?? 0))[0];
  return currentInnings ? normalizeMatchState(currentInnings) : null;
}

function activePlayersFrom(innings) {
  if (!innings || typeof innings !== 'object') return null;
  const players = innings.activePlayers ?? innings.currentPlayers ?? innings;
  const activeBatters = innings.activeBatters ?? innings.active_batters ?? {};
  const activeBowler = innings.activeBowler ?? innings.active_bowler ?? {};
  const playerId = (value) => {
    if (value == null) return '';
    if (typeof value !== 'object') return String(value);
    const id = value.playerId ?? value.player_id ?? value.userId ?? value.user_id ?? value.id;
    return id == null ? '' : String(id);
  };
  const values = {
    striker: players.strikerId ?? players.strikerPlayerId ?? players.currentStrikerId ?? players.striker
      ?? activeBatters.striker,
    nonStriker: players.nonStrikerId ?? players.nonStrikerPlayerId ?? players.currentNonStrikerId ?? players.nonStriker
      ?? activeBatters.non_striker ?? activeBatters.nonStriker,
    bowler: players.bowlerId ?? players.bowlerPlayerId ?? players.currentBowlerId ?? players.bowler
      ?? activeBowler,
  };
  const activePlayers = Object.fromEntries(
    Object.entries(values)
      .map(([role, value]) => [role, playerId(value)])
      .filter(([, id]) => id),
  );
  return Object.keys(activePlayers).length ? activePlayers : null;
}

function mergeActivePlayers(current, incoming) {
  return incoming
    ? { ...current, ...incoming }
    : current;
}

function teamSlotFor(value, match) {
  if (value == null) return null;
  const id = typeof value === 'object'
    ? value.id ?? value.teamId ?? value.team_id
    : value;
  if (id != null && String(id) === String(match.teamAId ?? match.teamA?.id)) return 'teamA';
  if (id != null && String(id) === String(match.teamBId ?? match.teamB?.id)) return 'teamB';
  if (String(id).toLowerCase().replaceAll('-', '_') === 'team_a') return 'teamA';
  if (String(id).toLowerCase().replaceAll('-', '_') === 'team_b') return 'teamB';
  const name = typeof value === 'object' ? value.name ?? value.teamName : value;
  if (name && String(name).toLowerCase() === teamName(match, 'teamA').toLowerCase()) return 'teamA';
  if (name && String(name).toLowerCase() === teamName(match, 'teamB').toLowerCase()) return 'teamB';
  return null;
}

function tossBattingTeamSlot(match, teamAId, teamBId, inningsNumber) {
  const tossWinnerValue = match.tossWinnerTeamId
    ?? match.tossWinnerId
    ?? match.tossWinnerTeam
    ?? match.tossWinner;
  const tossWinnerSlot = teamSlotFor(tossWinnerValue, match);
  const decision = String(match.tossDecision ?? match.tossChoice ?? '').toUpperCase();
  if (!tossWinnerSlot || !['BAT', 'FIELD', 'BOWL'].includes(decision)) return null;

  const firstInningsBattingSlot = decision === 'BAT'
    ? tossWinnerSlot
    : tossWinnerSlot === 'teamA' ? 'teamB' : 'teamA';
  return Number(inningsNumber) === 2
    ? (firstInningsBattingSlot === 'teamA' ? 'teamB' : 'teamA')
    : firstInningsBattingSlot;
}

function inningsNumberForScoring(response, match) {
  const responseNumber = inningsNumberFrom(response);
  if (responseNumber) return responseNumber;
  const { innings } = unwrapInnings(response);
  const hasStarted = /live|in.progress/i.test(`${match.status || ''} ${match.state || ''}`);
  return hasStarted && (match.tossWinnerTeamId || match.tossWinnerId || match.tossWinnerTeam || match.tossWinner)
    ? (innings.length ? null : 1)
    : null;
}

function inningsTeamSlot(innings, role, match) {
  const aliases = role === 'batting'
    ? ['battingTeam', 'battingTeamId', 'batting_team_id', 'battingSide', 'battingTeamName']
    : ['bowlingTeam', 'bowlingTeamId', 'bowling_team_id', 'bowlingSide', 'bowlingTeamName'];
  for (const key of aliases) {
    const slot = teamSlotFor(innings?.[key], match);
    if (slot) return slot;
  }
  return null;
}

function matchResultFromSnapshots(snapshots, match) {
  if (!Array.isArray(snapshots)) return null;
  const firstInnings = snapshots.find((innings) => inningsNumberFor(innings) === 1);
  const secondInnings = snapshots.find((innings) => inningsNumberFor(innings) === 2);
  if (
    !(firstInnings?.isCompleted ?? firstInnings?.is_completed)
    || !(secondInnings?.isCompleted ?? secondInnings?.is_completed)
  ) return null;
  const firstRunsValue = firstInnings?.totalRuns ?? firstInnings?.total_runs;
  const secondRunsValue = secondInnings?.totalRuns ?? secondInnings?.total_runs;
  if (firstRunsValue == null || secondRunsValue == null) return null;

  const firstRuns = Number(firstRunsValue);
  const secondRuns = Number(secondRunsValue);
  if (!Number.isFinite(firstRuns) || !Number.isFinite(secondRuns)) return null;
  if (firstRuns === secondRuns) return 'Match tied.';

  const winningInnings = secondRuns > firstRuns ? secondInnings : firstInnings;
  const winningTeam = inningsTeamSlot(winningInnings, 'batting', match);
  if (!winningTeam) return null;
  return `${teamName(match, winningTeam)} won the match.`;
}

function playerStats(innings, player) {
  if (!innings || !player) return null;
  const lists = [
    innings.battingCard, innings.battingStats, innings.battingScorecard, innings.batsmen,
    innings.batters, innings.playerStats, innings.scorecard,
    innings.squad_stats?.team_a_players, innings.squad_stats?.team_b_players,
    innings.squadStats?.teamAPlayers, innings.squadStats?.teamBPlayers,
  ];
  const rows = lists.filter(Array.isArray).flat();
  const row = rows.find((item) => {
    const id = item?.playerId ?? item?.player_id ?? item?.batterId ?? item?.batter_id ?? item?.batsmanId ?? item?.id;
    const name = item?.playerName ?? item?.player_name ?? item?.batterName ?? item?.batter_name ?? item?.batsmanName ?? item?.name;
    return (id != null && String(id) === String(player.id))
      || (name && String(name).toLowerCase() === player.name.toLowerCase());
  });
  if (row) {
    return {
      runs: row.runs ?? row.runsScored ?? row.runs_scored,
      balls: row.ballsFaced ?? row.balls_faced ?? row.balls ?? row.deliveryCount,
      fours: row.fours ?? row.boundaries ?? row.boundaryCount,
      sixes: row.sixes,
      strikeRate: row.strikeRate ?? row.strike_rate,
    };
  }
  const prefix = ['striker', 'nonStriker'].find((key) => {
    const nested = innings[key];
    const id = innings[`${key}Id`] ?? innings[`${key}PlayerId`] ?? nested?.id;
    const name = nested?.name ?? innings[`${key}Name`];
    return (id != null && String(player.id) === String(id))
      || (name && player.name.toLowerCase() === String(name).toLowerCase());
  });
  if (!prefix) return null;
  const stat = (keys) => keys.map((key) => innings[key]).find((value) => value != null);
  return {
    runs: stat([`${prefix}Runs`, `${prefix}RunsScored`]),
    balls: stat([`${prefix}BallsFaced`, `${prefix}Balls`]),
    fours: stat([`${prefix}Fours`]),
    sixes: stat([`${prefix}Sixes`]),
    strikeRate: stat([`${prefix}StrikeRate`]),
  };
}

function bowlerStats(innings, player) {
  if (!innings || !player) return null;
  const rows = [
    innings.bowlingCard, innings.bowlingStats, innings.bowlingScorecard, innings.bowlers,
    innings.squad_stats?.team_a_bowlers, innings.squad_stats?.team_b_bowlers,
    innings.squadStats?.teamABowlers, innings.squadStats?.teamBBowlers,
  ].filter(Array.isArray).flat();
  const row = rows.find((item) => {
    const id = item?.playerId ?? item?.player_id ?? item?.bowlerId ?? item?.bowler_id ?? item?.id;
    const name = item?.playerName ?? item?.player_name ?? item?.bowlerName ?? item?.bowler_name ?? item?.name;
    return (id != null && String(id) === String(player.id))
      || (name && String(name).toLowerCase() === player.name.toLowerCase());
  });
  if (!row) return null;
  return {
    overs: row.overs ?? row.oversBowled ?? row.overs_bowled,
    maidens: row.maidens ?? row.maidenOvers ?? row.maiden_overs,
    runs: row.runsConceded ?? row.runs_conceded ?? row.runs,
    wickets: row.wickets,
    noBalls: row.noBalls ?? row.no_balls,
    wideBalls: row.wideBalls ?? row.wide_balls,
    economy: row.economy ?? row.economyRate ?? row.economy_rate,
  };
}

function scorecardOvers(innings) {
  if (innings?.formattedOvers != null) return innings.formattedOvers;
  if (innings?.totalOvers != null) return innings.totalOvers;
  if (innings?.overs_bowled != null) return innings.overs_bowled;
  const legalBalls = legalBallCountFrom(innings);
  return legalBalls == null ? '—' : `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function deliveryLabel(delivery) {
  if (delivery == null) return '·';
  if (typeof delivery === 'string' || typeof delivery === 'number') return String(delivery);
  if (delivery.isWicket ?? delivery.is_wicket) return 'W';
  const extraType = String(delivery.extraType ?? delivery.extra_type ?? '').toUpperCase();
  if (extraType === 'WIDE') {
    const runs = Number(delivery.runs ?? delivery.totalRuns ?? delivery.total_runs ?? 0);
    return runs > 1 ? `${runs - 1}+WD` : 'WD';
  }
  if (extraType && extraType !== 'NONE') {
    const type = extraType.replaceAll('_', '').toLowerCase();
    const extras = delivery.extras ?? delivery.extra_runs ?? 0;
    return extras ? `${extras}${type}` : type;
  }
  return String(delivery.runsOffBat ?? delivery.runs_off_bat ?? delivery.runs ?? '·');
}

function dismissalLabel(row) {
  const rawDismissal = row.dismissalText ?? row.dismissal_text ?? row.dismissal;
  if (!rawDismissal) return String(row.status ?? '').toUpperCase() === 'BATTING' ? 'batting' : '';
  return String(rawDismissal).trim();
}

function Scorecard({ match, innings, battingTeam, allPlayers, striker, nonStriker, bowler }) {
  const strikerStats = playerStats(innings, striker);
  const nonStrikerStats = playerStats(innings, nonStriker);
  const activeBowler = innings?.activeBowler ?? innings?.active_bowler;
  const scorecardBowler = activeBowler ? {
    id: activeBowler.player_id ?? activeBowler.playerId ?? activeBowler.id,
    name: activeBowler.name ?? activeBowler.playerName ?? activeBowler.player_name
      ?? bowler?.name ?? 'Current bowler',
  } : bowler;
  const currentBowlerStats = bowlerStats(innings, scorecardBowler);
  const activeBowlerOvers = activeBowler?.overs
    ?? activeBowler?.oversBowled
    ?? activeBowler?.overs_bowled;
  const activeBowlerLegalBalls = legalBallCountFrom({ oversBowled: activeBowlerOvers });
  const activeBowlerFigures = activeBowler ? {
    overs: activeBowlerOvers,
    maidens: activeBowler.maidens,
    runs: activeBowler.runs_conceded ?? activeBowler.runsConceded ?? activeBowler.runs,
    wickets: activeBowler.wickets,
    economy: activeBowler.economy ?? activeBowler.economyRate ?? activeBowler.economy_rate
      ?? (Number(activeBowler.runsConceded ?? activeBowler.runs_conceded) >= 0
        && activeBowlerLegalBalls > 0
        ? (Number(activeBowler.runsConceded ?? activeBowler.runs_conceded)
          / (activeBowlerLegalBalls / 6)).toFixed(2)
        : undefined),
  } : null;
  const deliveries = Array.isArray(innings?.recentDeliveries ?? innings?.ball_history_stack)
    ? (innings.recentDeliveries ?? innings.ball_history_stack).slice(0, 6).reverse()
    : [];
  const runRate = innings?.runRate
    ?? (Number(innings?.totalRuns ?? innings?.total_runs) && legalBallCountFrom(innings)
      ? (Number(innings.totalRuns ?? innings.total_runs) / (legalBallCountFrom(innings) / 6)).toFixed(2)
      : '0.00');
  const tossWinnerValue = innings?.tossWinnerTeamId
    ?? match.tossWinnerTeamId ?? match.tossWinnerId ?? match.tossWinnerTeam ?? match.tossWinner;
  const tossWinnerName = match.tossWinnerTeamName
    ?? (teamSlotFor(tossWinnerValue, match)
      ? teamName(match, teamSlotFor(tossWinnerValue, match))
      : null);
  const tossDecision = String(innings?.tossDecision ?? match.tossDecision ?? match.tossChoice ?? '').toUpperCase();
  const batterRows = Array.isArray(innings?.battingCard)
    ? innings.battingCard
    : Array.isArray(innings?.battingStats) ? innings.battingStats : [];
  const bowlerRows = Array.isArray(innings?.bowlingCard) ? innings.bowlingCard : [];
  const activeStrikerId = striker?.id
    ?? innings?.activePlayers?.strikerId
    ?? innings?.activeBatters?.striker?.playerId
    ?? innings?.activeBatters?.striker?.player_id
    ?? striker?.id;
  const squadStats = innings?.squadStats ?? innings?.squad_stats ?? {};
  const knownPlayers = [
    ...allPlayers,
    ...(Array.isArray(squadStats.teamAPlayers ?? squadStats.team_a_players)
      ? (squadStats.teamAPlayers ?? squadStats.team_a_players).map(normalizePlayer).filter(Boolean)
      : []),
    ...(Array.isArray(squadStats.teamBPlayers ?? squadStats.team_b_players)
      ? (squadStats.teamBPlayers ?? squadStats.team_b_players).map(normalizePlayer).filter(Boolean)
      : []),
  ];
  const playerNames = new Map(knownPlayers.map((player) => [String(player.id), player.name]));
  const yetToBatIds = Array.isArray(innings?.yetToBatPlayerIds)
    ? innings.yetToBatPlayerIds
    : Array.isArray(innings?.yet_to_bat_player_ids) ? innings.yet_to_bat_player_ids : [];
  const fallOfWickets = Array.isArray(innings?.fallOfWickets)
    ? innings.fallOfWickets
    : Array.isArray(innings?.fall_of_wickets) ? innings.fall_of_wickets : [];
  const extraTotals = innings?.extras;
  const extrasEntries = extraTotals && typeof extraTotals === 'object'
    ? Object.entries(extraTotals).filter(([, value]) => Number(value) > 0)
    : [];

  return (
    <section className="professional-scorecard" aria-label="Match scorecard">
      <div className="scorecard-summary">
        <div className="scorecard-main">
          <span className="scorecard-innings-label">
            {battingTeam ? `${teamName(match, battingTeam)} batting` : 'Match scorecard'}
            {innings?.inningsNumber ? ` · Innings ${innings.inningsNumber}` : ''}
          </span>
          <div className="scorecard-total">
            <strong>{(innings?.totalRuns ?? innings?.total_runs) != null
              ? `${innings.totalRuns ?? innings.total_runs}/${innings.totalWickets ?? innings.wickets ?? 0}`
              : '—'}</strong>
            <span className="scorecard-total-detail"><small>OVERS</small>{scorecardOvers(innings)}</span>
            <span className="scorecard-total-detail"><small>CRR</small>{runRate}</span>
          </div>
          {(innings?.targetRuns ?? innings?.target_runs) != null && <p className="scorecard-target">Target: {innings.targetRuns ?? innings.target_runs}</p>}
        </div>
        <div className="scorecard-key-stats">
          <h3>Key stats</h3>
          <dl>
            <div><dt>Run rate</dt><dd>{runRate}</dd></div>
            <div><dt>Legal balls</dt><dd>{innings?.totalLegalBalls ?? innings?.total_legal_balls ?? '—'}</dd></div>
            {(innings?.targetRuns ?? innings?.target_runs) != null && <div><dt>Target</dt><dd>{innings.targetRuns ?? innings.target_runs}</dd></div>}
            {tossWinnerName && <div><dt>Toss</dt><dd>{tossWinnerName}{tossDecision ? ` (${tossDecision === 'BAT' ? 'Batting' : 'Fielding'})` : ''}</dd></div>}
          </dl>
        </div>
      </div>

      <div className="scorecard-tables">
        <div className="scorecard-table-wrap">
          <table className="scorecard-table">
            <thead><tr><th scope="col">Batter</th><th scope="col">Dismissal</th><th scope="col">R</th><th scope="col">B</th><th scope="col">4s</th><th scope="col">6s</th><th scope="col">SR</th></tr></thead>
            <tbody>
              {batterRows.length ? batterRows.map((row, index) => {
                const id = row.playerId ?? row.player_id ?? row.batterId ?? row.batter_id
                  ?? row.batsmanId ?? row.batsman_id ?? row.id ?? `batter-${index}`;
                const name = playerNames.get(String(id))
                  ?? row.playerName ?? row.player_name ?? row.name ?? 'Batter';
                const stats = playerStats(innings, { id, name });
                const isStriker = String(id) === String(activeStrikerId);
                return (
                  <tr key={id}>
                    <th scope="row">
                      {name}
                      {isStriker && <span className="scorecard-striker-mark"> *</span>}
                    </th>
                    <td className="scorecard-dismissal">{dismissalLabel(row)}</td>
                    <td>{stats?.runs ?? row.runs ?? '—'}</td>
                    <td>{stats?.balls ?? row.ballsFaced ?? row.balls ?? '—'}</td>
                    <td>{stats?.fours ?? row.fours ?? '—'}</td>
                    <td>{stats?.sixes ?? row.sixes ?? '—'}</td>
                    <td>{stats?.strikeRate ?? row.strikeRate ?? row.strike_rate ?? '—'}</td>
                  </tr>
                );
              }) : [{ player: striker, stats: strikerStats }, { player: nonStriker, stats: nonStrikerStats }]
                .filter(({ player }) => player)
                .map(({ player, stats }, index) => (
                  <tr key={player.id}>
                    <th scope="row">{player.name}{index === 0 && <span className="scorecard-striker-mark"> *</span>}</th>
                    <td className="scorecard-dismissal">batting</td>
                    <td>{stats?.runs ?? '—'}</td>
                    <td>{stats?.balls ?? '—'}</td>
                    <td>{stats?.fours ?? '—'}</td>
                    <td>{stats?.sixes ?? '—'}</td>
                    <td>{stats?.strikeRate ?? '—'}</td>
                  </tr>
                ))}
              {!batterRows.length && !striker && !nonStriker && <tr><td colSpan="7" className="scorecard-empty">No batter figures are available yet.</td></tr>}
              {extrasEntries.length > 0 && (
                <tr className="scorecard-total-row">
                  <th scope="row">Extras</th>
                  <td colSpan="6">{extrasEntries.reduce((sum, [, count]) => sum + Number(count), 0)} ({extrasEntries.map(([type, count]) => `${type.replaceAll('_', ' ')} ${count}`).join(', ')})</td>
                </tr>
              )}
              <tr className="scorecard-total-row">
                <th scope="row">Total</th>
                <td colSpan="6">
                  {innings?.totalRuns ?? innings?.total_runs ?? 0}-{innings?.totalWickets ?? innings?.wickets ?? 0}
                  {' '}({scorecardOvers(innings)} Ov, RR: {runRate})
                </td>
              </tr>
              {yetToBatIds.length > 0 && (
                <tr className="scorecard-total-row">
                  <th scope="row">Yet to bat</th>
                  <td colSpan="6" className="scorecard-yet-to-bat">
                    {yetToBatIds.map((player) => {
                      const id = typeof player === 'object'
                        ? player.playerId ?? player.player_id ?? player.id
                        : player;
                      return playerNames.get(String(id))
                        ?? (typeof player === 'object' ? player.name : null)
                        ?? null;
                    }).filter(Boolean).join(', ')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="scorecard-table-wrap">
          <table className="scorecard-table bowling-scorecard">
            <thead><tr><th scope="col">Bowler</th><th scope="col">O</th><th scope="col">M</th><th scope="col">R</th><th scope="col">W</th><th scope="col">NB</th><th scope="col">WD</th><th scope="col">ECO</th></tr></thead>
            <tbody>
              {bowlerRows.length ? bowlerRows.map((row, index) => {
                const id = row.playerId ?? row.player_id ?? row.bowlerId ?? row.bowler_id ?? row.id ?? index;
                const name = playerNames.get(String(id))
                  ?? row.playerName ?? row.player_name ?? row.name
                  ?? (String(id) === String(activeBowler?.playerId ?? activeBowler?.player_id)
                    ? activeBowler?.name
                    : null)
                  ?? 'Bowler';
                const stats = bowlerStats(innings, { id, name });
                const isCurrent = row.isCurrentBowler ?? row.is_current_bowler
                  ?? String(id) === String(activeBowler?.playerId ?? activeBowler?.player_id);
                return (
                  <tr key={id}>
                    <th scope="row">{name}{isCurrent && <span className="scorecard-striker-mark"> *</span>}</th>
                    <td>{isCurrent
                      ? activeBowlerFigures?.overs ?? stats?.overs ?? row.overs ?? '—'
                      : stats?.overs ?? row.overs ?? '—'}</td>
                    <td>{stats?.maidens ?? row.maidenOvers ?? '—'}</td>
                    <td>{stats?.runs ?? row.runsConceded ?? '—'}</td>
                    <td>{stats?.wickets ?? row.wickets ?? '—'}</td>
                    <td>{stats?.noBalls ?? row.noBalls ?? '—'}</td>
                    <td>{stats?.wideBalls ?? row.wideBalls ?? '—'}</td>
                    <td>{stats?.economy ?? row.economy ?? '—'}</td>
                  </tr>
                );
              }) : scorecardBowler ? (
                <tr>
                  <th scope="row">{scorecardBowler.name} <span className="scorecard-striker-mark">*</span></th>
                  <td>{activeBowlerFigures?.overs ?? currentBowlerStats?.overs ?? '—'}</td>
                  <td>{currentBowlerStats?.maidens ?? activeBowlerFigures?.maidens ?? '—'}</td>
                  <td>{currentBowlerStats?.runs ?? activeBowlerFigures?.runs ?? '—'}</td>
                  <td>{currentBowlerStats?.wickets ?? activeBowlerFigures?.wickets ?? '—'}</td>
                  <td>{currentBowlerStats?.noBalls ?? '—'}</td>
                  <td>{currentBowlerStats?.wideBalls ?? '—'}</td>
                  <td>{currentBowlerStats?.economy ?? activeBowlerFigures?.economy ?? '—'}</td>
                </tr>
              ) : <tr><td colSpan="8" className="scorecard-empty">No bowling figures are available yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {fallOfWickets.length > 0 && (
          <div className="scorecard-table-wrap">
            <table className="scorecard-table fall-of-wickets-table">
              <thead><tr><th scope="col">Fall of wickets</th><th scope="col">Score</th><th scope="col">Over</th></tr></thead>
              <tbody>
                {fallOfWickets.map((wicket, index) => {
                  const id = wicket.playerId ?? wicket.player_id;
                  const name = wicket.playerName ?? wicket.player_name ?? playerNames.get(String(id)) ?? 'Batter';
                  return (
                    <tr key={`${id ?? name}-${wicket.wicketNumber ?? index}`}>
                      <th scope="row">{name}</th>
                      <td>{wicket.runsAtDismissal ?? wicket.runs_at_dismissal ?? '—'}-{wicket.wicketNumber ?? '—'}</td>
                      <td>{wicket.overNumber ?? wicket.over_number ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="scorecard-footer">
        <div className="scorecard-recent">
          <strong>Recent</strong>
          {deliveries.length
            ? deliveries.map((delivery, index) => <span key={`${index}-${deliveryLabel(delivery)}`} className={(delivery.isWicket ?? delivery.is_wicket) ? 'delivery-wicket' : ''}>{deliveryLabel(delivery)}</span>)
            : <span className="scorecard-muted">No deliveries yet</span>}
        </div>
        {innings?.partnershipRuns != null && (
          <div className="scorecard-partnership"><strong>Partnership</strong> {innings.partnershipRuns}{innings.partnershipBalls != null ? ` (${innings.partnershipBalls})` : ''}</div>
        )}
      </div>
    </section>
  );
}

export default function MatchPage({
  match, matchId: routeMatchId, user, onAuth, onBack, onReload,
}) {
  const matchId = routeMatchId ?? match.matchId ?? match.id;
  const [runs, setRuns] = useState('0');
  const [wicketType, setWicketType] = useState('NONE');
  const [fielderId, setFielderId] = useState('');
  const [selectedDismissedPlayer, setSelectedDismissedPlayer] = useState('');
  const [extraType, setExtraType] = useState('NONE');
  const [extras, setExtras] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [inningsError, setInningsError] = useState('');
  const [inningsNumber, setInningsNumber] = useState(null);
  const [inningsData, setInningsData] = useState(null);
  const [liveState, setLiveState] = useState(null);
  const [availableInnings, setAvailableInnings] = useState([]);
  const [selectedReportInnings, setSelectedReportInnings] = useState(null);
  const [inningsReport, setInningsReport] = useState(null);
  const [snapshotReports, setSnapshotReports] = useState(null);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const snapshotCache = useRef({ matchId: null, reports: null, promise: null });
  const [activeMatchTab, setActiveMatchTab] = useState(() => (
    isComplete(match) || Boolean(match.result ?? match.matchResult ?? match.match_result)
      ? 'scorecard'
      : 'live'
  ));
  const liveEventVersion = useRef(0);
  const [selectedPlayers, setSelectedPlayers] = useState({ striker: '', nonStriker: '', bowler: '' });
  const [pendingPlayerRoles, setPendingPlayerRoles] = useState([]);
  const [playersToReplace, setPlayersToReplace] = useState({});
  const [previousOverBowlerId, setPreviousOverBowlerId] = useState('');
  const [bowlerChangeReason, setBowlerChangeReason] = useState(null);
  const [playerSelectionOpen, setPlayerSelectionOpen] = useState(false);
  const initialSelectionPromptedFor = useRef('');
  const [tossWinner, setTossWinner] = useState('');
  const [tossDecision, setTossDecision] = useState('');
  const snapshotMatchResult = snapshotReports?.matchId === matchId
    ? matchResultFromSnapshots(snapshotReports.reports, match)
    : null;
  const matchResult = match.result ?? match.matchResult ?? match.match_result ?? match.resultText
    ?? liveState?.result ?? liveState?.matchResult ?? liveState?.match_result
    ?? inningsData?.result ?? inningsData?.matchResult ?? inningsData?.match_result
    ?? snapshotMatchResult;
  const completed = isComplete(match) || Boolean(matchResult);
  const scheduled = /scheduled|upcoming/i.test(`${match.status || ''} ${match.state || ''}`);
  const hasValidInnings = Number.isInteger(inningsNumber) && inningsNumber > 0;
  const currentUserId = user?.scorerId ?? user?.scorer_id
    ?? user?.userId ?? user?.user_id ?? user?.id;
  const assignedScorer = match.scorerId ?? match.scorer_id
    ?? match.assignedScorerId ?? match.assigned_scorer_id
    ?? match.scorerUserId ?? match.scorer_user_id
    ?? match.scorer ?? match.assignedScorer;
  const assignedScorerId = typeof assignedScorer === 'object'
    ? assignedScorer?.scorerId ?? assignedScorer?.scorer_id
      ?? assignedScorer?.userId ?? assignedScorer?.user_id ?? assignedScorer?.id
    : assignedScorer;
  const isAssignedScorer = currentUserId != null
    && assignedScorerId != null
    && String(currentUserId) === String(assignedScorerId);

  useEffect(() => {
    if (completed && activeMatchTab === 'live') {
      // oxlint-disable-next-line react/set-state-in-effect -- completed matches open on the scorecard by default.
      setActiveMatchTab('scorecard');
    }
  }, [completed, activeMatchTab]);

  const refreshInnings = useCallback(async ({ useLiveState = true } = {}) => {
    const requestVersion = liveEventVersion.current;
    try {
      let response;
      if (useLiveState) {
        try {
          response = await matchService.getLiveState(matchId);
        } catch (liveError) {
          try {
            response = await matchService.getInnings(matchId);
          } catch {
            throw liveError;
          }
        }
      } else {
        response = await matchService.getInnings(matchId);
      }
      if (requestVersion !== liveEventVersion.current) return;
      setInningsNumber(inningsNumberForScoring(response, match));
      const currentInnings = currentInningsFrom(response);
      const { innings: inningsList } = unwrapInnings(response);
      const numbers = inningsList.map(inningsNumberFor).filter(Boolean);
      const responseNumber = inningsNumberFrom(response);
      if (responseNumber && !numbers.includes(responseNumber)) numbers.push(responseNumber);
      if (numbers.length) setAvailableInnings([...new Set(numbers)].sort((a, b) => a - b));
      try {
        const listResponse = await matchService.getInnings(matchId);
        const { innings: allInnings } = unwrapInnings(listResponse);
        const allNumbers = allInnings.map(inningsNumberFor).filter(Boolean);
        if (allNumbers.length) {
          setAvailableInnings([...new Set([...numbers, ...allNumbers])].sort((a, b) => a - b));
        }
      } catch (listError) {
        setReportError(`Could not load innings reports: ${getErrorMessage(listError)}`);
      }
      if (requestVersion !== liveEventVersion.current) return;
      setInningsData((current) => mergeLiveState(current, currentInnings));
      if (currentInnings) setLiveState((current) => mergeLiveState(current, currentInnings));
      const activePlayers = activePlayersFrom(currentInnings);
      const currentLegalBalls = legalBallCountFrom(currentInnings);
      if (currentLegalBalls > 0 && currentLegalBalls % 6 === 0 && activePlayers?.bowler) {
        setPreviousOverBowlerId(activePlayers.bowler);
      }
      if (activePlayers) setSelectedPlayers((current) => mergeActivePlayers(current, activePlayers));
      setInningsError('');
    } catch (requestError) {
      if (requestVersion !== liveEventVersion.current) return;
      setInningsError(getErrorMessage(requestError));
    }
  }, [matchId, match]);

  const applyLiveState = useCallback((response) => {
    const payload = response?.data?.data ?? response?.data ?? response;
    if (!payload || typeof payload !== 'object') return;
    const state = currentInningsFrom(payload) ?? payload;
    const legalBalls = legalBallCountFrom(state);
    const updatedState = legalBalls == null ? state : { ...state, totalLegalBalls: legalBalls };
    liveEventVersion.current += 1;
    setLiveState((current) => mergeLiveState(current, updatedState));
    const currentNumber = Number(
      payload.currentInnings ?? payload.inningsNumber
      ?? state.currentInnings ?? state.inningsNumber,
    );
    if (Number.isInteger(currentNumber) && currentNumber > 0) setInningsNumber(currentNumber);
    setInningsData((current) => mergeLiveState(current, updatedState));
    const activePlayers = activePlayersFrom(updatedState);
    const updatedLegalBalls = legalBallCountFrom(updatedState);
    if (updatedLegalBalls > 0 && updatedLegalBalls % 6 === 0 && activePlayers?.bowler) {
      setPreviousOverBowlerId(activePlayers.bowler);
    }
    if (activePlayers) setSelectedPlayers((current) => mergeActivePlayers(current, activePlayers));
    setInningsError('');
  }, []);

  const applyLiveStateRef = useRef(applyLiveState);
  useEffect(() => {
    applyLiveStateRef.current = applyLiveState;
  }, [applyLiveState]);

  const teamAId = match.teamAId ?? match.teamA?.id ?? match.teams?.[0]?.id;
  const teamBId = match.teamBId ?? match.teamB?.id ?? match.teams?.[1]?.id;
  const teamAPlayerRows = unwrapList(
    match.teamAPlayers ?? match.team_a_players ?? match.teamA?.players ?? match.teams?.[0]?.players,
  );
  const teamBPlayerRows = unwrapList(
    match.teamBPlayers ?? match.team_b_players ?? match.teamB?.players ?? match.teams?.[1]?.players,
  );
  const rosters = {
    teamA: teamAPlayerRows.map(normalizePlayer).filter(Boolean),
    teamB: teamBPlayerRows.map(normalizePlayer).filter(Boolean),
  };
  const rosterLoading = !match.rostersLoaded;
  const invalidRosterEntries = (
    rosters.teamA.length !== teamAPlayerRows.length
    || rosters.teamB.length !== teamBPlayerRows.length
  );
  const rosterError = match.rosterError
    ?? (invalidRosterEntries
      ? 'Some roster entries had no player or user ID and were skipped to prevent invalid scoring submissions.'
      : '');

  const detectedBattingTeam = inningsTeamSlot(inningsData, 'batting', match);
  const detectedBowlingTeam = inningsTeamSlot(inningsData, 'bowling', match);
  const inningsBattingTeam = detectedBattingTeam
    || tossBattingTeamSlot(match, teamAId, teamBId, inningsNumber);
  const battingTeam = inningsBattingTeam;
  const bowlingTeam = detectedBowlingTeam
    || (battingTeam === 'teamA' ? 'teamB' : battingTeam === 'teamB' ? 'teamA' : null);
  const battingRoster = battingTeam ? rosters[battingTeam] : [];
  const bowlingRoster = bowlingTeam ? rosters[bowlingTeam] : [];
  const striker = battingRoster.find((player) => String(player.id) === String(selectedPlayers.striker));
  const nonStriker = battingRoster.find((player) => String(player.id) === String(selectedPlayers.nonStriker));
  const bowler = bowlingRoster.find((player) => String(player.id) === String(selectedPlayers.bowler));
  const fielder = bowlingRoster.find((player) => String(player.id) === String(fielderId));
  const setupBattingTeam = tossWinner && tossDecision
    ? (tossDecision === 'BAT'
      ? tossWinner
      : tossWinner === 'teamA' ? 'teamB' : 'teamA')
    : null;
  const setupBowlingTeam = setupBattingTeam === 'teamA'
    ? 'teamB'
    : setupBattingTeam === 'teamB' ? 'teamA' : null;
  const openingStriker = (setupBattingTeam ? rosters[setupBattingTeam] : [])
    .find((player) => String(player.id) === String(selectedPlayers.striker));
  const openingNonStriker = (setupBattingTeam ? rosters[setupBattingTeam] : [])
    .find((player) => String(player.id) === String(selectedPlayers.nonStriker));
  const openingBowler = (setupBowlingTeam ? rosters[setupBowlingTeam] : [])
    .find((player) => String(player.id) === String(selectedPlayers.bowler));
  const isNewFirstInnings = inningsNumber === 1 && !inningsData;
  const delivery = nextDeliveryFrom(inningsData, isNewFirstInnings);
  const liveBattingTeam = inningsTeamSlot(liveState, 'batting', match);
  const isWicket = wicketType !== 'NONE';
  const requiresFielderName = ['CAUGHT', 'STUMPED', 'RUN_OUT'].includes(wicketType);
  const inningsComplete = inningsCompleteFrom(inningsData, match, battingRoster.length);
  const dismissedPlayerId = [selectedPlayers.striker, selectedPlayers.nonStriker]
    .some((playerId) => String(playerId) === String(selectedDismissedPlayer))
    ? selectedDismissedPlayer
    : selectedPlayers.striker;
  const canSaveActivePlayers = hasValidInnings
    && !inningsComplete
    && Boolean(striker && nonStriker && bowler)
    && (!pendingPlayerRoles.includes('bowler')
      || !previousOverBowlerId
      || String(selectedPlayers.bowler) !== String(previousOverBowlerId))
    && ['striker', 'nonStriker', 'bowler'].every((role) => (
      !playersToReplace[role]
      || String(selectedPlayers[role]) !== String(playersToReplace[role])
    ))
    && String(selectedPlayers.striker) !== String(selectedPlayers.nonStriker);
  const needsPlayerSelection = pendingPlayerRoles.length > 0;
  const selectionRoles = pendingPlayerRoles;
  const selectingReplacementBatter = selectionRoles.includes('striker')
    || selectionRoles.includes('nonStriker');
  const selectingNextBowler = selectionRoles.includes('bowler');
  const playerSelectionTitle = selectingReplacementBatter && selectingNextBowler
    ? 'Choose the replacement batter and next bowler'
    : selectingReplacementBatter
      ? 'Choose a replacement batter'
      : 'Choose the next bowler';
  const playerSelectionDescription = selectingReplacementBatter && selectingNextBowler
    ? 'A wicket fell on the final ball of the over. Select the replacement batter and a different bowler.'
    : selectingReplacementBatter
      ? 'Select a replacement for the dismissed batter. The current bowler will stay on.'
      : bowlerChangeReason === 'injury'
        ? 'The current bowler is injured. Select a replacement bowler; the batters will stay at the crease.'
        : 'The over has ended. Select a different bowler; the batters will stay at the crease.';

  useEffect(() => {
    if (scheduled || completed || inningsComplete || rosterLoading || !hasValidInnings) return;
    const promptKey = `${matchId}:${inningsNumber}`;
    if (initialSelectionPromptedFor.current === promptKey) return;
    initialSelectionPromptedFor.current = promptKey;
    const missingRoles = [
      ...(!striker ? ['striker'] : []),
      ...(!nonStriker ? ['nonStriker'] : []),
      ...(!bowler ? ['bowler'] : []),
    ];
    if (missingRoles.length) {
      // oxlint-disable-next-line react/set-state-in-effect -- starts the initial innings player-selection flow.
      setPendingPlayerRoles(missingRoles);
      setPlayerSelectionOpen(true);
    }
  }, [
    matchId, inningsNumber, hasValidInnings, scheduled, completed, inningsComplete, rosterLoading,
    striker, nonStriker, bowler,
  ]);

  useEffect(() => {
    if (scheduled || !matchId) return undefined;
    const unsubscribe = completed
      ? undefined
      : subscribeToLiveMatch(matchId, (update) => applyLiveStateRef.current(update));
    // oxlint-disable-next-line react/set-state-in-effect
    refreshInnings();
    return () => unsubscribe?.();
  }, [matchId, refreshInnings, scheduled, completed]);

  const download = async () => {
    if (!user) { onAuth(); return; }
    try {
      setError('');
      const { blob, filename } = await matchService.downloadScorecard(matchId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  };

  const shareScorecard = async () => {
    if (!user) { onAuth(); return; }
    try {
      setError('');
      const { blob, filename } = await matchService.downloadScorecard(matchId);
      const file = new File([blob], filename, {
        type: blob.type || 'application/pdf',
      });
      if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage('PDF sharing is unavailable on this device; the scorecard was downloaded instead.');
        return;
      }
      await navigator.share({ files: [file], title: 'CricPulse scorecard' });
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setError(getErrorMessage(requestError));
    }
  };

  const loadInningsSnapshots = useCallback(() => {
    if (snapshotCache.current.matchId !== matchId) {
      snapshotCache.current = { matchId, reports: null, promise: null };
    }
    const cache = snapshotCache.current;
    if (cache.reports) return Promise.resolve(cache.reports);
    if (cache.promise) return cache.promise;

    setSnapshotsLoading(true);
    const promise = matchService.getMatchSnapshots(matchId).then((response) => {
      const { innings: snapshots } = unwrapInnings(response);
      const reports = snapshots
        .map(normalizeInningsSnapshot)
        .filter((report) => report && inningsNumberFor(report) != null)
        .sort((left, right) => inningsNumberFor(left) - inningsNumberFor(right));
      cache.reports = reports;
      setSnapshotReports({ matchId, reports });
      if (reports.length) {
        setAvailableInnings((current) => [...new Set([
          ...current,
          ...reports.map(inningsNumberFor),
        ])].sort((left, right) => left - right));
      }
      return reports;
    }).catch((requestError) => {
      cache.promise = null;
      throw requestError;
    }).finally(() => {
      if (cache.matchId === matchId) cache.promise = null;
      setSnapshotsLoading(false);
    });
    cache.promise = promise;
    return promise;
  }, [matchId]);

  useEffect(() => {
    if (activeMatchTab !== 'scorecard' || snapshotReports?.matchId === matchId) return;
    void loadInningsSnapshots().catch((requestError) => {
      setReportError(`Could not load innings snapshots: ${getErrorMessage(requestError)}`);
    });
  }, [activeMatchTab, snapshotReports, matchId, loadInningsSnapshots]);

  const showInningsReport = useCallback(async (number) => {
    setSelectedReportInnings(number);
    setReportLoading(true);
    setReportError('');
    try {
      const snapshots = await loadInningsSnapshots();
      let report = snapshots.find((snapshot) => inningsNumberFor(snapshot) === number);
      if (!report) {
        const response = await matchService.getInningsReport(matchId, number);
        report = normalizeInningsSnapshot(response);
      }
      if (report) report = { ...report, inningsNumber: number };
      if (!report || typeof report !== 'object') {
        throw new Error(`No report data was returned for innings ${number}.`);
      }
      setInningsReport(report);
    } catch (requestError) {
      setInningsReport(null);
      setReportError(getErrorMessage(requestError));
    } finally {
      setReportLoading(false);
    }
  }, [loadInningsSnapshots, matchId]);

  useEffect(() => {
    if (!completed || !availableInnings.includes(1) || selectedReportInnings != null) return;
    // oxlint-disable-next-line react/set-state-in-effect -- opens the default completed-match report.
    void showInningsReport(1);
  }, [completed, availableInnings, selectedReportInnings, showInningsReport]);

  const initializeSecondInnings = async () => {
    const secondInnings = await matchService.startSecondInnings(matchId);
    applyLiveState(secondInnings);
    setInningsNumber(2);
    setAvailableInnings((current) => [...new Set([...current, 2])].sort((a, b) => a - b));
    setSelectedReportInnings(null);
    setInningsReport(null);
    setPreviousOverBowlerId('');
    setBowlerChangeReason(null);
    setSelectedPlayers({ striker: '', nonStriker: '', bowler: '' });
    setPlayersToReplace({});
    setPendingPlayerRoles(['striker', 'nonStriker', 'bowler']);
    setPlayerSelectionOpen(true);
    setError('');
    setMessage('Second innings started. Select the opening batters and bowler.');
  };

  const retryStartSecondInnings = async () => {
    setBusy(true);
    setError('');
    try {
      await initializeSecondInnings();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const recordBall = async () => {
    if (!user) { onAuth(); return; }
    if (inningsComplete) {
      setError('This innings is complete. Refresh the match after the second innings has been started.');
      return;
    }
    if (needsPlayerSelection || playerSelectionOpen) {
      setError('Confirm the required batter and bowler selections before recording the next ball.');
      return;
    }
    if (!striker || !nonStriker || !bowler) {
      setError('Select a striker, non-striker, and bowler before recording a ball.');
      return;
    }
    if (String(selectedPlayers.striker) === String(selectedPlayers.nonStriker)) {
      setError('Striker and non-striker must be different players.');
      return;
    }
    if (isWicket && !dismissedPlayerId) {
      setError('Select the dismissed batter before recording the wicket.');
      return;
    }
    if (requiresFielderName && !fielder) {
      setError('Select a fielder before recording this dismissal.');
      return;
    }
    const scorerId = user.scorerId ?? user.scorer_id ?? user.id ?? user.userId ?? user.user_id;
    if (scorerId == null || String(scorerId).trim() === '') {
      setError('Your account has no scorer ID. Sign in again or contact support before scoring.');
      return;
    }
    const dismissedPlayer = [striker, nonStriker]
      .find((player) => String(player.id) === String(dismissedPlayerId));
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const scoringInnings = inningsData;
      const scoringInningsNumber = inningsNumber
        ?? inningsNumberFrom(inningsData)
        ?? Number(match.currentInnings ?? match.current_innings);
      const scoringDelivery = nextDeliveryFrom(scoringInnings, scoringInningsNumber === 1);

      if (
        !Number.isInteger(scoringInningsNumber)
        || scoringInningsNumber < 1
        || !scoringDelivery
        || !Number.isInteger(Number(scoringDelivery.overNumber))
        || Number(scoringDelivery.overNumber) < 1
        || !Number.isInteger(Number(scoringDelivery.ballNumber))
        || Number(scoringDelivery.ballNumber) < 1
      ) {
        throw new Error('The live match state does not include a valid current innings and overs value. Refresh the match and try again.');
      }
      const selectedRuns = Number(runs);
      const runsOffBat = ['WIDE', 'BYE', 'LEG_BYE'].includes(extraType) ? 0 : selectedRuns;
      const previousLegalBalls = legalBallCountFrom(scoringInnings);
      const overNumber = Number(scoringDelivery.overNumber);
      const ballNumber = Number(scoringDelivery.ballNumber);
      const updatedState = await matchService.submitBall({
        matchId: String(matchId),
        inningsNumber: scoringInningsNumber,
        overNumber,
        ballNumber,
        strikerId: striker.scoringId,
        strikerName: striker.name,
        nonStrikerId: nonStriker.scoringId,
        nonStrikerName: nonStriker.name,
        bowlerId: bowler.scoringId,
        bowlerName: bowler.name,
        runsOffBat,
        extraRuns: Number(extras),
        extraType,
        isWicket,
        wicketType: isWicket ? wicketType : null,
        scorerId: String(scorerId),
        dismissedPlayerId: isWicket ? String(dismissedPlayerId) : null,
        dismissedPlayerName: isWicket ? dismissedPlayer?.name ?? null : null,
        newBatterId: null,
        newBatterName: null,
        newBowlerId: null,
        newBowlerName: null,
        fielderName: requiresFielderName ? fielder.name : null,
      });
      const nextInningsState = currentInningsFrom(updatedState) ?? updatedState?.data?.data ?? updatedState?.data ?? updatedState;
      const nextLegalBalls = legalBallCountFrom(nextInningsState);
      const isLegalDelivery = !['WIDE', 'NO_BALL'].includes(extraType);
      const legalBallsAfterDelivery = nextLegalBalls ?? (
        previousLegalBalls == null ? null : previousLegalBalls + Number(isLegalDelivery)
      );
      const completedLegalOver = isLegalDelivery && (
        Number(scoringDelivery.ballNumber) === 6
        || (nextLegalBalls != null && previousLegalBalls != null
          && nextLegalBalls > previousLegalBalls && nextLegalBalls % 6 === 0)
      );
      const postDeliveryPlayers = activePlayersFrom(nextInningsState);
      const postDeliveryStriker = postDeliveryPlayers?.striker ?? selectedPlayers.striker;
      const postDeliveryNonStriker = postDeliveryPlayers?.nonStriker ?? selectedPlayers.nonStriker;
      const hasSameBatters = (
        String(postDeliveryStriker) === String(selectedPlayers.striker)
        && String(postDeliveryNonStriker) === String(selectedPlayers.nonStriker)
      ) || (
        String(postDeliveryStriker) === String(selectedPlayers.nonStriker)
        && String(postDeliveryNonStriker) === String(selectedPlayers.striker)
      );
      const strikerBeforeRotation = hasSameBatters
        ? selectedPlayers.striker
        : postDeliveryStriker;
      const nonStrikerBeforeRotation = hasSameBatters
        ? selectedPlayers.nonStriker
        : postDeliveryNonStriker;
      const extrasBeyondPenalty = ['WIDE', 'NO_BALL'].includes(extraType)
        ? Math.max(0, Number(extras) - 1)
        : Number(extras);
      const completedRuns = runsOffBat + extrasBeyondPenalty;
      const changeEnds = Boolean(completedRuns % 2) !== completedLegalOver;
      const nextStriker = changeEnds ? nonStrikerBeforeRotation : strikerBeforeRotation;
      const nextNonStriker = changeEnds ? strikerBeforeRotation : nonStrikerBeforeRotation;
      const dismissedSlot = String(dismissedPlayerId) === String(nextNonStriker)
        ? 'nonStriker'
        : 'striker';
      const totalRuns = runsOffBat + Number(extras);
      setMessage(isWicket
        ? `Wicket recorded${totalRuns ? ` with ${totalRuns} ${totalRuns === 1 ? 'run' : 'runs'}` : ''}.`
        : `${totalRuns} ${totalRuns === 1 ? 'run' : 'runs'} recorded.`);
      const responsePayload = updatedState?.data?.data ?? updatedState?.data ?? updatedState;
      const includesUpdatedInnings = responsePayload && typeof responsePayload === 'object'
        && (
          responsePayload.innings_data
          || responsePayload.inningsData
          || Array.isArray(responsePayload.innings)
          || responsePayload.total_runs != null
          || responsePayload.totalRuns != null
          || responsePayload.active_batters
          || responsePayload.activeBatters
        );
      const wicketLimit = battingRoster.length > 0
        ? Math.max(1, battingRoster.length - 1)
        : 10;
      const oversLimit = oversLimitFrom(match);
      const wicketsAfterDelivery = Number(
        nextInningsState?.totalWickets ?? nextInningsState?.total_wickets ?? nextInningsState?.wickets,
      );
      const wicketsLostAfterDelivery = Number.isInteger(wicketsAfterDelivery)
        ? wicketsAfterDelivery
        : wicketsLost + Number(isWicket);
      const inningsEndedOnThisDelivery = (
        inningsCompleteFrom(nextInningsState, match, battingRoster.length)
        || (oversLimit != null && legalBallsAfterDelivery != null
          && legalBallsAfterDelivery >= oversLimit * 6)
        || wicketsLostAfterDelivery >= wicketLimit
      );
      if (includesUpdatedInnings) applyLiveState(updatedState);
      else if (inningsEndedOnThisDelivery) {
        const totalRunsBefore = Number(
          scoringInnings?.totalRuns ?? scoringInnings?.total_runs ?? 0,
        );
        applyLiveState({
          ...scoringInnings,
          totalRuns: totalRunsBefore + runsOffBat + Number(extras),
          totalWickets: wicketsLostAfterDelivery,
          totalLegalBalls: legalBallsAfterDelivery,
          formattedOvers: legalBallsAfterDelivery == null
            ? scoringInnings?.formattedOvers
            : `${Math.floor(legalBallsAfterDelivery / 6)}.${legalBallsAfterDelivery % 6}`,
          isCompleted: true,
        });
      } else await refreshInnings();
      if (inningsEndedOnThisDelivery && scoringInningsNumber === 1) {
        await initializeSecondInnings();
      } else if (inningsEndedOnThisDelivery && scoringInningsNumber === 2) {
        onReload(matchId);
      }
      if (!inningsEndedOnThisDelivery) {
        setSelectedPlayers((current) => ({
          ...current,
          striker: nextStriker,
          nonStriker: nextNonStriker,
        }));
      }
      const requiredPlayerRoles = [];
      if (isWicket && !inningsEndedOnThisDelivery) {
        setPlayersToReplace((current) => ({
          ...current,
          [dismissedSlot]: selectedPlayers[dismissedSlot],
        }));
        setSelectedPlayers((current) => ({ ...current, [dismissedSlot]: '' }));
        requiredPlayerRoles.push(dismissedSlot);
      }
      if (completedLegalOver && !inningsEndedOnThisDelivery) {
        setPreviousOverBowlerId(String(selectedPlayers.bowler));
        setBowlerChangeReason('over');
        setPlayersToReplace((current) => ({ ...current, bowler: selectedPlayers.bowler }));
        setSelectedPlayers((current) => ({ ...current, bowler: '' }));
        requiredPlayerRoles.push('bowler');
      }
      setPendingPlayerRoles(requiredPlayerRoles);
      setPlayerSelectionOpen(requiredPlayerRoles.length > 0);
      setWicketType('NONE');
      setFielderId('');
      setSelectedDismissedPlayer('');
      setExtraType('NONE');
      setExtras(0);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally { setBusy(false); }
  };

  const saveActivePlayers = async () => {
    if (!user) { onAuth(); return; }
    if (!hasValidInnings) {
      setError('The current innings could not be identified, so active players cannot be saved.');
      return;
    }
    if (!striker || !nonStriker || !bowler) {
      setError('Select a striker, non-striker, and bowler before saving.');
      return;
    }
    if (String(selectedPlayers.striker) === String(selectedPlayers.nonStriker)) {
      setError('Striker and non-striker must be different players.');
      return;
    }
    if (pendingPlayerRoles.includes('bowler')
      && previousOverBowlerId
      && String(selectedPlayers.bowler) === String(previousOverBowlerId)) {
      setError('A bowler cannot bowl consecutive overs. Select a different bowler.');
      return;
    }
    if (inningsComplete) {
      setError('This innings has ended; active players cannot be changed.');
      return;
    }
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await matchService.setActivePlayers(matchId, inningsNumber, {
        strikerId: striker.scoringId,
        nonStrikerId: nonStriker.scoringId,
        bowlerId: bowler.scoringId,
      });
      const updatedInnings = currentInningsFrom(response);
      setInningsData(updatedInnings);
      setLiveState(updatedInnings);
      const updatedNumber = inningsNumberFrom(response);
      if (updatedNumber) setInningsNumber(updatedNumber);
      const activePlayers = activePlayersFrom(updatedInnings);
      if (activePlayers) setSelectedPlayers((current) => mergeActivePlayers(current, activePlayers));
      setPendingPlayerRoles([]);
      setPlayersToReplace({});
      if (bowlerChangeReason !== 'injury') setPreviousOverBowlerId('');
      setBowlerChangeReason(null);
      setPlayerSelectionOpen(false);
      setMessage(`Active players saved for innings ${inningsNumber}.`);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  };

  const replaceInjuredBowler = () => {
    if (!bowler || inningsComplete || needsPlayerSelection || playerSelectionOpen) return;
    setPlayersToReplace((current) => ({ ...current, bowler: selectedPlayers.bowler }));
    setSelectedPlayers((current) => ({ ...current, bowler: '' }));
    setBowlerChangeReason('injury');
    setPendingPlayerRoles(['bowler']);
    setPlayerSelectionOpen(true);
    setMessage('');
    setError('');
  };

  const undoBall = async () => {
    if (!user) { onAuth(); return; }
    if (!hasValidInnings) {
      setError('The current innings could not be identified, so the last ball cannot be undone.');
      return;
    }
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await matchService.undoLastBall(matchId, inningsNumber);
      await refreshInnings();
      const payload = response?.data?.data ?? response?.data ?? response;
      setMessage(payload?.message || 'Last delivery reverted successfully.');
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  };

  const startLiveMatch = async () => {
    const tossWinnerTeamId = tossWinner === 'teamA' ? teamAId : teamBId;
    if (!matchId || !tossWinnerTeamId || !tossDecision) {
      setError('Match ID, toss winner, and toss decision are required to start the match.');
      return;
    }
    if ([teamAId, teamBId].some((teamId) => teamId != null && String(teamId) === String(matchId))) {
      setError('The match ID matches a team ID. Reload the match and verify the match details before starting.');
      return;
    }
    if (!openingStriker || !openingNonStriker || !openingBowler) {
      setError('Select the opening striker, non-striker, and bowler before starting the match.');
      return;
    }
    if (String(openingStriker.id) === String(openingNonStriker.id)) {
      setError('The opening striker and non-striker must be different players.');
      return;
    }
    setBusy(true);
    setMessage('');
    setError('');
    let matchStarted = false;
    try {
      const updatedMatch = await matchService.startMatch(matchId, {
        tossWinnerTeamId: String(tossWinnerTeamId),
        tossDecision,
      });
      matchStarted = true;
      let firstInningsNumber = inningsNumberFrom(updatedMatch);
      if (!firstInningsNumber) {
        try {
          firstInningsNumber = inningsNumberFrom(await matchService.getInnings(matchId));
        } catch {
          // A newly started match is its first innings when the API omits innings details.
        }
      }
      await matchService.setActivePlayers(matchId, firstInningsNumber || 1, {
        strikerId: openingStriker.scoringId,
        nonStrikerId: openingNonStriker.scoringId,
        bowlerId: openingBowler.scoringId,
      });
      const decisionLabel = tossDecision === 'BAT' ? 'bat' : 'field';
      setMessage(`${tossWinner === 'teamA' ? teamName(match, 'teamA') : teamName(match, 'teamB')} won the toss and chose to ${decisionLabel}. Opening players saved; match is live.`);
      onReload(matchId);
    } catch (requestError) {
      // Start may have succeeded even if the active-player save failed.
      if (matchStarted) {
        setSelectedPlayers({ striker: '', nonStriker: '', bowler: '' });
        onReload(matchId);
      }
      setError(getErrorMessage(requestError));
    }
    finally { setBusy(false); }
  };

  const displayedInnings = selectedReportInnings != null && inningsReport
    ? inningsReport
    : (liveState ? { ...(inningsData ?? {}), ...liveState } : inningsData);
  const displayedRuns = Number(displayedInnings?.totalRuns ?? displayedInnings?.total_runs ?? 0);
  const displayedWickets = Number(displayedInnings?.totalWickets ?? displayedInnings?.wickets ?? 0);
  const displayedOvers = scorecardOvers(displayedInnings);
  const displayedDeliveries = Array.isArray(
    displayedInnings?.recentDeliveries ?? displayedInnings?.ball_history_stack,
  ) ? (displayedInnings.recentDeliveries ?? displayedInnings.ball_history_stack) : [];
  const tossWinnerTeamIdForInfo = match.tossWinnerTeamId ?? match.tossWinnerId
    ?? match.toss?.winnerTeamId ?? match.toss?.winner_team_id;
  const tossWinnerSlot = teamSlotFor(tossWinnerTeamIdForInfo, match);
  const matchFormat = match.format ?? match.totalOvers ?? match.total_overs ?? match.overs;

  return (
    <main className="inner-page match-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to matches</button>
      <div className="scoreboard">
        <div className="scoreboard-meta">
          <span className={`match-status scoreboard-status ${completed ? 'status-done' : ''}`}>
            {!completed && !scheduled && <i className="live-dot" />}
            {completed ? 'COMPLETED' : String(match.status || (scheduled ? 'UPCOMING' : 'LIVE')).toUpperCase()}
          </span>
          <span className="scoreboard-details">
            <span>{match.format || `${match.overs || '—'} overs`}</span>
            {match.venue && <><span className="scoreboard-detail-separator" aria-hidden="true">·</span><span>{match.venue}</span></>}
          </span>
        </div>
        <nav className="match-center-tabs" role="tablist" aria-label="Match sections">
          {MATCH_TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={activeMatchTab === tab.id ? 'selected' : ''}
              aria-current={activeMatchTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveMatchTab(tab.id)}
            >{tab.label}</button>
          ))}
        </nav>
        <p className={`match-summary${matchResult ? ' match-result-banner' : ''}`}>
          {matchResult || match.message || (completed ? 'That’s a wrap. What a game.' : scheduled ? 'Match scheduled. Complete the toss to start scoring.' : 'The match is underway. Follow every ball right here.')}
        </p>
      </div>
      {activeMatchTab === 'info' && (
        <section className="match-tab-panel match-info-panel">
          <h2>Match information</h2>
          <dl>
            <div><dt>Fixture</dt><dd>{teamName(match, 'teamA')} vs {teamName(match, 'teamB')}</dd></div>
            <div><dt>Status</dt><dd>{String(match.status || (scheduled ? 'UPCOMING' : 'LIVE')).toUpperCase()}</dd></div>
            <div><dt>Format</dt><dd>{matchFormat ? `${matchFormat}${typeof matchFormat === 'number' ? ' overs' : ''}` : '—'}</dd></div>
            <div><dt>Venue</dt><dd>{match.venue ?? 'Venue not available'}</dd></div>
            <div><dt>Toss</dt><dd>{tossWinnerSlot
              ? `${teamName(match, tossWinnerSlot)} chose to ${String(match.tossDecision ?? match.toss?.decision ?? '').toUpperCase() === 'BAT' ? 'bat' : 'field'}`
              : 'Toss information not available'}</dd></div>
            <div><dt>Result</dt><dd>{matchResult ?? (completed ? 'Result unavailable' : 'Match in progress')}</dd></div>
          </dl>
        </section>
      )}
      {activeMatchTab === 'squads' && (
        <section className="match-tab-panel match-squads-panel">
          <h2>Squads</h2>
          <div className="match-squads-grid">
            {[
              { slot: 'teamA', players: rosters.teamA },
              { slot: 'teamB', players: rosters.teamB },
            ].map(({ slot, players }) => (
              <section className="match-squad-card" key={slot}>
                <h3>{teamName(match, slot)}</h3>
                {players.length
                  ? <ol>{players.map((player) => <li key={player.id}>{player.name}</li>)}</ol>
                  : <p>Squad details are not available.</p>}
              </section>
            ))}
          </div>
        </section>
      )}
      {activeMatchTab === 'overs' && (
        <section className="match-tab-panel">
          <h2>Recent overs</h2>
          <p className="match-tab-note">Recent deliveries from the current innings</p>
          {displayedDeliveries.length
            ? <div className="match-delivery-list">{displayedDeliveries.map((item, index) => (
              <span key={`${item.ballId ?? index}-${index}`} className={item.isWicket ? 'delivery-wicket' : ''}>
                {item.batter ?? 'Ball'} · {deliveryLabel(item)}
              </span>
            ))}</div>
            : <p>Ball-by-ball data is not available yet.</p>}
        </section>
      )}
      {activeMatchTab === 'graphs' && (
        <section className="match-tab-panel">
          <h2>Match graphs</h2>
          <p className="match-tab-note">Temporary run-rate preview</p>
          <div className="match-graph" role="img" aria-label={`Current innings score: ${displayedRuns} runs`}>
            {[12, 24, 38, 55, 72, 100].map((height, index) => (
              <div key={height} className="match-graph-column">
                <span style={{ height: `${Math.max(8, height * (displayedRuns ? 1 : 0.35))}%` }} />
                <small>{index + 1} ov</small>
              </div>
            ))}
          </div>
          <p className="match-graph-summary">{displayedRuns}/{displayedWickets} in {displayedOvers} overs</p>
        </section>
      )}
      {activeMatchTab === 'scorecard' && availableInnings.length > 0 && (
        <nav className="innings-report-tabs" aria-label="Innings reports">
          {availableInnings.map((number) => (
            <button
              type="button"
              key={number}
              className={selectedReportInnings === number ? 'selected' : ''}
              aria-pressed={selectedReportInnings === number}
              disabled={reportLoading}
              onClick={() => showInningsReport(number)}
            >Innings {number} report</button>
          ))}
        </nav>
      )}
      {activeMatchTab === 'scorecard' && snapshotsLoading && !reportLoading && (
        <p className="toss-note" role="status">Loading innings snapshots…</p>
      )}
      {activeMatchTab === 'scorecard' && reportLoading && <p className="toss-note" role="status">Loading innings {selectedReportInnings} report…</p>}
      {activeMatchTab === 'scorecard' && reportError && <p className="form-error" role="alert">{reportError}</p>}
      {(activeMatchTab === 'scorecard' || activeMatchTab === 'live')
        && selectedReportInnings != null && activeMatchTab === 'scorecard'
        && !reportLoading && !reportError && inningsReport ? (
        <Scorecard
          match={match}
          innings={inningsReport}
          battingTeam={inningsTeamSlot(inningsReport, 'batting', match)}
          allPlayers={[...rosters.teamA, ...rosters.teamB]}
          striker={null}
          nonStriker={null}
          bowler={null}
        />
      ) : activeMatchTab === 'live' || (activeMatchTab === 'scorecard'
        && selectedReportInnings == null && !completed) ? (
        <Scorecard
          match={match}
          innings={activeMatchTab === 'live'
            ? (liveState ? { ...(inningsData ?? {}), ...liveState } : inningsData)
            : displayedInnings}
          battingTeam={liveBattingTeam ?? battingTeam}
          allPlayers={[...rosters.teamA, ...rosters.teamB]}
          striker={striker}
          nonStriker={nonStriker}
          bowler={bowler}
        />
      ) : null}
      {activeMatchTab === 'live' && (!completed && !isAssignedScorer ? null : scheduled ? (
        <section className="scorer-panel toss-panel" aria-labelledby="match-initialization-title">
          <div className="scorer-heading"><div><span className="eyebrow">BEFORE PLAY</span><h2 id="match-initialization-title">Match initialization</h2><p>Set the toss and select the opening players before the first delivery.</p></div></div>
          <div className="toss-controls">
            <label>
              Toss winner
              <select
                value={tossWinner}
                onChange={(event) => {
                  setTossWinner(event.target.value);
                  setSelectedPlayers({ striker: '', nonStriker: '', bowler: '' });
                }}
              >
                <option value="">Select a team</option>
                <option value="teamA">{teamName(match, 'teamA')}</option>
                <option value="teamB">{teamName(match, 'teamB')}</option>
              </select>
            </label>
            <label>
              Winner chooses to
              <select
                value={tossDecision}
                onChange={(event) => {
                  setTossDecision(event.target.value);
                  setSelectedPlayers({ striker: '', nonStriker: '', bowler: '' });
                }}
              >
                <option value="">Select bat or bowl</option>
                <option value="BAT">Bat</option>
                <option value="FIELD">Field</option>
              </select>
            </label>
          </div>
          <div className="active-players setup-active-players">
            <div className="active-players-heading">
              <div>
                <h3>Opening players</h3>
                <p>
                  {setupBattingTeam && setupBowlingTeam
                    ? `${teamName(match, setupBattingTeam)} will bat; ${teamName(match, setupBowlingTeam)} will bowl.`
                    : 'Choose the toss winner and decision to identify the batting and bowling teams.'}
                </p>
              </div>
            </div>
            {rosterLoading && <p className="toss-note" role="status">Loading team rosters…</p>}
            {rosterError && <p className="form-error" role="alert">Could not load team rosters: {rosterError}</p>}
            <div className="setup-player-grid">
              {[
                { key: 'striker', label: 'Opening striker', slot: setupBattingTeam },
                { key: 'nonStriker', label: 'Opening non-striker', slot: setupBattingTeam },
                { key: 'bowler', label: 'Opening bowler', slot: setupBowlingTeam },
              ].map(({ key, label, slot }) => (
                <label className="player-dialog-field" htmlFor={`opening-${key}`} key={key}>
                  {label}{slot ? ` · ${teamName(match, slot)}` : ''}
                  <select
                    id={`opening-${key}`}
                    value={selectedPlayers[key]}
                    disabled={busy || rosterLoading || !slot}
                    onChange={(event) => setSelectedPlayers((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))}
                  >
                    <option value="">Select {label.toLowerCase()}</option>
                    {(slot ? rosters[slot] : []).map((player) => {
                      const isSameBatter = (key === 'striker' && String(selectedPlayers.nonStriker) === String(player.id))
                        || (key === 'nonStriker' && String(selectedPlayers.striker) === String(player.id));
                      return (
                        <option key={player.id} value={player.id} disabled={isSameBatter}>
                          {player.name}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <Button
            disabled={busy || rosterLoading || !tossWinner || !tossDecision
              || !(tossWinner === 'teamA' ? teamAId : teamBId)
              || !openingStriker || !openingNonStriker || !openingBowler
              || String(selectedPlayers.striker) === String(selectedPlayers.nonStriker)}
            onClick={startLiveMatch}
          >Confirm toss &amp; opening players</Button>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="success-message"><Check size={15} />{message}</p>}
        </section>
      ) : completed ? (
        <section className="scorer-panel completed-panel">
          <div><span className="eyebrow">THE FINAL WORD</span><h2>{matchResult || 'Match complete.'}</h2><p>Your scorecard is ready to keep.</p></div>
          <Button onClick={download}><Download size={16} /> Download scorecard PDF</Button>
        </section>
      ) : inningsComplete ? (
        <section className="scorer-panel completed-panel" role="status">
          <div>
            <span className="eyebrow">INNINGS COMPLETE</span>
            <h2>{inningsNumber === 1 ? 'First innings complete.' : 'Innings complete.'}</h2>
            <p>{inningsNumber === 1
              ? 'The teams will switch for innings 2. Initialize it to select the opening players.'
              : 'Player selection and ball scoring are paused because this innings has ended.'}</p>
          </div>
          {inningsNumber === 1 && (
            <Button disabled={busy} onClick={retryStartSecondInnings}>
              Start second innings
            </Button>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      ) : (
        <section className="scorer-panel">
          <div className="scorer-heading"><div><span className="eyebrow">SCORE THIS MATCH</span><h2>Record a ball</h2><p>Select the outcome, then record it. {runs !== '0' && <span className="local-score">Selected runs: {runs}</span>}</p></div><span className="scorer-ball"><CircleDot size={19} /></span></div>
          {(needsPlayerSelection || playerSelectionOpen) && (
            <div className="player-dialog-backdrop">
              <section
                className="player-selection-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="player-dialog-title"
                aria-describedby="player-dialog-description"
              >
                <span className="eyebrow">MATCH SETUP</span>
                <h2 id="player-dialog-title">{inningsNumber === 2
                  ? 'Choose the opening players'
                  : playerSelectionTitle}</h2>
                <p id="player-dialog-description">
                  {inningsNumber === 2
                    ? 'The teams have switched. Select the opening batters and bowler for the second innings.'
                    : playerSelectionDescription}
                </p>
                {selectionRoles.map((key, index) => {
                  const label = key === 'nonStriker' ? 'Non-striker' : key === 'striker' ? 'Striker' : 'Bowler';
                  const slot = key === 'bowler' ? bowlingTeam : battingTeam;
                  return (
                    <label className="player-dialog-field" htmlFor={`match-${key}`} key={key}>
                      {label} · {slot ? teamName(match, slot) : 'Team unavailable'}
                      <select
                        id={`match-${key}`}
                        autoFocus={index === 0}
                        value={selectedPlayers[key]}
                        disabled={busy || rosterLoading || !slot || !rosters[slot].length}
                        onChange={(event) => {
                          setSelectedPlayers((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }));
                          setPlayerSelectionOpen(true);
                        }}
                      >
                        <option value="">Select {label.toLowerCase()}</option>
                        {(slot ? rosters[slot] : []).map((rosterPlayer) => {
                          const selectedElsewhere = (key === 'striker' && String(selectedPlayers.nonStriker) === String(rosterPlayer.id))
                            || (key === 'nonStriker' && String(selectedPlayers.striker) === String(rosterPlayer.id))
                            || (playersToReplace[key] != null
                              && String(playersToReplace[key]) === String(rosterPlayer.id))
                            || (key === 'bowler' && pendingPlayerRoles.includes('bowler')
                              && previousOverBowlerId
                              && String(previousOverBowlerId) === String(rosterPlayer.id));
                          return (
                            <option key={rosterPlayer.id} value={rosterPlayer.id} disabled={selectedElsewhere}>
                              {rosterPlayer.name}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  );
                })}
                {rosterLoading && <p className="toss-note" role="status">Loading team rosters…</p>}
                {rosterError && <p className="form-error" role="alert">Could not load team rosters: {rosterError}</p>}
                {!rosterLoading && !rosterError && !canSaveActivePlayers && (
                  <p className="toss-note">
                    {pendingPlayerRoles.includes('bowler') && previousOverBowlerId
                      && String(selectedPlayers.bowler) === String(previousOverBowlerId)
                      ? 'A bowler cannot bowl consecutive overs. Choose a different bowler.'
                      : 'Choose a different player for each role before continuing.'}
                  </p>
                )}
                <div className="active-player-save">
                  <Button disabled={busy || rosterLoading || !canSaveActivePlayers} onClick={saveActivePlayers}>
                    Proceed
                  </Button>
                </div>
              </section>
            </div>
          )}
          <div className="ball-entry-controls">
            <div className="ball-choice-group" role="group" aria-label="Runs off bat">
              <span>Runs off bat</span>
              <div className="ball-choice-buttons">
                {[0, 1, 2, 3, 4, 6].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={runs === String(value) ? 'selected' : ''}
                    aria-pressed={runs === String(value)}
                    disabled={busy}
                    onClick={() => setRuns(String(value))}
                  >{value === 0 ? 'Dot' : value}</button>
                ))}
              </div>
            </div>
            <div className="ball-choice-group" role="group" aria-label="Extra type">
              <span>Extra type</span>
              <div className="ball-choice-buttons">
                {[
                  { value: 'NONE', label: 'None' },
                  { value: 'WIDE', label: 'Wide' },
                  { value: 'NO_BALL', label: 'No ball' },
                  { value: 'BYE', label: 'Byes' },
                  { value: 'LEG_BYE', label: 'Leg byes' },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={extraType === option.value ? 'selected' : ''}
                    aria-pressed={extraType === option.value}
                    disabled={busy}
                    onClick={() => {
                      setExtraType(option.value);
                      setExtras(option.value === 'NONE' ? 0 : (extras > 0 ? extras : 1));
                    }}
                  >{option.label}</button>
                ))}
              </div>
            </div>
            {extraType !== 'NONE' && (
              <div className="ball-choice-group" role="group" aria-label="Extra runs">
                <span>Extra runs</span>
                <div className="ball-choice-buttons">
                  {[1, 2, 3, 4, 5, 6].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={extras === value ? 'selected' : ''}
                      aria-pressed={extras === value}
                      disabled={busy}
                      onClick={() => setExtras(value)}
                    >{value}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="ball-choice-group" role="group" aria-label="Wicket type">
              <span>Wicket type</span>
              <div className="ball-choice-buttons">
                {[
                  { value: 'NONE', label: 'No wicket' },
                  { value: 'BOWLED', label: 'Bowled' },
                  { value: 'CAUGHT', label: 'Caught' },
                  { value: 'RUN_OUT', label: 'Run out' },
                  { value: 'LBW', label: 'LBW' },
                  { value: 'STUMPED', label: 'Stumped' },
                  { value: 'HIT_WICKET', label: 'Hit wicket' },
                  { value: 'RETIRED_OUT', label: 'Retired out' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`wicket-button ${wicketType === option.value ? 'selected' : ''}`}
                    aria-pressed={wicketType === option.value}
                    disabled={busy}
                    onClick={() => setWicketType(option.value)}
                  >{option.label}</button>
                ))}
              </div>
            </div>
            {requiresFielderName && (
              <label className="player-dialog-field" htmlFor="dismissal-fielder">
                Fielder · {bowlingTeam ? teamName(match, bowlingTeam) : 'Fielding team'}
                <select
                  id="dismissal-fielder"
                  value={fielderId}
                  autoComplete="off"
                  required
                  disabled={busy || rosterLoading || !bowlingRoster.length}
                  onChange={(event) => setFielderId(event.target.value)}
                >
                  <option value="">Select fielder</option>
                  {bowlingRoster.map((player) => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
              </label>
            )}
            {isWicket && (
              <div className="ball-choice-group" role="group" aria-label="Dismissed batter">
                <span>Dismissed batter</span>
                <div className="ball-choice-buttons">
                  {[
                    { id: selectedPlayers.striker, label: striker?.name || 'Striker' },
                    { id: selectedPlayers.nonStriker, label: nonStriker?.name || 'Non-striker' },
                  ].filter((player) => player.id).map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className={String(dismissedPlayerId) === String(player.id) ? 'selected' : ''}
                      aria-pressed={String(dismissedPlayerId) === String(player.id)}
                      disabled={busy}
                      onClick={() => setSelectedDismissedPlayer(String(player.id))}
                    >{player.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {delivery && <p className="toss-note">Next delivery: over {delivery.overNumber}, ball {delivery.ballNumber}. Runs from overthrows are entered as runs off bat.</p>}
          <div className="ball-actions">
            <Button disabled={busy || !hasValidInnings || !delivery || needsPlayerSelection || playerSelectionOpen} onClick={recordBall}>Record ball</Button>
            <Button variant="outline" disabled={busy || !hasValidInnings} onClick={undoBall}><Undo2 size={16} /> Undo last ball</Button>
            <Button
              variant="outline"
              disabled={busy || !hasValidInnings || !bowler || inningsComplete || needsPlayerSelection || playerSelectionOpen}
              onClick={replaceInjuredBowler}
            >Replace injured bowler</Button>
          </div>
          {!inningsNumber && !inningsError && <p className="toss-note">Loading the current innings for undo…</p>}
          {inningsError && <p className="toss-note" role="status">Could not identify the current innings automatically: {inningsError}. Refresh the match before undoing a delivery.</p>}
          {!user && <p className="scoring-gate"><LogIn size={15} /> <button onClick={onAuth}>Sign in</button> to record or undo balls.</p>}
          {message && <p className="success-message"><Check size={15} />{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
          <div className="scorecard-export-actions" aria-label="Scorecard actions">
            <Button variant="outline" disabled={busy} onClick={download}>
              <Download size={16} /> Export PDF
            </Button>
            <Button variant="outline" disabled={busy} onClick={shareScorecard}>
              <Share2 size={16} /> Share scorecard
            </Button>
          </div>
        </section>
      ))}
      {error && completed && <p className="form-error" role="alert">{error}</p>}
    </main>
  );
}
