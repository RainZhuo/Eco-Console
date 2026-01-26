import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ResponsiveContainer, AreaChart, Area, BarChart, Bar, ComposedChart 
} from 'recharts';
import { 
  Coins, Box, Hammer, TrendingUp, RefreshCw, Archive, Activity, DollarSign, Database, Lock, Unlock, Gift, Users 
} from 'lucide-react';
import { AMMState, GlobalState, PlayerState, DailyLog, CONFIG } from './types';
import { calculateBuybackRate, formatNumber, getAmountOut } from './utils';
import { InfoCard } from './components/InfoCard';

// Helper to simulate bot activity for a day
const generateBotActivity = () => {
    // Random fluctuation
    const volatility = () => 0.8 + Math.random() * 0.4;
    
    const newWealth = Math.floor(CONFIG.SIM_OTHERS_COUNT * CONFIG.SIM_OTHERS_DAILY_WEALTH_AVG * volatility());
    const newMedals = Math.floor(CONFIG.SIM_OTHERS_COUNT * CONFIG.SIM_OTHERS_MEDAL_INVEST_AVG * volatility());
    
    // Note: Bot staking is now handled in advanceDay based on rewards.
    // We assume 0 external capital staking in this simplified model.
    const stakeIncrease = 0; 

    // Calculate Costs incurred by bots (entering Reservoir)
    // 1. Crafting Cost (50% to reservoir)
    const itemsCrafted = newWealth / CONFIG.WEALTH_PER_ITEM;
    const craftCost = itemsCrafted * CONFIG.CRAFT_COST;
    const reservoirFromCraft = craftCost * 0.5;

    // 2. Chest Open Cost (100% to reservoir)
    // Approx medals per chest = 10 (Avg of 5-15).
    // Logic: Bots open enough chests to get 'newMedals'.
    const chestsOpened = newMedals / 10;
    const chestCost = chestsOpened * CONFIG.CHEST_OPEN_COST;
    const reservoirFromChest = chestCost;

    return {
        wealth: newWealth,
        medals: newMedals,
        stakeIncrease: stakeIncrease,
        reservoirInput: reservoirFromCraft + reservoirFromChest
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
    totalStakedMeme: 500000, // Initial simulated stake from others
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
  const [openChestBatchSize, setOpenChestBatchSize] = useState(1);
  const [sellMemePercent, setSellMemePercent] = useState(50);
  const [stakeAmount, setStakeAmount] = useState(0);
  
  // --- Derived Metrics ---
  const currentPrice = amm.reserveLvMON / amm.reserveMEME;

  // --- Effect: Day 1 Initialization ---
  useEffect(() => {
    if (!hasInitializedDay1.current) {
        const bots = generateBotActivity();
        setGlobal(prev => ({
            ...prev,
            dailyNewWealth: bots.wealth,
            totalWealth: prev.totalWealth + bots.wealth,
            medalsInPool: bots.medals,
            reservoirLvMON: prev.reservoirLvMON + bots.reservoirInput,
            totalStakedMeme: prev.totalStakedMeme + bots.stakeIncrease
        }));
        hasInitializedDay1.current = true;
    }
  }, []);
  
  // --- Actions ---

  const craftEquipment = () => {
    const cost = CONFIG.CRAFT_COST * craftBatchSize;
    if (player.lvMON < cost) return alert("LvMON 不足！");

    const wealthGain = CONFIG.WEALTH_PER_ITEM * craftBatchSize;
    const toReservoir = cost * 0.5; // 50% to Reservoir

    // Calculate immediate chests for the new equipment
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

  const openChests = () => {
    if (player.chests < openChestBatchSize) return alert("宝箱数量不足！");
    const cost = CONFIG.CHEST_OPEN_COST * openChestBatchSize;
    if (player.lvMON < cost) return alert("开启宝箱所需的 LvMON 不足！");

    // Calculate medals (random 5-15)
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
      reservoirLvMON: prev.reservoirLvMON + cost, // 100% to reservoir
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

    // B. Bot Logic: Tax, Stake, Sell (Simulate Others)
    // 1. Tax (10% stays in system/distributed to player)
    const taxRate = 0.1;
    const botTax = othersPendingReward * taxRate; 
    const botNetReward = othersPendingReward - botTax;

    // 2. Stake vs Sell
    const botStakeRatio = 0.3; // Bots stake 30% of their rewards
    const botStakedAmount = botNetReward * botStakeRatio;
    const botSellAmount = botNetReward - botStakedAmount;

    // C. Execute Bot Sell on AMM (Before buyback)
    let tempReserveMEME = amm.reserveMEME;
    let tempReserveLvMON = amm.reserveLvMON;
    
    if (botSellAmount > 0) {
        // AMM Swap: Input MEME -> Output LvMON
        const lvMONOut = getAmountOut(botSellAmount, tempReserveMEME, tempReserveLvMON);
        tempReserveMEME += botSellAmount;
        tempReserveLvMON -= lvMONOut;
    }

    // D. Buyback Calculation (Using updated reserves)
    const currentBuybackRate = calculateBuybackRate(global.dailyNewWealth);
    const buybackBudget = global.reservoirLvMON * currentBuybackRate;
    
    let actualBuybackAmount = 0;
    let stakingDividend = 0;

    if (buybackBudget > 0) {
        // AMM Swap: Input LvMON -> Output MEME
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
    
    // Update total staked with the new bot amount for *next* cycle
    const newTotalStakedMeme = global.totalStakedMeme + botStakedAmount;

    // F. Redistribution (Tax from others goes to player)
    const playerRedistributionShare = botTax / (CONFIG.SIM_OTHERS_COUNT + 1);

    // G. Daily Grant (Chests)
    const newChests = Math.floor(player.wealth / 100);

    // H. Log History
    const log: DailyLog = {
        day: global.day,
        memePrice: tempReserveLvMON / tempReserveMEME,
        reservoirBalance: global.reservoirLvMON - actualBuybackAmount,
        buybackAmount: actualBuybackAmount,
        buybackRate: currentBuybackRate,
        totalWealth: global.totalWealth,
        newWealth: global.dailyNewWealth,
        stakingApy: global.totalStakedMeme > 0 ? (stakingDividend * 365 / global.totalStakedMeme) : 0
    };
    setHistory(prev => [...prev, log]);

    // === 2. SIMULATE NEXT DAY ACTIVITY (Start of Day) ===
    const nextDayBots = generateBotActivity();

    // === 3. UPDATE STATES ===
    
    setAmm({
        ...amm,
        reserveMEME: tempReserveMEME,
        reserveLvMON: tempReserveLvMON
    });

    setPlayer(prev => ({
        ...prev,
        chests: prev.chests + newChests,
        investedMedals: 0, // Reset daily
        unclaimedPoolReward: prev.unclaimedPoolReward + playerPendingReward,
        unclaimedRedistribution: prev.unclaimedRedistribution + playerRedistributionShare,
        unclaimedStakingReward: prev.unclaimedStakingReward + playerStakingShare
    }));

    setGlobal(prev => ({
        ...prev,
        day: prev.day + 1,
        // New Reservoir = Old - Buyback + New Bot Inputs
        reservoirLvMON: (prev.reservoirLvMON - actualBuybackAmount) + nextDayBots.reservoirInput,
        dailyNewWealth: nextDayBots.wealth, 
        medalsInPool: nextDayBots.medals, 
        totalWealth: prev.totalWealth + nextDayBots.wealth,
        totalStakedMeme: newTotalStakedMeme + nextDayBots.stakeIncrease
    }));
  };

  // --- Auto-Simulation Helper ---
  const [isAuto, setIsAuto] = useState(false);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isAuto) {
      interval = setInterval(() => {
         advanceDay();
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isAuto, global, amm, player]); 


  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      
      {/* Header */}
      <header className="mb-8 flex justify-between items-center border-b border-slate-700 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
            MMORPG 经济系统控制台
          </h1>
          <p className="text-slate-400 mt-1 flex items-center gap-2">
            <Users size={16} /> 模拟器：1 名真实玩家 + {CONFIG.SIM_OTHERS_COUNT} 名模拟玩家在线
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

            {/* Chart 2: Buyback & Staking */}
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
                    <h3 className="text-md font-bold text-white mb-4">Sigmoid 调节 (财富增量 vs 回购率)</h3>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={history}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="day" stroke="#94a3b8" />
                                <YAxis domain={[0, 0.1]} stroke="#94a3b8" tickFormatter={(v) => `${(v*100).toFixed(0)}%`} />
                                <ReTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                <Line type="monotone" dataKey="buybackRate" stroke="#fbbf24" strokeWidth={2} name="回购率" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            
            {/* Explanation Section */}
            <div className="bg-slate-800/50 p-4 rounded text-sm text-slate-400 border border-slate-700">
                <h4 className="font-bold text-white mb-2 flex items-center gap-2"><Database size={14}/> 系统机制更新</h4>
                <ul className="list-disc list-inside space-y-1">
                    <li><strong className="text-blue-400">时间流速：</strong> 每日开始时，已预先模拟全服（机器人）的制作与勋章投入。您看到的奖池是包含机器人投入后的总量。</li>
                    <li><strong className="text-purple-400">机器人行为：</strong> 每日结算时，机器人会领取奖励，将部分 MEME 质押，剩余 MEME 全部卖向交易池（产生抛压）。</li>
                    <li><strong className="text-pink-400">自动回购：</strong> 随后系统根据今日全服财富增量，使用蓄水池资金回购 MEME 并销毁（90%）或分红（10%）。</li>
                    <li><strong className="text-red-400">纳税机制：</strong> 机器人领奖时产生的 10% 纳税额会进入“他人纳税分红”池，供您领取。</li>
                </ul>
            </div>

        </div>
      </div>
    </div>
  );
}