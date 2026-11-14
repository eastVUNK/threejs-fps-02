// Round state: one place for everything the round owns.
// A round is 100 seconds, Ember wins by eliminating every Slate bot, Slate
// wins by eliminating the player or by the timer running out. First team to
// 5 rounds takes the match. Money: $800 to start, +$300 a round win,
// +$100 a kill; the buy menu (Stage 2) spends it between rounds.
export const ROUND_TIME = 100;
export const WIN_ROUNDS = 5;

export function createGameState() {
  return {
    phase: 'lobby', // lobby | playing | roundEnd | matchEnd
    round: 1,
    emberRounds: 0,
    slateRounds: 0,
    timer: ROUND_TIME,
    money: 800,
    kills: 0,
    started: false,
    roundEndTimer: 0,
  };
}

export function startRound(state) {
  state.phase = 'playing';
  state.timer = ROUND_TIME;
  state.started = true;
}

export function awardKill(state) {
  state.kills += 1;
  state.money += 100;
}

export function awardRoundWin(state) {
  state.money += 300;
}
