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

// New: Individual Bot State
export interface BotState {
  id: number;
  name: string;
  personality: 'Whale' | 'Degen' | 'Farmer' | 'PaperHand' | 'DiamondHand';
  lvMON: number;
  meme: number;
  stakedMeme: number;
  medals: number;
  wealth: number;
  chests: number;
  equipmentCount: number;
}

export interface DailyLog {
  day: number;
  memePrice: number;
  reservoirBalance: number;
  buybackAmount: number;
  buybackMemeAmount: number; // New: Actual MEME bought back
  buybackRate: number; // The % used from reservoir
  totalWealth: number;
  newWealth: number;
  stakingApy?: number; // Visualizing staking returns
  botActivity?: number; // Multiplier of bot activity
  botRoi?: number; // Calculated ROI for bots
  medalsInPool?: number; // New: Track historical pool size for cost calculation
  aiAnalysis?: string; // AI Market Analysis text
}

// Config Constants
export const CONFIG = {
  CRAFT_COST: 3000, // Updated per prompt request (was 300)
  WEALTH_PER_ITEM: 286,
  WEALTH_SALVAGE_RATE: 0.5, // 50% return on destruction
  CHEST_OPEN_COST: 100, // Adjusted relative to craft cost
  MEDAL_MIN: 5,
  MEDAL_MAX: 15,
  DAILY_MEME_REWARD: 1000000,
  INITIAL_AMM_MEME: 1000000,
  INITIAL_AMM_LVMON: 2000000,
  INITIAL_PLAYER_LVMON: 50000, // Increased for testing
  
  // Simulation Constants
  SIM_OTHERS_COUNT: 10, // Explicitly 10 bots
};