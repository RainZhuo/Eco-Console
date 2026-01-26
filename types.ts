export interface GlobalState {
  day: number;
  reservoirLvMON: number; // The "Sink" collecting fees
  totalWealth: number; // Sum of all players' wealth (Player + Simulated Others)
  dailyNewWealth: number; // X-axis for Sigmoid
  medalsInPool: number; // Medals invested in the current daily pool (Player + Others)
  totalStakedMeme: number; // Total MEME staked in the system
}

export interface AMMState {
  reserveMEME: number;
  reserveLvMON: number;
  lpTokenSupply: number;
}

export interface PlayerState {
  lvMON: number;
  meme: number;
  medals: number;
  wealth: number; // Bound Wealth
  chests: number;
  equipmentCount: number;
  investedMedals: number; // Medals invested by player in current daily pool
  
  // New: Staking System
  stakedMeme: number;
  
  // New: Claimable Rewards
  unclaimedPoolReward: number; // MEME from Medal Pool (Pending 90% claim)
  unclaimedRedistribution: number; // MEME from others' 10% tax
  unclaimedStakingReward: number; // MEME from Reservoir Buyback (10% allocation)
}

export interface DailyLog {
  day: number;
  memePrice: number;
  reservoirBalance: number;
  buybackAmount: number;
  buybackRate: number; // The % used from reservoir
  totalWealth: number;
  newWealth: number;
  stakingApy?: number; // Visualizing staking returns
  botActivity?: number; // Multiplier of bot activity
  botRoi?: number; // Calculated ROI for bots
}

// Config Constants
export const CONFIG = {
  CRAFT_COST: 300, // Updated per prompt
  WEALTH_PER_ITEM: 286,
  CHEST_OPEN_COST: 10,
  MEDAL_MIN: 5,
  MEDAL_MAX: 15,
  DAILY_MEME_REWARD: 1000000,
  INITIAL_AMM_MEME: 10000000,
  INITIAL_AMM_LVMON: 1000000,
  INITIAL_PLAYER_LVMON: 5000, // Increased starting capital for easier testing
  
  // Simulation Constants
  SIM_OTHERS_COUNT: 100, // Virtual players
  SIM_OTHERS_DAILY_WEALTH_AVG: 5000,
  SIM_OTHERS_MEDAL_INVEST_AVG: 500,
};