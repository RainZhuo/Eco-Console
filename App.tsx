import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ResponsiveContainer, AreaChart, Area, BarChart, Bar, ComposedChart 
} from 'recharts';
import { 
  Coins, Box, Hammer, TrendingUp, RefreshCw, Archive, Activity, DollarSign, Database, Lock, Unlock, Gift, Users, Gauge, TrendingDown, Zap, Flame, Download, BrainCircuit, Loader2, AlertTriangle, CloudLightning, User 
} from 'lucide-react';
import { AMMState, GlobalState, PlayerState, DailyLog, CONFIG, BotState, BotDailyLog } from './types';
import { calculateBuybackRate, formatNumber, getAmountOut } from './utils';
import { InfoCard } from './components/InfoCard';
import { BotManager, MarketContext, BotAction } from './Bot';

export default function App() {
  // --- State Initialization ---
  
  const [global, setGlobal] = useState<GlobalState>({
    day: 1,
    reservoirLvMON: 0,
    totalWealth: 500000, 
    dailyNewWealth: 0,
    medalsInPool: 50000, 
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

  // NEW: Bots State
  const [bots, setBots] = useState<BotState[]>([]);
  
  // NEW: Bot Detailed History (for export)
  const [botHistory, setBotHistory] = useState<BotDailyLog[]>([]);

  const [history, setHistory] = useState<DailyLog[]>([]);
  const hasInitializedDay1 = useRef(false);

  // Simulation Controls
  const [craftBatchSize, setCraftBatchSize] = useState(1);
  const [salvageBatchSize, setSalvageBatchSize] = useState(1);
  const [openChestBatchSize, setOpenChestBatchSize] = useState(1);
  const [sellMemePercent, setSellMemePercent] = useState(50);
  const [stakeAmount, setStakeAmount] = useState(0);

  // AI Controls
  const [isAiMode, setIsAiMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [apiUsage, setApiUsage] = useState(0);
  const [apiStatus, setApiStatus] = useState<'ok' | 'limit' | 'quota'>('ok');
  
  const botManagerRef = useRef<BotManager | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<'ops' | 'defi' | 'rewards'>('ops');
  
  const currentPrice = amm.reserveLvMON / amm.reserveMEME;

  useEffect(() => {
    if (!hasInitializedDay1.current) {
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
            botRoi: 0.01,
            medalsInPool: 50000,
            aiAnalysis: "System Initialized"
        }]);
        hasInitializedDay1.current = true;
        
        // Init Bot Manager & Bots
        if (process.env.API_KEY) {
            botManagerRef.current = new BotManager(process.env.API_KEY);
            setBots(botManagerRef.current.generateInitialBots());
        }
    }
  }, []);
  
  // --- Actions ---

  const handleExportHistory = () => {
      if (history.length === 0) return alert("暂无历史数据");
      const wb = XLSX.utils.book_new();

      // Sheet 1: Global History
      const wsHistory = XLSX.utils.json_to_sheet(history);
      const wscolsHistory = [
          {wch: 5}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 15}, {wch: 50},
      ];
      wsHistory['!cols'] = wscolsHistory;
      XLSX.utils.book_append_sheet(wb, wsHistory, "Global Overview");

      // Sheet 2: Bot Detailed Logs
      if (botHistory.length > 0) {
        const wsBots = XLSX.utils.json_to_sheet(botHistory);
        const wscolsBots = [
            {wch: 5}, {wch: 5}, {wch: 12}, // Day, ID, Type
            {wch: 10}, {wch: 8}, // Price, Trend
            {wch: 40}, {wch: 40}, // Rationale, Planned
            {wch: 30}, // Execution Notes
            {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, // Deltas
            {wch: 12}, {wch: 12} // Final Balances
        ];
        wsBots['!cols'] = wscolsBots;
        XLSX.utils.book_append_sheet(wb, wsBots, "Bot Details");
      }

      XLSX.writeFile(wb, `mmo_history_day${global.day}.xlsx`);
  };

  const craftEquipment = () => {
    const cost = CONFIG.CRAFT_COST * craftBatchSize;
    if (player.lvMON < cost) return alert("LvMON 不足！");
    const wealthGain = CONFIG.WEALTH_PER_ITEM * craftBatchSize;
    const toReservoir = cost * 0.5; 
    const instantChests = Math.floor(wealthGain / 100);
    setPlayer(prev => ({ ...prev, lvMON: prev.lvMON - cost, wealth: prev.wealth + wealthGain, equipmentCount: prev.equipmentCount + craftBatchSize, chests: prev.chests + instantChests }));
    setGlobal(prev => ({ ...prev, totalWealth: prev.totalWealth + wealthGain, dailyNewWealth: prev.dailyNewWealth + wealthGain, reservoirLvMON: prev.reservoirLvMON + toReservoir }));
  };

  const handleSalvage = () => {
      const count = salvageBatchSize;
      if (player.equipmentCount < count) return alert("装备数量不足");
      const wealthToBurn = count * CONFIG.WEALTH_PER_ITEM;
      const lvMONReturn = wealthToBurn * CONFIG.WEALTH_SALVAGE_RATE;
      setPlayer(prev => ({ ...prev, equipmentCount: prev.equipmentCount - count, wealth: prev.wealth - wealthToBurn, lvMON: prev.lvMON + lvMONReturn }));
      setGlobal(prev => ({ ...prev, totalWealth: Math.max(0, prev.totalWealth - wealthToBurn) }));
  };

  const openChests = () => {
    if (player.chests < openChestBatchSize) return alert("宝箱数量不足！");
    const cost = CONFIG.CHEST_OPEN_COST * openChestBatchSize;
    if (player.lvMON < cost) return alert("开启宝箱所需的 LvMON 不足！");
    let totalMedalsWon = 0;
    for (let i = 0; i < openChestBatchSize; i++) totalMedalsWon += Math.floor(Math.random() * (CONFIG.MEDAL_MAX - CONFIG.MEDAL_MIN + 1)) + CONFIG.MEDAL_MIN;
    setPlayer(prev => ({ ...prev, chests: prev.chests - openChestBatchSize, lvMON: prev.lvMON - cost, medals: prev.medals + totalMedalsWon }));
    setGlobal(prev => ({ ...prev, reservoirLvMON: prev.reservoirLvMON + cost }));
  };

  const investMedals = () => {
    if (player.medals === 0) return;
    const amount = player.medals;
    setPlayer(prev => ({ ...prev, medals: 0, investedMedals: prev.investedMedals + amount }));
    setGlobal(prev => ({ ...prev, medalsInPool: prev.medalsInPool + amount }));
  };

  const sellMeme = () => {
    if (player.meme === 0) return;
    const amountIn = Math.floor(player.meme * (sellMemePercent / 100));
    if (amountIn <= 0) return;
    const amountOut = getAmountOut(amountIn, amm.reserveMEME, amm.reserveLvMON);
    setAmm(prev => ({ ...prev, reserveMEME: prev.reserveMEME + amountIn, reserveLvMON: prev.reserveLvMON - amountOut }));
    setPlayer(prev => ({ ...prev, meme: prev.meme - amountIn, lvMON: prev.lvMON + amountOut }));
  };

  const handleStakeMeme = () => {
    if (stakeAmount <= 0) return;
    if (player.meme < stakeAmount) return alert("MEME 不足");
    setPlayer(prev => ({ ...prev, meme: prev.meme - stakeAmount, stakedMeme: prev.stakedMeme + stakeAmount }));
    setGlobal(prev => ({ ...prev, totalStakedMeme: prev.totalStakedMeme + stakeAmount }));
    setStakeAmount(0);
  };

  const handleUnstakeMeme = () => {
    if (player.stakedMeme <= 0) return;
    const amount = player.stakedMeme;
    setPlayer(prev => ({ ...prev, stakedMeme: 0, meme: prev.meme + amount }));
    setGlobal(prev => ({ ...prev, totalStakedMeme: Math.max(0, prev.totalStakedMeme - amount) }));
  };

  const claimPoolReward = () => {
    if (player.unclaimedPoolReward <= 0) return;
    const reward = player.unclaimedPoolReward * 0.9;
    setPlayer(prev => ({ ...prev, meme: prev.meme + reward, unclaimedPoolReward: 0 }));
  };

  const claimRedistribution = () => {
    if (player.unclaimedRedistribution <= 0) return;
    setPlayer(prev => ({ ...prev, meme: prev.meme + prev.unclaimedRedistribution, unclaimedRedistribution: 0 }));
  };

  const claimStakingReward = () => {
    if (player.unclaimedStakingReward <= 0) return;
    setPlayer(prev => ({ ...prev, meme: prev.meme + prev.unclaimedStakingReward, unclaimedStakingReward: 0 }));
  };

  // --- Core Logic ---

  const advanceDay = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
        const lastLog = history[history.length - 1];
        const lastApy = lastLog?.stakingApy || 0;
        
        // 1. Calculate Trends
        let prevPrice = lastLog?.memePrice || (CONFIG.INITIAL_AMM_LVMON / CONFIG.INITIAL_AMM_MEME);
        let priceTrend = currentPrice > prevPrice ? 'Up' : (currentPrice < prevPrice ? 'Down' : 'Stable');

        // 2. AI Decision Phase (Get Strategy for all 10 bots)
        let botActions: BotAction[] = [];
        let marketAnalysisText = "Processing...";

        if (isAiMode && botManagerRef.current && bots.length > 0) {
            const context: MarketContext = {
                day: global.day,
                price: currentPrice,
                apy: lastApy,
                totalMedalsInPool: global.medalsInPool || 1,
                priceTrend
            };
            
            const result = await botManagerRef.current.getPlayersDecisions(context, bots);
            setApiUsage(botManagerRef.current.apiCallCount);
            setApiStatus(result.reason === 'Quota' ? 'quota' : (result.reason === 'RateLimit' ? 'limit' : 'ok'));
            
            botActions = result.actions;
            marketAnalysisText = result.analysis;
            
            if (result.reason !== 'Success') {
                marketAnalysisText += ` (Action Skipped: ${result.reason})`;
                botActions = [];
            }
        }
        
        setAiAnalysis(marketAnalysisText);

        // 3. SETTLEMENT OF PREVIOUS DAY REWARDS (For Bots & Player)
        const totalMedals = global.medalsInPool;
        let playerReward = 0;
        let othersTotalReward = 0;
        
        if (totalMedals > 0) {
            playerReward = CONFIG.DAILY_MEME_REWARD * (player.investedMedals / totalMedals);
            // Bots share
            const botsInvestedTotal = bots.reduce((sum, b) => sum + (b.medals > 0 ? b.medals : 0), 0); 
            othersTotalReward = CONFIG.DAILY_MEME_REWARD * (botsInvestedTotal / totalMedals);
        }

        // Tax Calculation
        const taxRate = 0.1;
        const playerTax = playerReward * taxRate;
        const botTax = othersTotalReward * taxRate;
        const playerNetReward = playerReward - playerTax;
        
        // 4. SEQUENTIAL EXECUTION OF BOT ACTIONS
        let tempGlobal = { ...global };
        let tempAmm = { ...amm };
        let tempBots = [...bots];
        let tempPlayer = { ...player };

        // Distribute Rewards to Bots first
        const yesterdayBotMedals = tempBots.reduce((sum, b) => sum + b.medals, 0);
        if (yesterdayBotMedals > 0) {
             tempBots.forEach(bot => {
                 const share = bot.medals / totalMedals;
                 const gross = CONFIG.DAILY_MEME_REWARD * share;
                 const net = gross * 0.9;
                 bot.meme += net; 
                 bot.medals = 0;
             });
        }

        // Shuffle actions
        const shuffledActions = [...botActions].sort(() => Math.random() - 0.5);
        
        // Logs for this specific turn
        const currentDayBotLogs: BotDailyLog[] = [];

        // Track aggregates
        let totalBotNewWealth = 0;
        let totalBotReservoirInput = 0;
        let totalBotChestCost = 0;
        let totalBotMedalsGenerated = 0;
        let totalBotMemeSold = 0;
        let totalBotMemeStakedDelta = 0;

        // --- EXECUTE BOT LOOP ---
        shuffledActions.forEach(action => {
            const botIndex = tempBots.findIndex(b => b.id === action.botId);
            if (botIndex === -1) return;
            const bot = tempBots[botIndex];

            // Snapshot for log
            const startLvMON = bot.lvMON;
            const startMeme = bot.meme;
            const startWealth = bot.wealth;
            const startStaked = bot.stakedMeme;
            
            let plannedStr = "";
            let executionNotes = [];
            
            // 1. Crafting
            if (action.craftCount > 0) {
                plannedStr += `Craft:${action.craftCount} `;
                const cost = action.craftCount * CONFIG.CRAFT_COST;
                if (bot.lvMON >= cost) {
                    bot.lvMON -= cost;
                    const wealthGain = action.craftCount * CONFIG.WEALTH_PER_ITEM;
                    bot.wealth += wealthGain;
                    bot.equipmentCount += action.craftCount;
                    // System impact
                    tempGlobal.dailyNewWealth += wealthGain;
                    tempGlobal.totalWealth += wealthGain;
                    totalBotNewWealth += wealthGain;
                    
                    const toReservoir = cost * 0.5;
                    tempGlobal.reservoirLvMON += toReservoir;
                    totalBotReservoirInput += toReservoir;

                    const bonusChests = Math.floor(wealthGain / 100);
                    bot.chests += bonusChests;
                    executionNotes.push("Craft:OK");
                } else {
                    executionNotes.push("Craft:Fail(Funds)");
                }
            }

            // 2. Open Chests
            if (action.openChests > 0) {
                plannedStr += `Open:${action.openChests} `;
                if (bot.chests >= action.openChests) {
                    const cost = action.openChests * CONFIG.CHEST_OPEN_COST;
                    if (bot.lvMON >= cost) {
                        bot.lvMON -= cost;
                        bot.chests -= action.openChests;
                        let medalsWon = 0;
                        for(let k=0; k<action.openChests; k++) medalsWon += Math.floor(Math.random() * (CONFIG.MEDAL_MAX - CONFIG.MEDAL_MIN + 1)) + CONFIG.MEDAL_MIN;
                        bot.medals += medalsWon;
                        
                        tempGlobal.reservoirLvMON += cost;
                        totalBotChestCost += cost;
                        executionNotes.push("Open:OK");
                    } else {
                        executionNotes.push("Open:Fail(Funds)");
                    }
                } else {
                     executionNotes.push("Open:Fail(Chests)");
                }
            }

            // 3. Invest Medals
            if (action.investMedals) {
                plannedStr += `Invest:All `;
                if (bot.medals > 0) {
                    totalBotMedalsGenerated += bot.medals;
                    executionNotes.push(`Invested:${bot.medals}`);
                    // Note: bot.medals is not reset here, it stays until next morning reward distribution
                } else {
                    executionNotes.push("Invest:None");
                }
            }

            // 4. Unstake
            if (action.unstakeMemePercent > 0) {
                plannedStr += `Unstake:${(action.unstakeMemePercent*100).toFixed(0)}% `;
                if (bot.stakedMeme > 0) {
                    const amount = bot.stakedMeme * action.unstakeMemePercent;
                    bot.stakedMeme -= amount;
                    bot.meme += amount;
                    tempGlobal.totalStakedMeme = Math.max(0, tempGlobal.totalStakedMeme - amount);
                    totalBotMemeStakedDelta -= amount;
                    executionNotes.push(`Unstaked:${formatNumber(amount)}`);
                }
            }

            // 5. Sell MEME
            if (action.sellMemePercent > 0) {
                plannedStr += `Sell:${(action.sellMemePercent*100).toFixed(0)}% `;
                if (bot.meme > 0) {
                    const amountIn = Math.floor(bot.meme * action.sellMemePercent);
                    if (amountIn > 0) {
                        const amountOut = getAmountOut(amountIn, tempAmm.reserveMEME, tempAmm.reserveLvMON);
                        tempAmm.reserveMEME += amountIn;
                        tempAmm.reserveLvMON -= amountOut;
                        
                        bot.meme -= amountIn;
                        bot.lvMON += amountOut;
                        totalBotMemeSold += amountIn;
                        executionNotes.push(`Sold:${formatNumber(amountIn)}`);
                    }
                }
            }

            // 6. Stake MEME
            if (action.stakeMemePercent > 0) {
                 plannedStr += `Stake:${(action.stakeMemePercent*100).toFixed(0)}% `;
                 if (bot.meme > 0) {
                    const amount = Math.floor(bot.meme * action.stakeMemePercent);
                    if (amount > 0) {
                        bot.meme -= amount;
                        bot.stakedMeme += amount;
                        tempGlobal.totalStakedMeme += amount;
                        totalBotMemeStakedDelta += amount;
                        executionNotes.push(`Staked:${formatNumber(amount)}`);
                    }
                }
            }

            // Create Log Entry
            const logEntry: BotDailyLog = {
                day: tempGlobal.day,
                botId: bot.id,
                personality: bot.personality,
                marketPrice: currentPrice,
                marketTrend: priceTrend,
                rationale: action.rationale,
                plannedActions: plannedStr,
                executionNotes: executionNotes.join(', ') || "No Impact",
                deltaLvMON: bot.lvMON - startLvMON,
                deltaMeme: bot.meme - startMeme,
                deltaWealth: bot.wealth - startWealth,
                deltaStaked: bot.stakedMeme - startStaked,
                finalLvMON: bot.lvMON,
                finalMeme: bot.meme
            };
            currentDayBotLogs.push(logEntry);
        });

        // 5. SYSTEM BUYBACK & DIVIDENDS
        const currentBuybackRate = calculateBuybackRate(tempGlobal.dailyNewWealth);
        const buybackBudget = tempGlobal.reservoirLvMON * currentBuybackRate;
        
        let actualBuybackAmount = 0;
        let actualMemeBought = 0;
        let stakingDividend = 0;

        if (buybackBudget > 0) {
            actualBuybackAmount = buybackBudget;
            actualMemeBought = getAmountOut(buybackBudget, tempAmm.reserveLvMON, tempAmm.reserveMEME);
            
            tempAmm.reserveLvMON += buybackBudget;
            tempAmm.reserveMEME -= actualMemeBought;
            
            tempGlobal.reservoirLvMON -= buybackBudget;
            stakingDividend = actualMemeBought * 0.1; // 10% to stakers
        }

        // 6. PLAYER UPDATES
        tempPlayer.unclaimedPoolReward += playerNetReward;
        const playerWealthShare = tempPlayer.wealth / (tempGlobal.totalWealth || 1);
        tempPlayer.unclaimedRedistribution += (botTax * playerWealthShare);

        // Staking Reward
        if (tempGlobal.totalStakedMeme > 0) {
            const playerStakingShare = stakingDividend * (tempPlayer.stakedMeme / tempGlobal.totalStakedMeme);
            tempPlayer.unclaimedStakingReward += playerStakingShare;
            
            const botStakingTotal = stakingDividend - playerStakingShare;
            if (botStakingTotal > 0) {
                 tempBots.forEach(b => {
                     if (b.stakedMeme > 0) {
                         b.meme += botStakingTotal * (b.stakedMeme / tempGlobal.totalStakedMeme);
                     }
                 });
            }
        }

        const newChests = Math.floor(tempPlayer.wealth / 100);
        tempPlayer.chests += newChests;
        tempPlayer.investedMedals = 0; 

        // 7. FINALIZE STATE
        const log: DailyLog = {
            day: tempGlobal.day,
            memePrice: tempAmm.reserveLvMON / tempAmm.reserveMEME,
            reservoirBalance: tempGlobal.reservoirLvMON,
            buybackAmount: actualBuybackAmount,
            buybackMemeAmount: actualMemeBought,
            buybackRate: currentBuybackRate,
            totalWealth: tempGlobal.totalWealth,
            newWealth: tempGlobal.dailyNewWealth,
            stakingApy: tempGlobal.totalStakedMeme > 0 ? (stakingDividend * 365 / tempGlobal.totalStakedMeme) : 0,
            botActivity: shuffledActions.length / 10,
            botRoi: 0, 
            medalsInPool: tempGlobal.medalsInPool,
            aiAnalysis: marketAnalysisText
        };

        setHistory(prev => [...prev, log]);
        setBotHistory(prev => [...prev, ...currentDayBotLogs]); // Append detail logs
        setAmm(tempAmm);
        setPlayer(tempPlayer);
        setBots(tempBots);
        setGlobal(prev => ({
            ...tempGlobal,
            day: prev.day + 1,
            medalsInPool: totalBotMedalsGenerated, 
            dailyNewWealth: 0 
        }));

    } catch (e) {
        console.error("Advance Day Error", e);
    } finally {
        setIsProcessing(false);
    }
  };

  // --- Auto-Simulation Helper ---
  const [isAuto, setIsAuto] = useState(false);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isAuto && !isProcessing) {
      interval = setInterval(() => {
         advanceDay();
      }, isAiMode ? 6000 : 1000); 
    }
    return () => clearInterval(interval);
  }, [isAuto, isProcessing, global, amm, player, isAiMode, bots]); 

  const lastLog = history[history.length - 1];
  const productionCost = lastLog && lastLog.medalsInPool ? lastLog.medalsInPool / CONFIG.DAILY_MEME_REWARD : 0.05;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-700 pb-4 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
            MMORPG 经济系统控制台
          </h1>
          <p className="text-slate-400 mt-1 flex items-center gap-2">
            <Users size={16} /> 模拟器：1 名真实玩家 + 10 名独立 AI 代理
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
             {/* AI Toggle */}
             <div className="flex items-center gap-2 bg-slate-800 p-2 rounded border border-slate-600">
                <BrainCircuit size={20} className={isAiMode ? "text-purple-400" : "text-slate-500"} />
                <div className="flex flex-col">
                    <span className="text-xs text-slate-400">AI 驱动决策 (Gemini)</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={isAiMode} onChange={(e) => setIsAiMode(e.target.checked)} className="sr-only peer" disabled={!process.env.API_KEY} />
                        <div className="w-9 h-5 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                        <span className="ml-2 text-xs font-bold">{isAiMode ? "ON" : "OFF"}</span>
                    </label>
                </div>
             </div>

             {/* API Status Badge */}
             {process.env.API_KEY && (
                 <div className={`px-3 py-1 rounded text-xs font-mono border flex items-center gap-2 ${
                    apiStatus === 'quota' ? 'bg-red-900/50 border-red-500 text-red-200' : 
                    apiStatus === 'limit' ? 'bg-yellow-900/50 border-yellow-500 text-yellow-200' :
                    'bg-slate-800 border-slate-600 text-slate-300'
                 }`}>
                    <CloudLightning size={12} />
                    <span>Calls: {apiUsage}</span>
                 </div>
             )}

             <div className="text-right">
                <div className="text-xs text-slate-500 uppercase">当前天数</div>
                <div className="text-2xl font-mono font-bold text-white">Day {global.day}</div>
             </div>
             
             <button onClick={handleExportHistory} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded border border-slate-600" title="导出">
                <Download size={18} /> 
             </button>

             <button 
                onClick={() => setIsAuto(!isAuto)}
                className={`px-4 py-2 rounded font-bold transition-colors ${isAuto ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}
             >
                {isAuto ? '停止' : '自动'}
             </button>
             <button 
                onClick={advanceDay}
                disabled={isProcessing}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-wait text-white rounded font-bold shadow-lg flex items-center gap-2"
             >
                {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <RefreshCw size={18} />} 
                {isProcessing ? "处理中..." : "下一天"}
             </button>
        </div>
      </header>
      
      {/* AI Analysis Banner */}
      {isAiMode && aiAnalysis && (
        <div className={`mb-6 p-4 rounded-lg flex gap-3 items-start animate-in fade-in slide-in-from-top-2 border ${
            apiStatus === 'quota' ? 'bg-red-900/20 border-red-500/50' : 
            apiStatus === 'limit' ? 'bg-yellow-900/20 border-yellow-500/50' :
            'bg-purple-900/20 border-purple-500/30'
        }`}>
            {apiStatus === 'quota' ? <AlertTriangle className="text-red-400 shrink-0 mt-1" size={20} /> :
             apiStatus === 'limit' ? <Loader2 className="text-yellow-400 shrink-0 mt-1 animate-spin-slow" size={20} /> :
             <BrainCircuit className="text-purple-400 shrink-0 mt-1" size={20} />}
            
            <div className="flex-1">
                <h3 className={`text-sm font-bold mb-1 ${
                    apiStatus === 'quota' ? 'text-red-300' : 
                    apiStatus === 'limit' ? 'text-yellow-300' : 
                    'text-purple-300'
                }`}>
                    AI 市场分析 & 决策日志
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">{aiAnalysis}</p>
            </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (Player Actions) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
            
            {/* 1. Assets */}
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

            {/* 2. Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
                <button onClick={() => setActiveTab('ops')} className={`flex items-center justify-center gap-2 py-2 rounded text-sm font-bold ${activeTab === 'ops' ? 'bg-blue-900/50 text-blue-400 ring-1 ring-blue-500/50' : 'text-slate-400 hover:bg-slate-700/50'}`}><Hammer size={16} /> 生产</button>
                <button onClick={() => setActiveTab('defi')} className={`flex items-center justify-center gap-2 py-2 rounded text-sm font-bold ${activeTab === 'defi' ? 'bg-purple-900/50 text-purple-400 ring-1 ring-purple-500/50' : 'text-slate-400 hover:bg-slate-700/50'}`}><TrendingUp size={16} /> 金融</button>
                <button onClick={() => setActiveTab('rewards')} className={`flex items-center justify-center gap-2 py-2 rounded text-sm font-bold ${activeTab === 'rewards' ? 'bg-yellow-900/50 text-yellow-400 ring-1 ring-yellow-500/50' : 'text-slate-400 hover:bg-slate-700/50'}`}><Gift size={16} /> 收益</button>
            </div>

            {/* 3. Tab Content */}
            <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-lg min-h-[420px]">
                {activeTab === 'ops' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                        <div className="bg-slate-700/30 p-3 rounded">
                            <div className="flex justify-between items-center mb-2"><span className="text-sm font-medium flex items-center gap-2"><Hammer size={16} className="text-slate-400"/> 制作装备</span><span className="text-xs text-slate-400">消耗：{CONFIG.CRAFT_COST * craftBatchSize} LvMON</span></div>
                            <div className="flex gap-2"><input type="number" min="1" value={craftBatchSize} onChange={(e) => setCraftBatchSize(parseInt(e.target.value) || 1)} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 text-sm"/><button onClick={craftEquipment} className="flex-1 bg-blue-600 hover:bg-blue-500 text-xs py-1.5 rounded font-bold">制作 (增加财富)</button></div>
                        </div>
                        <div className="bg-red-900/20 border border-red-900/50 p-3 rounded">
                            <div className="flex justify-between items-center mb-2"><span className="text-sm font-medium flex items-center gap-2 text-red-300"><Flame size={16}/> 销毁装备 ({player.equipmentCount})</span><span className="text-xs text-slate-400">返还 50%</span></div>
                            <div className="flex gap-2"><input type="number" min="1" value={salvageBatchSize} onChange={(e) => setSalvageBatchSize(parseInt(e.target.value) || 1)} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 text-sm"/><button onClick={handleSalvage} className="flex-1 bg-red-800 hover:bg-red-700 text-xs py-1.5 rounded font-bold text-red-100">销毁 (回收资金)</button></div>
                        </div>
                        <div className="bg-slate-700/30 p-3 rounded">
                            <div className="flex justify-between items-center mb-2"><span className="text-sm font-medium flex items-center gap-2"><Box size={16} className="text-slate-400"/> 开启宝箱 ({player.chests})</span><span className="text-xs text-slate-400">消耗：{CONFIG.CHEST_OPEN_COST * openChestBatchSize} LvMON</span></div>
                            <div className="flex gap-2"><input type="number" min="1" value={openChestBatchSize} onChange={(e) => setOpenChestBatchSize(parseInt(e.target.value) || 1)} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 text-sm"/><button onClick={openChests} className="flex-1 bg-orange-600 hover:bg-orange-500 text-xs py-1.5 rounded font-bold">开启 (获得勋章)</button></div>
                        </div>
                        <div className="bg-slate-700/30 p-3 rounded">
                            <div className="flex justify-between items-center mb-2"><span className="text-sm font-medium flex items-center gap-2"><Archive size={16} className="text-slate-400"/> 投入勋章 ({player.medals})</span><span className="text-xs text-slate-400">全服：{formatNumber(global.medalsInPool)}</span></div>
                            <button onClick={investMedals} className="w-full bg-indigo-600 hover:bg-indigo-500 text-xs py-1.5 rounded font-bold">全部投入奖池</button>
                        </div>
                    </div>
                )}
                {activeTab === 'defi' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                        <div className="bg-slate-700/30 p-3 rounded">
                            <div className="flex justify-between items-center mb-2"><h2 className="text-sm font-bold flex items-center gap-2 text-white"><Lock size={16} className="text-pink-400"/> MEME 质押</h2><div className="text-right"><div className="text-xs text-slate-400">全服: {formatNumber(global.totalStakedMeme)}</div><div className="text-xs font-mono text-pink-400">APY: {((lastLog?.stakingApy || 0) * 100).toFixed(2)}%</div></div></div>
                            <div className="flex gap-2 mb-2"><input type="number" placeholder="数量" value={stakeAmount || ''} onChange={(e) => setStakeAmount(parseFloat(e.target.value))} className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 text-sm"/><button onClick={handleStakeMeme} className="px-4 bg-pink-600 hover:bg-pink-500 text-xs py-1.5 rounded font-bold">质押</button></div>
                            <button onClick={handleUnstakeMeme} className="w-full bg-slate-700 hover:bg-slate-600 text-xs py-1.5 rounded font-bold flex justify-center gap-1"><Unlock size={12}/> 全部赎回 ({formatNumber(player.stakedMeme)})</button>
                        </div>
                        <div className="bg-slate-700/30 p-3 rounded">
                            <div className="flex justify-between items-center mb-2"><span className="text-sm font-medium flex items-center gap-2"><TrendingUp size={16} className="text-slate-400"/> 卖出 MEME</span><span className="text-xs text-slate-400">价格: {formatNumber(currentPrice)}</span></div>
                            <div className="flex gap-2 items-center"><input type="range" min="0" max="100" value={sellMemePercent} onChange={(e) => setSellMemePercent(parseInt(e.target.value))} className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer"/><span className="text-xs w-8 text-right">{sellMemePercent}%</span></div>
                            <button onClick={sellMeme} className="w-full mt-2 bg-purple-600 hover:bg-purple-500 text-xs py-1.5 rounded font-bold">卖入交易池</button>
                        </div>
                    </div>
                )}
                {activeTab === 'rewards' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded border border-slate-600/50"><div><div className="text-xs text-slate-400">奖池分红 (90%)</div><div className="font-mono text-purple-400 text-lg">{formatNumber(player.unclaimedPoolReward)}</div></div><button onClick={claimPoolReward} disabled={player.unclaimedPoolReward <= 0} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-xs rounded font-bold">领取</button></div>
                        <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded border border-slate-600/50"><div><div className="text-xs text-slate-400">他人纳税分红</div><div className="font-mono text-green-400 text-lg">{formatNumber(player.unclaimedRedistribution)}</div></div><button onClick={claimRedistribution} disabled={player.unclaimedRedistribution <= 0} className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-xs rounded font-bold">领取</button></div>
                        <div className="flex justify-between items-center p-3 bg-slate-700/30 rounded border border-slate-600/50"><div><div className="text-xs text-slate-400">质押收益 (回购)</div><div className="font-mono text-pink-400 text-lg">{formatNumber(player.unclaimedStakingReward)}</div></div><button onClick={claimStakingReward} disabled={player.unclaimedStakingReward <= 0} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-xs rounded font-bold">领取</button></div>
                    </div>
                )}
            </div>
            
            {/* 4. Bot List (New Visualization) */}
            <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-lg">
                <h3 className="text-md font-bold text-white mb-4 flex items-center gap-2"><Users size={16}/> 玩家/Bot 状态监控</h3>
                <div className="overflow-y-auto max-h-[300px] text-xs">
                    <table className="w-full text-left">
                        <thead className="text-slate-500 border-b border-slate-700">
                            <tr>
                                <th className="pb-2">ID</th>
                                <th className="pb-2">性格</th>
                                <th className="pb-2 text-right">LvMON (法币)</th>
                                <th className="pb-2 text-right">MEME (代币)</th>
                                <th className="pb-2 text-right">质押</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {bots.map(bot => (
                                <tr key={bot.id} className="hover:bg-slate-700/30">
                                    <td className="py-2 font-mono text-slate-400">#{bot.id}</td>
                                    <td className="py-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                                            bot.personality === 'Whale' ? 'bg-blue-900 text-blue-300' :
                                            bot.personality === 'Degen' ? 'bg-purple-900 text-purple-300' :
                                            bot.personality === 'PaperHand' ? 'bg-red-900 text-red-300' :
                                            bot.personality === 'DiamondHand' ? 'bg-green-900 text-green-300' :
                                            'bg-slate-700 text-slate-300'
                                        }`}>
                                            {bot.personality}
                                        </span>
                                    </td>
                                    <td className="py-2 text-right font-mono text-yellow-500/80">{formatNumber(bot.lvMON)}</td>
                                    <td className="py-2 text-right font-mono text-purple-400/80">{formatNumber(bot.meme)}</td>
                                    <td className="py-2 text-right font-mono text-pink-400/80">{formatNumber(bot.stakedMeme)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Right Column: Visualization */}
        <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InfoCard title="MEME 价格" value={currentPrice.toFixed(4)} subValue={`LvMON (成本: ${productionCost.toFixed(4)})`} color="purple" icon={<DollarSign size={24}/>}/>
                <InfoCard title="全服总财富" value={formatNumber(global.totalWealth)} subValue={`+${formatNumber(global.dailyNewWealth)} 今日`} color="green" icon={<Coins size={24}/>}/>
                <InfoCard title="蓄水池存量" value={formatNumber(global.reservoirLvMON)} subValue="用于自动回购" color="blue" icon={<RefreshCw size={24}/>}/>
            </div>
            
            {/* Chart 1: Price & Reservoir */}
            <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 shadow-lg min-w-0">
                <h3 className="text-md font-bold text-white mb-4">市场走势：价格 & 蓄水池</h3>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={history}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="day" stroke="#94a3b8" />
                            <YAxis yAxisId="left" stroke="#a78bfa" label={{ value: '价格 (LvMON)', angle: -90, position: 'insideLeft', fill: '#a78bfa' }} />
                            <YAxis yAxisId="right" stroke="#60a5fa" orientation="right" label={{ value: '蓄水池', angle: 90, position: 'insideRight', fill: '#60a5fa' }} />
                            <ReTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }} />
                            <Legend />
                            <Line yAxisId="left" type="monotone" dataKey="memePrice" stroke="#a78bfa" strokeWidth={2} name="MEME 价格" dot={false} />
                            <Area yAxisId="right" type="monotone" dataKey="reservoirBalance" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.2} name="蓄水池 (LvMON)" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Chart 2: Buyback & Activity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Buyback Chart */}
                 <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 shadow-lg min-w-0">
                    <h3 className="text-md font-bold text-white mb-4">回购分配</h3>
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

                 {/* Activity Chart */}
                <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 shadow-lg min-w-0">
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
                                <Line yAxisId="right" type="monotone" dataKey="buybackRate" stroke="#60a5fa" strokeWidth={2} name="回购比例" dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            
            {/* Explanation Section */}
            <div className="bg-slate-800/50 p-4 rounded text-sm text-slate-400 border border-slate-700">
                <h4 className="font-bold text-white mb-2 flex items-center gap-2"><Database size={14}/> 机制说明</h4>
                <ul className="list-disc list-inside space-y-1">
                    <li><strong className="text-blue-400">上帝视角：</strong> Gemini 实时扮演 10 个独立性格的 Bot (Whale/Degen/Farmer/PaperHand)。</li>
                    <li><strong className="text-purple-400">串行博弈：</strong> 每一天系统获取所有 Bot 的决策后，<strong className="text-white">随机打乱执行顺序</strong>。</li>
                    <li><strong className="text-pink-400">价格冲击：</strong> 每个 Bot 的卖出操作都会实时拉低 AMM 价格，后行动的 Bot 卖出价格更低，模拟真实挤兑。</li>
                    <li><strong className="text-yellow-400">自私理性：</strong> Bot 会根据当前 MEME 价格、奖池稀释程度和自身资金，倒推是否值得制作装备和开箱。</li>
                </ul>
            </div>

        </div>
      </div>
    </div>
  );
}