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
    totalWealth: number;
}

// Helper to simulate bot activity for a day with "Smart" logic
const generateBotActivity = (context?: BotDecisionContext) => {
    let activityMultiplier = 1.0; // Controls Crafting (New Wealth)
    let chestOpenRate = 1.0; // Controls Medal Generation (Stock Wealth)
    let computedRoi = 0; // Daily Yield %
    
    // Smart Logic: Only apply if context is provided (after Day 1)
    if (context) {
        // --- 1. Dilution & Revenue Estimation ---
        // Total Medals comes from Total Wealth.
        // Formula: TotalWealth / 100 (Chests) * 10 (Medals/Chest) = TotalWealth / 10
        // We use the CURRENT TotalWealth to estimate the pool size for the NEXT day.
        const estimatedTotalMedals = Math.max(100, context.totalWealth / 10);
        
        // Reward per Medal = DailyPool / TotalMedals
        const rewardPerMedal = CONFIG.DAILY_MEME_REWARD / estimatedTotalMedals;
        
        // Revenue per Unit of Wealth (286 Wealth -> 0.1 Medal daily)
        // 1 Wealth unit produces ~0.1 medals per day.
        // Daily Revenue = 0.1 * RewardPerMedal * Price
        const medalsPerWealth = 0.1;
        const dailyRevenuePerWealth = medalsPerWealth * rewardPerMedal * context.currentPrice;

        // --- 2. Cost Estimation ---
        // Operational Cost: Opening the chest
        // 1 Wealth -> 0.01 Chest -> 0.1 LvMON cost
        const dailyOpCostPerWealth = 0.1;

        // Net Daily Yield (Revenue - OpCost)
        const netDailyYield = dailyRevenuePerWealth - dailyOpCostPerWealth;

        // Capital Cost (Crafting)
        // Cost to acquire 1 Wealth = (CraftCost - Salvage) / WealthPerItem
        // (300 - 150) / 286 = 0.524 LvMON
        const capitalCostPerWealth = (CONFIG.CRAFT_COST * (1 - CONFIG.WEALTH_SALVAGE_RATE)) / CONFIG.WEALTH_PER_ITEM;

        // --- 3. ROI Calculation (Daily Return %) ---
        // How much % of my invested capital do I get back PER DAY?
        computedRoi = netDailyYield / capitalCostPerWealth;

        // --- 4. Decision Making ---
        
        // A. Chest Opening Decision (Operational)
        // If Daily Yield is negative (Revenue < OpCost), normally rational actors stop.
        // However, we ensure "Bottom Fishing" or "Speculation" continues.
        if (netDailyYield < 0) {
            chestOpenRate = 0.2; // Keep 20% opening rate for speculation (farming medals for staking)
        } else if (netDailyYield < 0.001) {
            // Very slim margins, maybe open some
            chestOpenRate = 0.6;
        } else {
            chestOpenRate = 1.0;
        }

        // B. Crafting Decision (Capital Investment)
        // Base decision on Daily Return %
        // 1% daily = 365% APY (Excellent)
        // 0.1% daily = 36.5% APY (Good)
        // < 0% = Speculative holding
        
        if (computedRoi < 0) activityMultiplier = 0.05; // 5% Bottom fishing activity (prevent dead halt)
        else if (computedRoi < 0.005) activityMultiplier = 0.2; // 20% Slow accumulation
        else if (computedRoi > 0.05) activityMultiplier = 3.0; // > 5% Daily (FOMO)
        else if (computedRoi > 0.02) activityMultiplier = 2.0; // > 2% Daily (High)
        else activityMultiplier = 1.0; // Standard
    }

    // Random fluctuation
    const volatility = () => (0.9 + Math.random() * 0.2);
    const finalMultiplier = activityMultiplier * volatility();

    // Calculate New Wealth Creation (Flow)
    const baseNewWealth = CONFIG.SIM_OTHERS_COUNT * CONFIG.SIM_OTHERS_DAILY_WEALTH_AVG;
    const newWealth = Math.floor(baseNewWealth * finalMultiplier);
    
    // Reservoir Input from Crafting (50% of Craft Cost)
    const itemsCrafted = newWealth / CONFIG.WEALTH_PER_ITEM;
    const craftCost = itemsCrafted * CONFIG.CRAFT_COST;
    const reservoirFromCraft = craftCost * 0.5;

    return {
        newWealth,
        reservoirFromCraft,
        chestOpenRate,
        multiplier: finalMultiplier,
        roi: computedRoi
    };
};

export default function App() {
  // --- State Initialization ---
  
  const [global, setGlobal] = useState<GlobalState>({
    day: 1,
    reservoirLvMON: 0,
    totalWealth: 500000, // Initial wealth for 100 bots * 5000
    dailyNewWealth: 0,
    medalsInPool: 50000, // Initial medals ~ TotalWealth / 10
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

  // UI State for Tabs
  const [activeTab, setActiveTab] = useState<'ops' | 'defi' | 'rewards'>('ops');
  
  // --- Derived Metrics ---
  const currentPrice = amm.reserveLvMON / amm.reserveMEME;

  // --- Effect: Day 1 Initialization ---
  useEffect(() => {
    if (!hasInitializedDay1.current) {
        // Initial setup for history
        setHistory([{
            day: 1,
            memePrice: CONFIG.INITIAL_AMM_LVMON / CONFIG.INITIAL_AMM_MEME,
            reservoirBalance: 0,
            buybackAmount: 0,
            buybackMemeAmount: 0,
            buybackRate: 0.02,
            totalWealth: 500000,
            newWealth: 0,
            stakingApy: 0,
            botActivity: 1.0,
            botRoi: 0.01, // dummy
            medalsInPool: 50000 // Initial medals
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
    let botStakeRatio = 0.1; 
    
    // APY Feedback Loop (Greed for Yield)
    if (lastApy > 2.0) botStakeRatio = 0.2; // APY > 200%, Stake heavy
    else if (lastApy > 0.5) botStakeRatio = 0.15; // APY > 50%, Stake more
    else if (lastApy < 0.05) botStakeRatio = 0.05; // APY < 5%, Unstake/Low stake

    // Trend Feedback Loop (Fear/Greed for Selling)
    let botSellRatio = 1 - botStakeRatio;
    const priceTrend = currentPrice > lastPrice ? 'up' : (currentPrice < lastPrice ? 'down' : 'flat');
    
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
    let actualMemeBought = 0;
    let stakingDividend = 0;

    if (buybackBudget > 0) {
        const memeBought = getAmountOut(buybackBudget, tempReserveLvMON, tempReserveMEME);
        tempReserveLvMON += buybackBudget;
        tempReserveMEME -= memeBought;
        
        actualBuybackAmount = buybackBudget;
        actualMemeBought = memeBought;
        stakingDividend = memeBought * 0.1; // 10% to stakers
    }

    // E. Distribute Staking Rewards
    let playerStakingShare = 0;
    if (global.totalStakedMeme > 0) {
        playerStakingShare = stakingDividend * (player.stakedMeme / global.totalStakedMeme);
    }
    
    const newTotalStakedMeme = global.totalStakedMeme + botStakedAmount;

    // F. Redistribution
    const playerTotalUnclaimed = player.unclaimedPoolReward + playerPendingReward;
    const botsTotalUnclaimed = othersPendingReward; // Bots process daily, so their "unclaimed" is just the current daily amount
    const totalUnclaimedPool = playerTotalUnclaimed + botsTotalUnclaimed;

    let playerRedistributionShare = 0;
    if (totalUnclaimedPool > 0) {
        // Distribute total collected tax (botTax) proportional to unclaimed reward holdings
        playerRedistributionShare = botTax * (playerTotalUnclaimed / totalUnclaimedPool);
    }

    const newChests = Math.floor(player.wealth / 100);

    // === 2. SIMULATE NEXT DAY ACTIVITY (Start of Day) ===
    
    // A. Calculate Bot Medals from Accumulation (Stock)
    const botTotalWealth = Math.max(0, global.totalWealth - player.wealth);
    const botChestsAvailable = Math.floor(botTotalWealth / 100);

    // B. Bot Activity Decision (Flow + Stock Usage)
    const botContext: BotDecisionContext = {
        currentPrice: tempReserveLvMON / tempReserveMEME,
        lastPrice: currentPrice,
        lastApy: stakingDividend * 365 / Math.max(1, global.totalStakedMeme),
        totalWealth: global.totalWealth // Passing Total Wealth for Dilution Calc
    };

    const nextDayBots = generateBotActivity(botContext);

    // C. Execute Bot Chest Opening (Stock Cost)
    const botChestsOpened = Math.floor(botChestsAvailable * nextDayBots.chestOpenRate);
    const botMedals = botChestsOpened * 10; // Approx 10 medals per chest
    const botChestCost = botChestsOpened * CONFIG.CHEST_OPEN_COST;

    // D. Log History
    const log: DailyLog = {
        day: global.day,
        memePrice: tempReserveLvMON / tempReserveMEME,
        reservoirBalance: global.reservoirLvMON - actualBuybackAmount,
        buybackAmount: actualBuybackAmount,
        buybackMemeAmount: actualMemeBought,
        buybackRate: currentBuybackRate,
        totalWealth: global.totalWealth,
        newWealth: global.dailyNewWealth,
        stakingApy: global.totalStakedMeme > 0 ? (stakingDividend * 365 / global.totalStakedMeme) : 0,
        botActivity: nextDayBots.multiplier,
        botRoi: nextDayBots.roi,
        medalsInPool: global.medalsInPool // Record the pool size that was just settled
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
        investedMedals: 0, // Reset player investment for next day
        unclaimedPoolReward: prev.unclaimedPoolReward + playerPendingReward,
        unclaimedRedistribution: prev.unclaimedRedistribution + playerRedistributionShare,
        unclaimedStakingReward: prev.unclaimedStakingReward + playerStakingShare
    }));

    setGlobal(prev => ({
        ...prev,
        day: prev.day + 1,
        // Reservoir Logic: Old - Buyback + BotCraftCost + BotChestCost
        reservoirLvMON: (prev.reservoirLvMON - actualBuybackAmount) + nextDayBots.reservoirFromCraft + botChestCost,
        dailyNewWealth: nextDayBots.newWealth, 
        // Medals in Pool = Player's Manual Investment (Next Day) + Bots' Automatic Investment (Next Day)
        // Since we are AT the start of Day X+1, the player hasn't invested yet.
        // We set the BASE pool to Bot Medals. Player adds to this via 'investMedals'.
        medalsInPool: botMedals, 
        totalWealth: prev.totalWealth + nextDayBots.newWealth,
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
  const botSentiment = !lastLog ? "Neutral" : (lastLog.botRoi || 0) > 0.05 ? "FOMO (Greed)" : (lastLog.botRoi || 0) < 0 ? "Fear (Freeze)" : "Stable";
  // Calculate Production Cost = Medals / Reward (which is 1M)
  // If there is no history (day 1), use initial 50k / 1M = 0.05
  const productionCost = lastLog && lastLog.medalsInPool ? lastLog.medalsInPool / CONFIG.DAILY_MEME_REWARD : 0.05;

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
        <div className="lg:col-span-4 flex flex-col gap-4">
            
            {/* 1. Global Assets (Fixed Top) */}
            <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-lg shrink-0">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
                    <Activity size={20} className="text-blue-400" /> 我的资产
                </h2>
                <div className="grid grid-cols-2 gap-3">
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
            </div>

            {/* 2. Tab Navigation */}
            <div className="grid grid-cols-3 gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
                <button 
                    onClick={() => setActiveTab('ops')} 
                    className={`flex items-center justify-center gap-2 py-2 rounded text-sm font-bold transition-colors ${
                        activeTab === 'ops' ? 'bg-blue-900/50 text-blue-400 ring-1 ring-blue-500/50' : 'text-slate-400 hover:bg-slate-700/50'
                    }`}
                >
                    <Hammer size={16} /> 生产运营
                </button>
                <button 
                    onClick={() => setActiveTab('defi')} 
                    className={`flex items-center justify-center gap-2 py-2 rounded text-sm font-bold transition-colors ${
                        activeTab === 'defi' ? 'bg-purple-900/50 text-purple-400 ring-1 ring-purple-500/50' : 'text-slate-400 hover:bg-slate-700/50'
                    }`}
                >
                    <TrendingUp size={16} /> 金融交易
                </button>
                <button 
                    onClick={() => setActiveTab('rewards')} 
                    className={`flex items-center justify-center gap-2 py-2 rounded text-sm font-bold transition-colors ${
                        activeTab === 'rewards' ? 'bg-yellow-900/50 text-yellow-400 ring-1 ring-yellow-500/50' : 'text-slate-400 hover:bg-slate-700/50'
                    }`}
                >
                    <Gift size={16} /> 收益领取
                </button>
            </div>

            {/* 3. Tab Content Area */}
            <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-lg min-h-[420px]">
                
                {/* Tab: Operations */}
                {activeTab === 'ops' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
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

                         {/* Action: Salvage */}
                        <div className="bg-red-900/20 border border-red-900/50 p-3 rounded">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium flex items-center gap-2 text-red-300">
                                    <Flame size={16}/> 销毁装备 ({player.equipmentCount})
                                </span>
                                <span className="text-xs text-slate-400">返还 50% 价值</span>
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
                )}

                {/* Tab: DeFi */}
                {activeTab === 'defi' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                         {/* Action: Staking */}
                        <div className="bg-slate-700/30 p-3 rounded">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-sm font-bold flex items-center gap-2 text-white">
                                    <Lock size={16} className="text-pink-400"/> MEME 质押
                                </h2>
                                <span className="text-xs text-slate-400">全服：{formatNumber(global.totalStakedMeme)}</span>
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
                        <div className="bg-slate-700/30 p-3 rounded">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium flex items-center gap-2">
                                    <TrendingUp size={16} className="text-slate-400"/> 卖出 MEME
                                </span>
                                <span className="text-xs text-slate-400">当前价格: {formatNumber(currentPrice)}</span>
                            </div>
                            
                            {/* New Liquidity Info */}
                            <div className="bg-slate-900 p-2 rounded text-xs text-slate-400 mb-2 flex justify-between border border-slate-600">
                                <span>池内 MEME: <span className="text-purple-400 font-mono">{formatNumber(amm.reserveMEME)}</span></span>
                                <span>池内 LvMON: <span className="text-yellow-400 font-mono">{formatNumber(amm.reserveLvMON)}</span></span>
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
                )}

                {/* Tab: Rewards */}
                {activeTab === 'rewards' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* 1. Pool Reward */}
                        <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded border border-slate-600/50">
                            <div>
                                <div className="text-xs text-slate-400">奖池分红 (90%)</div>
                                <div className="font-mono text-purple-400 text-lg">{formatNumber(player.unclaimedPoolReward)}</div>
                            </div>
                            <button 
                                onClick={claimPoolReward}
                                disabled={player.unclaimedPoolReward <= 0}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded font-bold"
                            >
                                领取
                            </button>
                        </div>

                        {/* 2. Redistribution Reward */}
                        <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded border border-slate-600/50">
                            <div>
                                <div className="text-xs text-slate-400">他人纳税分红</div>
                                <div className="font-mono text-green-400 text-lg">{formatNumber(player.unclaimedRedistribution)}</div>
                            </div>
                            <button 
                                onClick={claimRedistribution}
                                disabled={player.unclaimedRedistribution <= 0}
                                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded font-bold"
                            >
                                领取
                            </button>
                        </div>

                        {/* 3. Staking Reward */}
                        <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded border border-slate-600/50">
                            <div>
                                <div className="text-xs text-slate-400">质押收益 (回购)</div>
                                <div className="font-mono text-pink-400 text-lg">{formatNumber(player.unclaimedStakingReward)}</div>
                            </div>
                            <button 
                                onClick={claimStakingReward}
                                disabled={player.unclaimedStakingReward <= 0}
                                className="px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded font-bold"
                            >
                                领取
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>

        {/* Right Column: Visualization */}
        <div className="lg:col-span-8 space-y-6">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InfoCard 
                    title="MEME 价格" 
                    value={currentPrice.toFixed(4)} 
                    subValue={`LvMON (生产成本: ${productionCost.toFixed(4)})`} 
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
                        <div className="text-xs text-slate-400">日收益率 (Yield%)</div>
                        <div className="text-lg font-mono text-white">{(lastLog?.botRoi * 100 || 0).toFixed(2)}%</div>
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
                 {/* Buyback Chart - Updated to ComposedChart */}
                 <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 shadow-lg">
                    <h3 className="text-md font-bold text-white mb-4">回购分配 (消耗 LvMON vs 回购 MEME)</h3>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={history}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="day" stroke="#94a3b8" />
                                <YAxis yAxisId="left" stroke="#ef4444" label={{ value: '消耗 LvMON', angle: -90, position: 'insideLeft', fill: '#ef4444' }} />
                                <YAxis yAxisId="right" orientation="right" stroke="#d8b4fe" label={{ value: '回购 MEME', angle: 90, position: 'insideRight', fill: '#d8b4fe' }} />
                                <ReTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                <Legend />
                                <Bar yAxisId="left" dataKey="buybackAmount" fill="#ef4444" name="消耗 LvMON" />
                                <Line yAxisId="right" type="monotone" dataKey="buybackMemeAmount" stroke="#d8b4fe" strokeWidth={2} name="回购 MEME" dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                 {/* Activity Chart - Updated with Dual Axis */}
                <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 shadow-lg">
                    <h3 className="text-md font-bold text-white mb-4">机器人活跃度 & 回购比例</h3>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={history}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="day" stroke="#94a3b8" />
                                <YAxis yAxisId="left" domain={[0, 4]} stroke="#34d399" label={{ value: '活跃度', angle: -90, position: 'insideLeft', fill: '#34d399' }} />
                                <YAxis yAxisId="right" orientation="right" domain={[0, 0.1]} tickFormatter={(v) => `${(v*100).toFixed(1)}%`} stroke="#60a5fa" label={{ value: '回购率', angle: 90, position: 'insideRight', fill: '#60a5fa' }}/>
                                <ReTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                <Legend />
                                <Line yAxisId="left" type="monotone" dataKey="botActivity" stroke="#34d399" strokeWidth={2} name="活跃倍率" dot={false} />
                                <Line yAxisId="right" type="monotone" dataKey="buybackRate" stroke="#60a5fa" strokeWidth={2} name="回购比例(Sigmoid)" dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            
            {/* Explanation Section */}
            <div className="bg-slate-800/50 p-4 rounded text-sm text-slate-400 border border-slate-700">
                <h4 className="font-bold text-white mb-2 flex items-center gap-2"><Database size={14}/> 系统机制更新</h4>
                <ul className="list-disc list-inside space-y-1">
                    <li><strong className="text-blue-400">通胀与稀释模型：</strong> AI 现在的决策更加智能。它会考虑随着全服总财富的增加（宝箱/勋章总产出增加），单枚勋章的分红会不断被稀释。</li>
                    <li><strong className="text-purple-400">存量产出逻辑：</strong> 修正了模型，现在全服每日产出的勋章总量约等于总财富值的 1/10。机器人会基于自己累积的总财富（Stock）来开启宝箱，而不仅仅是基于当日新增财富（Flow）。</li>
                    <li><strong className="text-pink-400">抄底保护机制：</strong> 即使日收益率（ROI）为负（Fear 状态），机器人也会保留约 5% 的制作活动和 20% 的开箱活动，模拟市场中的坚定持有者和投机抄底行为，防止经济系统完全停滞。</li>
                </ul>
            </div>

        </div>
      </div>
    </div>
  );
}