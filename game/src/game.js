// Round state and economy: one place for everything the round owns.
// A round is 100 seconds. Ember wins by eliminating Slate, or by planting
// the bomb and letting the 40 s fuse run out. Slate wins by eliminating
// Ember, by the timer running out before a plant, or by defusing (5 s
// channel). First team to 5 rounds takes the match.
// Economy: $800 to start. Win +$300, loss +$150, kill +$100, plant +$150.
// The buy menu spends it between rounds; money carries over.
export const ROUND_TIME = 100;
export const WIN_ROUNDS = 5;
export const PLANT_TIME = 3;
export const FUSE_TIME = 40;
export const DEFUSE_TIME = 5;
export const BUY_TIME = 20;

export const ECONOMY = {
  startMoney: 800,
  winBonus: 300,
  lossBonus: 150,
  killBonus: 100,
  plantBonus: 150,
};

export function createGameState() {
  return {
    phase: 'lobby', // lobby | buy | playing | roundEnd | matchEnd
    round: 1,
    emberRounds: 0,
    slateRounds: 0,
    timer: ROUND_TIME,
    money: ECONOMY.startMoney,
    kills: 0,
    grenades: 0,
    armor: 0,
    weaponId: 'carbine',
    buyTimer: BUY_TIME,
    targetSite: 'A',
    started: false,
  };
}

export function startBuyPhase(state) {
  state.phase = 'buy';
  state.buyTimer = BUY_TIME;
}

export function startRound(state) {
  state.phase = 'playing';
  state.timer = ROUND_TIME;
  state.started = true;
}

export function awardKill(state) {
  state.kills += 1;
  state.money += ECONOMY.killBonus;
}

export function awardRoundWin(state) {
  state.money += ECONOMY.winBonus;
}

export function awardRoundLoss(state) {
  state.money += ECONOMY.lossBonus;
}

export function awardPlant(state) {
  state.money += ECONOMY.plantBonus;
}
