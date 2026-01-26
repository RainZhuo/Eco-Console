import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ResponsiveContainer, AreaChart, Area, BarChart, Bar, ComposedChart 
} from 'recharts';
import { 
  Coins, Box, Hammer, TrendingUp, RefreshCw, Archive, Activity, DollarSign, Database, Lock, Unlock, Gift, Users, Gauge, TrendingDown, Zap, Flame 
} from 'lucide-react';
import { AMMState, GlobalState, PlayerState, DailyLog, CONFIG } from './types';
import { calculateBuybackRate, formatNumber, getAmountOut } from './utils';
import { InfoCard } from './components/InfoCard';

interface BotDecisionContext {
    currentPrice: number;
    lastPrice: number;
    lastApy: number;
}

// Helper to simulate bot activity for a day with "Smart" logic
const generateBotActivity = (context?: BotDecisionContext) => {
    let activityMultiplier = 1.0;
    let computedRoi = 0;
    
    // Smart Logic: Only apply if context is provided (after Day 1)
    if (context) {
        // 1. Calculate Expected ROI
        // Cost Basis:
        // Avg Wealth (5000) ~= 17.5 items. 
        // Craft Cost = 17.5 * CONFIG.CRAFT_COST
        // Chest Cost = (5000/100) * CONFIG.CHEST_OPEN_COST = 50 * 10 = 500
        // Gross Outlay = 5250 + 500 = 5750 LvMON
        const avgItems = CONFIG.SIM_OTHERS_DAILY_WEALTH_AVG / CONFIG.WEALTH_PER_ITEM;
        const avgChests = CONFIG.SIM_OTHERS_DAILY_WEALTH_AVG / 100;
        const grossOutlay = (avgItems * CONFIG.CRAFT_COST) + (avgChests * CONFIG.CHEST_OPEN_COST);
        
        // ** NEW LOGIC **: Recoverable Value (Salvage)
        // Since bots know they can destroy wealth to get 50% back, the "Risk Cost" is lower.
        // Recoverable = Wealth Generated * 50%
        const recoverableValue = (avgItems * CONFIG.WEALTH_PER_ITEM) * CONFIG.WEALTH_SALVAGE_RATE;
        
        // Effective Cost = Outlay - Recoverable Value
        // This simulates that the bot considers the asset value retained in the equipment.
        const effectiveCost = grossOutlay - recoverableValue;

        // Revenue Basis:
        // Avg Medals = 50 chests * 10 = 500 medals.
        // Pool Share assumption: 100 bots * 500 = 50000 medals total.
        // Share = 500 / 50000 = 1%.
        // Reward = 1M MEME * 1% = 10,000 MEME.
        // Value = 10,000 * Price.
        const estMedals = avgChests * 10;
        // Estimate total pool as if everyone is normal (simplified expectation)
        const estTotalPool = (CONFIG.SIM_OTHERS_COUNT * CONFIG.SIM_OTHERS_MEDAL_INVEST_AVG) + 100; 
        const share = estMedals / estTotalPool;
        const estRewardMeme = CONFIG.DAILY_MEME_REWARD * share;
        const estRevenue = estRewardMeme * context.currentPrice;

        computedRoi = estRevenue / effectiveCost;

        // Decision: Adjust Activity based on ROI
        // ROI < 0.5 -> Deep Freeze (0.2x activity)
        // ROI > 2.0 -> FOMO (2.5x activity)
        if (computedRoi < 0.5) activityMultiplier = 0.2;
        else if (computedRoi < 0.9) activityMultiplier = 0.5;
        else if (computedRoi > 3.0) activityMultiplier = 3.0;
        else if (computedRoi > 1.5) activityMultiplier = 1.5;
        else activityMultiplier = 1.0;
    }

    // Random fluctuation on top of decision
    const volatility = () => (0.9 + Math.random() * 0.2);
    
    const finalMultiplier = activityMultiplier * volatility();

    const newWealth = Math.floor(CONFIG.SIM_OTHERS_COUNT * CONFIG.SIM_OTHERS_DAILY_WEALTH_AVG * finalMultiplier);
    const newMedals = Math.floor(CONFIG.SIM_OTHERS_COUNT * CONFIG.SIM_OTHERS_MEDAL_INVEST_AVG * finalMultiplier);
    
    // Calculate Costs incurred by bots (entering Reservoir)
    // 1. Crafting Cost (50% to reservoir)
    const itemsCrafted = newWealth / CONFIG.WEALTH_PER_ITEM;
    const craftCost = itemsCrafted * CONFIG.CRAFT_COST;
    const reservoirFromCraft = craftCost * 0.5;

    // 2. Chest Open Cost (100% to reservoir)
    // Approx medals per chest = 10 (Avg of 5-15).
    const chestsOpened = newMedals / 10;
    const chestCost = chestsOpened * CONFIG.CHEST_OPEN_COST;
    const reservoirFromChest = chestCost;

    return {
        wealth: newWealth,
        medals: newMedals,
        reservoirInput: reservoirFromCraft + reservoirFromChest,
        multiplier: finalMultiplier,
        roi: computedRoi
    };
};

export default function App() {
  // --- State Initialization ---
  
  const [global, setGlobal] = useState<GlobalState>({
    day: 1,
    reservoirLvMON: 0,
    totalWealth: 0,
    dailyNewWealth: 0,
    medalsInPool: 0,
    totalStakedMeme: 500000, 
  });

  const [amm, setAmm] = useState<AMMState>({
    reserveMEME: CONFIG.INITIAL_AMM_MEME,
    reserveLvMON: CONFIG.INITIAL_AMM_LVMON,
    lpTokenSupply: 1000,
  });

  const [player, setPlayer] = useState<PlayerState>({
    lvMON: CONFIG.INITIAL_PLAYER_LVMON,
    meme: 0,
    medals: 0,
    wealth: 0,
    chests: 0,
    equipmentCount: 0,
    investedMedals: 0,
    stakedMeme: 0,
    unclaimedPoolReward: 0,
    unclaimedRedistribution: 0,
    unclaimedStakingReward: 0,
  });

  const [history, setHistory] = useState<DailyLog[]>([]);
  const hasInitializedDay1 = useRef(false);

  // Simulation Controls
  const [craftBatchSize, setCraftBatchSize] = useState(1);
  const [salvageBatchSize, setSalvageBatchSize] = useState(1);
  const [openChestBatchSize, setOpenChestBatchSize] = useState(1);
  const [sellMemePercent, setSellMemePercent] = useState(50);
  const [stakeAmount, setStakeAmount] = useState(0);
  
  // --- Derived Metrics ---
  const currentPrice = amm.reserveLvMON / amm.reserveMEME;

  // --- Effect: Day 1 Initialization ---
  useEffect(() => {
    if (!hasInitializedDay1.current) {
        // Day 1 has no context, neutral bots
        const bots = generateBotActivity();
        setGlobal(prev => ({
            ...prev,
            dailyNewWealth: bots.wealth,
            totalWealth: prev.totalWealth + bots.wealth,
            medalsInPool: bots.medals,
            reservoirLvMON: prev.reservoirLvMON + bots.reservoirInput,
            totalStakedMeme: prev.totalStakedMeme
        }));
        
        // Initial log
        setHistory([{
            day: 1,
            memePrice: CONFIG.INITIAL_AMM_LVMON / CONFIG.INITIAL_AMM_MEME,
            reservoirBalance: bots.reservoirInput,
            buybackAmount: 0,
            buybackRate: 0.02,
            totalWealth: bots.wealth,
            newWealth: bots.wealth,
            stakingApy: 0,
            botActivity: 1.0,
            botRoi: 1.0
        }]);

        hasInitializedDay1.current = true;
    }
  }, []);
  
  // --- Actions ---

  const craftEquipment = () => {
    const cost = CONFIG.CRAFT_COST * craftBatchSize;
    if (player.lvMON < cost) return alert("LvMON 不足！");

    const wealthGain = CONFIG.WEALTH_PER_ITEM * craftBatchSize;
    const toReservoir = cost * 0.5; 

    const instantChests = Math.floor(wealthGain / 100);

    setPlayer(prev => ({
      ...prev,
      lvMON: prev.lvMON - cost,
      wealth: prev.wealth + wealthGain,
      equipmentCount: prev.equipmentCount + craftBatchSize,
      chests: prev.chests + instantChests,
    }));

    setGlobal(prev => ({
      ...prev,
      totalWealth: prev.totalWealth + wealthGain,
      dailyNewWealth: prev.dailyNewWealth + wealthGain,
      reservoirLvMON: prev.reservoirLvMON + toReservoir,
    }));
  };

  const handleSalvage = () => {
      const count = salvageBatchSize;
      if (player.equipmentCount < count) return alert("装备数量不足");
      
      const wealthToBurn = count * CONFIG.WEALTH_PER_ITEM;
      const lvMONReturn = wealthToBurn * CONFIG.WEALTH_SALVAGE_RATE;

      setPlayer(prev => ({
          ...prev,
          equipmentCount: prev.equipmentCount - count,
          wealth: prev.wealth - wealthToBurn,
          lvMON: prev.lvMON + lvMONReturn
      }));

      setGlobal(prev => ({
          ...prev,
          totalWealth: Math.max(0, prev.totalWealth - wealthToBurn)
      }));
  };

  const openChests = () => {
    if (player.chests < openChestBatchSize) return alert("宝箱数量不足！");
    const cost = CONFIG.CHEST_OPEN_COST * openChestBatchSize;
    if (player.lvMON < cost) return alert("开启宝箱所需的 LvMON 不足！");

    let totalMedalsWon = 0;
    for (let i = 0; i < openChestBatchSize; i++) {
      totalMedalsWon += Math.floor(Math.random() * (CONFIG.MEDAL_MAX - CONFIG.MEDAL_MIN + 1)) + CONFIG.MEDAL_MIN;
    }

    setPlayer(prev => ({
      ...prev,
      chests: prev.chests - openChestBatchSize,
      lvMON: prev.lvMON - cost,
      medals: prev.medals + totalMedalsWon,
    }));

    setGlobal(prev => ({
      ...prev,
      reservoirLvMON: prev.reservoirLvMON + cost, 
    }));
  };

  const investMedals = () => {
    if (player.medals === 0) return;
    const amount = player.medals;
    
    setPlayer(prev => ({
      ...prev,
      medals: 0,
      investedMedals: prev.investedMedals + amount,
    }));

    setGlobal(prev => ({
      ...prev,
      medalsInPool: prev.medalsInPool + amount,
    }));
  };

  const sellMeme = () => {
    if (player.meme === 0) return;
    const amountIn = Math.floor(player.meme * (sellMemePercent / 100));
    if (amountIn <= 0) return;

    const amountOut = getAmountOut(amountIn, amm.reserveMEME, amm.reserveLvMON);

    setAmm(prev => ({
      ...prev,
      reserveMEME: prev.reserveMEME + amountIn,
      reserveLvMON: prev.reserveLvMON - amountOut,
    }));

    setPlayer(prev => ({
      ...prev,
      meme: prev.meme - amountIn,
      lvMON: prev.lvMON + amountOut,
    }));
  };

  const handleStakeMeme = () => {
    if (stakeAmount <= 0) return;
    if (player.meme < stakeAmount) return alert("MEME 不足");

    setPlayer(prev => ({
        ...prev,
        meme: prev.meme - stakeAmount,
        stakedMeme: prev.stakedMeme + stakeAmount
    }));

    setGlobal(prev => ({
        ...prev,
        totalStakedMeme: prev.totalStakedMeme + stakeAmount
    }));
    setStakeAmount(0);
  };

  const handleUnstakeMeme = () => {
    if (player.stakedMeme <= 0) return;
    const amount = player.stakedMeme;
    setPlayer(prev => ({
        ...prev,
        stakedMeme: 0,
        meme: prev.meme + amount
    }));
    setGlobal(prev => ({
        ...prev,
        totalStakedMeme: Math.max(0, prev.totalStakedMeme - amount)
    }));
  };

  // --- Claiming Logic ---
  const claimPoolReward = () => {
    if (player.unclaimedPoolReward <= 0) return;
    const reward = player.unclaimedPoolReward * 0.9; // 10% tax
    setPlayer(prev => ({
        ...prev,
        meme: prev.meme + reward,
        unclaimedPoolReward: 0
    }));
  };

  const claimRedistribution = () => {
    if (player.unclaimedRedistribution <= 0) return;
    setPlayer(prev => ({
        ...prev,
        meme: prev.meme + prev.unclaimedRedistribution,
        unclaimedRedistribution: 0
    }));
  };

  const claimStakingReward = () => {
    if (player.unclaimedStakingReward <= 0) return;
    setPlayer(prev => ({
        ...prev,
        meme: prev.meme + prev.unclaimedStakingReward,
        unclaimedStakingReward: 0
    }));
  };

  // --- The Core "Next Day" Logic (The Loop) ---
  const advanceDay = () => {
    // === 1. SETTLEMENT OF CURRENT DAY ===
    
    // A. Calculate Rewards (Medal Pool)
    let playerPendingReward = 0;
    let othersPendingReward = 0;
    if (global.medalsInPool > 0) {
        const playerShare = player.investedMedals / global.medalsInPool;
        playerPendingReward = CONFIG.DAILY_MEME_REWARD * playerShare;
        othersPendingReward = CONFIG.DAILY_MEME_REWARD * (1 - playerShare);
    }

    // B. Smart Bot Logic: Tax, Stake, Sell
    const taxRate = 0.1;
    const botTax = othersPendingReward * taxRate; 
    const botNetReward = othersPendingReward - botTax;

    // --- Dynamic Staking & Selling Strategy ---
    const lastLog = history[history.length - 1];
    const lastApy = lastLog?.stakingApy || 0;
    const lastPrice = lastLog?.memePrice || currentPrice;
    
    // Base Ratio
    let botStakeRatio = 0.3; 
    
    // APY Feedback Loop (Greed for Yield)
    if (lastApy > 2.0) botStakeRatio = 0.8; // APY > 200%, Stake heavy
    else if (lastApy > 0.5) botStakeRatio = 0.5; // APY > 50%, Stake more
    else if (lastApy < 0.05) botStakeRatio = 0.1; // APY < 5%, Unstake/Low stake

    // Trend Feedback Loop (Fear/Greed for Selling)
    let botSellRatio = 1 - botStakeRatio;
    const priceTrend = currentPrice > lastPrice ? 'up' : (currentPrice < lastPrice ? 'down' : 'flat');
    
    if (priceTrend === 'down') {
        // Panic: Sell everything liquid
        // (No change to ratio needed if ratio defines liquid portion, but logic conceptually matches)
    } else if (priceTrend === 'up') {
        // HODL: Reduce selling pressure, hold some liquid?
        // For simplicity, we assume bots either Stake or Sell. 
        // We could add a "Hold Liquid" state, but to keep liquidity flowing, we'll keep Stake/Sell binary for now.
    }

    const botStakedAmount = botNetReward * botStakeRatio;
    const botSellAmount = botNetReward - botStakedAmount;

    // C. Execute Bot Sell on AMM (Before buyback)
    let tempReserveMEME = amm.reserveMEME;
    let tempReserveLvMON = amm.reserveLvMON;
    
    if (botSellAmount > 0) {
        const lvMONOut = getAmountOut(botSellAmount, tempReserveMEME, tempReserveLvMON);
        tempReserveMEME += botSellAmount;
        tempReserveLvMON -= lvMONOut;
    }

    // D. Buyback Calculation
    const currentBuybackRate = calculateBuybackRate(global.dailyNewWealth);
    const buybackBudget = global.reservoirLvMON * currentBuybackRate;
    
    let actualBuybackAmount = 0;
    let stakingDividend = 0;

    if (buybackBudget > 0) {
        const memeBought = getAmountOut(buybackBudget, tempReserveLvMON, tempReserveMEME);
        tempReserveLvMON += buybackBudget;
        tempReserveMEME -= memeBought;
        
        actualBuybackAmount = buybackBudget;
        stakingDividend = memeBought * 0.1; // 10% to stakers
    }

    // E. Distribute Staking Rewards
    let playerStakingShare = 0;
    if (global.totalStakedMeme > 0) {
        playerStakingShare = stakingDividend * (player.stakedMeme / global.totalStakedMeme);
    }
    
    const newTotalStakedMeme = global.totalStakedMeme + botStakedAmount;

    // F. Redistribution
    const playerRedistributionShare = botTax / (CONFIG.SIM_OTHERS_COUNT + 1);
    const newChests = Math.floor(player.wealth / 100);

    // === 2. SIMULATE NEXT DAY ACTIVITY (Start of Day) ===
    // Use current stats to determine next day's production
    const botContext: BotDecisionContext = {
        currentPrice: tempReserveLvMON / tempReserveMEME,
        lastPrice: currentPrice, // Price before today's settlement
        lastApy: stakingDividend * 365 / Math.max(1, global.totalStakedMeme) // Current implied APY
    };

    const nextDayBots = generateBotActivity(botContext);

    // H. Log History
    const log: DailyLog = {
        day: global.day,
        memePrice: tempReserveLvMON / tempReserveMEME,
        reservoirBalance: global.reservoirLvMON - actualBuybackAmount,
        buybackAmount: actualBuybackAmount,
        buybackRate: currentBuybackRate,
        totalWealth: global.totalWealth,
        newWealth: global.dailyNewWealth,
        stakingApy: global.totalStakedMeme > 0 ? (stakingDividend * 365 / global.totalStakedMeme) : 0,
        botActivity: nextDayBots.multiplier,
        botRoi: nextDayBots.roi
    };
    setHistory(prev => [...prev, log]);

    // === 3. UPDATE STATES ===
    
    setAmm({
        ...amm,
        reserveMEME: tempReserveMEME,
        reserveLvMON: tempReserveLvMON
    });

    setPlayer(prev => ({
        ...prev,
        chests: prev.chests + newChests,
        investedMedals: 0, 
        unclaimedPoolReward: prev.unclaimedPoolReward + playerPendingReward,
        unclaimedRedistribution: prev.unclaimedRedistribution + playerRedistributionShare,
        unclaimedStakingReward: prev.unclaimedStakingReward + playerStakingShare
    }));

    setGlobal(prev => ({
        ...prev,
        day: prev.day + 1,
        reservoirLvMON: (prev.reservoirLvMON - actualBuybackAmount) + nextDayBots.reservoirInput,
        dailyNewWealth: nextDayBots.wealth, 
        medalsInPool: nextDayBots.medals, 
        totalWealth: prev.totalWealth + nextDayBots.wealth,
        totalStakedMeme: newTotalStakedMeme 
    }));
  };

  // --- Auto-Simulation Helper ---
  const [isAuto, setIsAuto] = useState(false);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isAuto) {
      interval = setInterval(() => {
         advanceDay();
      }, 1000); // Speed up slightly
    }
    return () => clearInterval(interval);
  }, [isAuto, global, amm, player]); 

  const lastLog = history[history.length - 1];
  const botSentiment = !lastLog ? "Neutral" : (lastLog.botRoi || 0) > 1.2 ? "FOMO (Greed)" : (lastLog.botRoi || 0) < 0.8 ? "Fear (Freeze)" : "Stable";

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      
      {/* Header */}
      <header className="mb-8 flex justify-between items-center border-b border-slate-700 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
            MMORPG 经济系统控制台
          </h1>
          <p className="text-slate-400 mt-1 flex items-center gap-2">
            <Users size={16} /> 模拟器：1 名真实玩家 + {CONFIG.SIM_OTHERS_COUNT} 名智能机器人
          </p>
        </div>
        <div className="flex items-center gap-4">
             <div className="text-right">
                <div className="text-xs text-slate-500 uppercase">当前天数</div>
                <div className="text-2xl font-mono font-bold text-white">Day {global.day}</div>
             </div>
             <button 
                onClick={() => setIsAuto(!isAuto)}
                className={`px-4 py-2 rounded font-bold transition-colors ${isAuto ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}
             >
                {isAuto ? '停止模拟' : '自动运行'}
             </button>
             <button 
                onClick={advanceDay}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold shadow-lg flex items-center gap-2"
             >
                <RefreshCw size={18} /> 结算进入下一天
             </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Player Actions */}
        <div className="lg:col-span-4 space-y-6">
            
            {/* Player Resources */}
            <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-lg">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
                    <Activity size={20} className="text-blue-400" /> 我的资产
                </h2>
                
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-slate-900 p-3 rounded border border-slate-700">
                        <div className="text-xs text-slate-400">LvMON 余额</div>
                        <div className="text-lg font-mono text-yellow-400">{formatNumber(player.lvMON)}</div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded border border-slate-700">
                        <div className="text-xs text-slate-400">绑定财富值</div>
                        <div className="text-lg font-mono text-green-400">{formatNumber(player.wealth)}</div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded border border-slate-700">
                        <div className="text-xs text-slate-400">持有 MEME</div>
                        <div className="text-lg font-mono text-purple-400">{formatNumber(player.meme)}</div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded border border-slate-700">
                        <div className="text-xs text-slate-400">质押中 MEME</div>
                        <div className="text-lg font-mono text-pink-400">{formatNumber(player.stakedMeme)}</div>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Action: Craft */}
                    <div className="bg-slate-700/30 p-3 rounded">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium flex items-center gap-2">
                                <Hammer size={16} className="text-slate-400"/> 制作装备
                            </span>
                            <span className="text-xs text-slate-400">消耗：{CONFIG.CRAFT_COST * craftBatchSize} LvMON</span>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="number" 
                                min="1" 
                                value={craftBatchSize} 
                                onChange={(e) => setCraftBatchSize(parseInt(e.target.value) || 1)}
                                className="w-16 bg-slate-900 border border-slate-600 rounded px-2 text-sm"
                            />
                            <button onClick={craftEquipment} className="flex-1 bg-blue-600 hover:bg-blue-500 text-xs py-1.5 rounded font-bold">
                                制作 (增加财富)
                            </button>
                        </div>
                    </div>
                    
                    {/* Action: Salvage (New) */}
                    <div className="bg-red-900/20 border border-red-900/50 p-3 rounded">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium flex items-center gap-2 text-red-300">
                                <Flame size={16}/> 销毁装备 ({player.equipmentCount})
                            </span>
                            <span className="text-xs text-slate-400">返还 50% 价值 LvMON</span>
                        </div>
                        <div className="flex gap-2">
                             <input 
                                type="number" 
                                min="1" 
                                value={salvageBatchSize} 
                                onChange={(e) => setSalvageBatchSize(parseInt(e.target.value) || 1)}
                                className="w-16 bg-slate-900 border border-slate-600 rounded px-2 text-sm"
                            />
                            <button onClick={handleSalvage} className="flex-1 bg-red-800 hover:bg-red-700 text-xs py-1.5 rounded font-bold text-red-100">
                                销毁 (回收资金)
                            </button>
                        </div>
                    </div>

                    {/* Action: Open Chests */}
                    <div className="bg-slate-700/30 p-3 rounded">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium flex items-center gap-2">
                                <Box size={16} className="text-slate-400"/> 开启宝箱 ({player.chests})
                            </span>
                            <span className="text-xs text-slate-400">消耗：{CONFIG.CHEST_OPEN_COST * openChestBatchSize} LvMON</span>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="number" 
                                min="1" 
                                value={openChestBatchSize} 
                                onChange={(e) => setOpenChestBatchSize(parseInt(e.target.value) || 1)}
                                className="w-16 bg-slate-900 border border-slate-600 rounded px-2 text-sm"
                            />
                            <button onClick={openChests} className="flex-1 bg-orange-600 hover:bg-orange-500 text-xs py-1.5 rounded font-bold">
                                开启 (获得勋章)
                            </button>
                        </div>
                    </div>

                    {/* Action: Invest Medals */}
                    <div className="bg-slate-700/30 p-3 rounded">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium flex items-center gap-2">
                                <Archive size={16} className="text-slate-400"/> 投入勋章 ({player.medals})
                            </span>
                            <span className="text-xs text-slate-400">全服今日：{formatNumber(global.medalsInPool)}</span>
                        </div>
                        <button onClick={investMedals} className="w-full bg-indigo-600 hover:bg-indigo-500 text-xs py-1.5 rounded font-bold">
                            全部投入奖池
                        </button>
                    </div>

                </div>
            </div>

            {/* Claims Section (New) */}
            <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-lg">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
                    <Gift size={20} className="text-yellow-400" /> 收益领取
                </h2>
                
                {/* 1. Pool Reward */}
                <div className="flex justify-between items-center mb-3 p-3 bg-slate-900 rounded border border-slate-700">
                    <div>
                        <div className="text-xs text-slate-400">奖池分红 (90%)</div>
                        <div className="font-mono text-purple-400">{formatNumber(player.unclaimedPoolReward)}</div>
                    </div>
                    <button 
                        onClick={claimPoolReward}
                        disabled={player.unclaimedPoolReward <= 0}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded font-bold"
                    >
                        领取
                    </button>
                </div>

                {/* 2. Redistribution Reward */}
                <div className="flex justify-between items-center mb-3 p-3 bg-slate-900 rounded border border-slate-700">
                    <div>
                        <div className="text-xs text-slate-400">他人纳税分红</div>
                        <div className="font-mono text-green-400">{formatNumber(player.unclaimedRedistribution)}</div>
                    </div>
                    <button 
                        onClick={claimRedistribution}
                        disabled={player.unclaimedRedistribution <= 0}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded font-bold"
                    >
                        领取分红
                    </button>
                </div>

                {/* 3. Staking Reward */}
                <div className="flex justify-between items-center p-3 bg-slate-900 rounded border border-slate-700">
                    <div>
                        <div className="text-xs text-slate-400">质押收益 (回购)</div>
                        <div className="font-mono text-pink-400">{formatNumber(player.unclaimedStakingReward)}</div>
                    </div>
                    <button 
                        onClick={claimStakingReward}
                        disabled={player.unclaimedStakingReward <= 0}
                        className="px-3 py-1 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded font-bold"
                    >
                        提取收益
                    </button>
                </div>

            </div>

             {/* Action: Staking */}
             <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-lg">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                        <Lock size={20} className="text-pink-400"/> MEME 质押
                    </h2>
                    <span className="text-xs text-slate-400">全服质押：{formatNumber(global.totalStakedMeme)}</span>
                </div>
                
                <div className="flex gap-2 mb-2">
                    <input 
                        type="number" 
                        placeholder="数量"
                        value={stakeAmount || ''}
                        onChange={(e) => setStakeAmount(parseFloat(e.target.value))}
                        className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 text-sm"
                    />
                    <button onClick={handleStakeMeme} className="px-4 bg-pink-600 hover:bg-pink-500 text-xs py-1.5 rounded font-bold">
                        质押
                    </button>
                </div>
                <button onClick={handleUnstakeMeme} className="w-full bg-slate-700 hover:bg-slate-600 text-xs py-1.5 rounded font-bold flex justify-center items-center gap-1">
                    <Unlock size={12}/> 全部赎回 ({formatNumber(player.stakedMeme)})
                </button>
            </div>

            {/* Action: Sell MEME */}
            <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-lg">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                        <TrendingUp size={16} className="text-slate-400"/> 卖出 MEME
                    </span>
                    <span className="text-xs text-slate-400">1 MEME = {formatNumber(currentPrice)} LvMON</span>
                </div>
                <div className="flex gap-2 items-center">
                    <span className="text-xs">比例：</span>
                        <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={sellMemePercent} 
                        onChange={(e) => setSellMemePercent(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs w-8 text-right">{sellMemePercent}%</span>
                </div>
                <button onClick={sellMeme} className="w-full mt-2 bg-purple-600 hover:bg-purple-500 text-xs py-1.5 rounded font-bold">
                    卖入交易池
                </button>
            </div>

        </div>

        {/* Right Column: Visualization */}
        <div className="lg:col-span-8 space-y-6">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InfoCard 
                    title="MEME 价格" 
                    value={currentPrice.toFixed(4)} 
                    subValue="LvMON" 
                    color="purple" 
                    icon={<DollarSign size={24}/>}
                />
                <InfoCard 
                    title="全服总财富" 
                    value={formatNumber(global.totalWealth)} 
                    subValue={`+${formatNumber(global.dailyNewWealth)} 今日`} 
                    color="green" 
                    icon={<Coins size={24}/>}
                />
                <InfoCard 
                    title="蓄水池存量" 
                    value={formatNumber(global.reservoirLvMON)}
                    subValue="用于自动回购"
                    color="blue"
                    icon={<RefreshCw size={24}/>}
                />
            </div>
            
            {/* Sentiment Dashboard */}
             <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 shadow-lg">
                <h3 className="text-md font-bold text-white mb-4 flex items-center gap-2">
                    <Zap size={20} className="text-yellow-400" /> 市场情绪监控
                </h3>
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-900 p-3 rounded">
                        <div className="text-xs text-slate-400">机器人情绪</div>
                        <div className={`text-lg font-bold ${botSentiment.includes("FOMO") ? "text-green-400" : botSentiment.includes("Fear") ? "text-red-400" : "text-blue-400"}`}>
                            {botSentiment}
                        </div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded">
                        <div className="text-xs text-slate-400">搬砖 ROI (含回收)</div>
                        <div className="text-lg font-mono text-white">{(lastLog?.botRoi || 0).toFixed(2)}x</div>
                    </div>
                     <div className="bg-slate-900 p-3 rounded">
                        <div className="text-xs text-slate-400">活跃度倍率</div>
                        <div className="text-lg font-mono text-white">{(lastLog?.botActivity || 0).toFixed(2)}x</div>
                    </div>
                </div>
            </div>

            {/* Chart 1: Price & Reservoir */}
            <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 shadow-lg">
                <h3 className="text-md font-bold text-white mb-4">市场走势：价格 & 蓄水池</h3>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={history}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="day" stroke="#94a3b8" />
                            <YAxis yAxisId="left" stroke="#a78bfa" label={{ value: '价格 (LvMON)', angle: -90, position: 'insideLeft', fill: '#a78bfa' }} />
                            <YAxis yAxisId="right" stroke="#60a5fa" orientation="right" label={{ value: '蓄水池', angle: 90, position: 'insideRight', fill: '#60a5fa' }} />
                            <ReTooltip 
                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                                itemStyle={{ color: '#f1f5f9' }}
                            />
                            <Legend />
                            <Line yAxisId="left" type="monotone" dataKey="memePrice" stroke="#a78bfa" strokeWidth={2} name="MEME 价格" dot={false} />
                            <Area yAxisId="right" type="monotone" dataKey="reservoirBalance" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.2} name="蓄水池 (LvMON)" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Chart 2: Buyback & Activity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 shadow-lg">
                    <h3 className="text-md font-bold text-white mb-4">回购分配 (90%销毁 / 10%质押)</h3>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={history}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="day" stroke="#94a3b8" />
                                <YAxis stroke="#94a3b8" />
                                <ReTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                <Bar dataKey="buybackAmount" fill="#ef4444" name="回购 LvMON 总量" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 shadow-lg">
                    <h3 className="text-md font-bold text-white mb-4">机器人活跃度 (基于ROI)</h3>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={history}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="day" stroke="#94a3b8" />
                                <YAxis domain={[0, 4]} stroke="#94a3b8" />
                                <ReTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                <Line type="monotone" dataKey="botActivity" stroke="#34d399" strokeWidth={2} name="活跃倍率" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            
            {/* Explanation Section */}
            <div className="bg-slate-800/50 p-4 rounded text-sm text-slate-400 border border-slate-700">
                <h4 className="font-bold text-white mb-2 flex items-center gap-2"><Database size={14}/> 系统机制更新</h4>
                <ul className="list-disc list-inside space-y-1">
                    <li><strong className="text-blue-400">Sigmoid 修正：</strong> 回购中点已调整至 50万财富值，现在回购率会动态变化，不再锁死 8%。</li>
                    <li><strong className="text-purple-400">智能机器人：</strong> 引入了 ROI 计算。如果做装备亏本，机器人会大幅减少产量（活跃度下降）；如果暴利，会开启 FOMO 模式。</li>
                    <li><strong className="text-pink-400">追涨杀跌：</strong> 机器人会根据 APY 动态调整质押比例。APY 高时锁仓，MEME 价格下跌时恐慌抛售。</li>
                    <li><strong className="text-red-400">资产回收：</strong> 新增“销毁装备”功能。玩家和机器人可以将装备销毁，获得其财富值 50% 的 LvMON 返还。这降低了机器人的预期成本，从而提高了活跃意愿。</li>
                </ul>
            </div>

        </div>
      </div>
    </div>
  );
}