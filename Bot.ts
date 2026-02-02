import { GoogleGenAI, Type } from "@google/genai";
import { BotState, CONFIG } from "./types";

// 机器人决策接口 (每个机器人的具体行动)
export interface BotAction {
  botId: number;
  craftCount: number;      // 制作多少装备 (消耗 LvMON -> 获得 Wealth + Chests)
  openChests: number;      // 开多少箱子 (消耗 LvMON -> 获得 Medals)
  investMedals: boolean;   // 是否将所有勋章投入奖池 (通常为 true，为了赚钱)
  stakeMemePercent: number; // 0.0 - 1.0: 现有流动 MEME 的百分之多少拿去质押
  unstakeMemePercent: number; // 0.0 - 1.0: 已质押 MEME 的百分之多少赎回
  sellMemePercent: number;  // 0.0 - 1.0: 流动 MEME (含赎回的) 卖出多少换回 LvMON
  rationale: string;       // 简短决策理由
}

export interface MarketContext {
  day: number;
  price: number;
  apy: number;
  totalMedalsInPool: number; // 昨天的/预测的奖池大小，用于计算稀释
  priceTrend: string;
}

export class BotManager {
  private ai: GoogleGenAI;
  
  // Rate Limiting
  private lastCallTime: number = 0;
  private readonly MIN_CALL_INTERVAL = 5000; 
  public apiCallCount: number = 0;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  // 生成初始化的机器人列表
  generateInitialBots(): BotState[] {
    const personalities = ['Whale', 'Degen', 'Farmer', 'PaperHand', 'DiamondHand'] as const;
    const bots: BotState[] = [];
    
    for (let i = 0; i < 10; i++) {
      const type = personalities[i % personalities.length];
      let initialLvMON = 0;
      const initialMeme = 0; // 强制所有 Bot 初始 MEME 为 0

      // 根据人设初始化资产 (随机化)
      if (type === 'Whale') { 
        // 巨鲸：80,000 - 150,000 LvMON
        initialLvMON = Math.floor(Math.random() * 70000) + 80000; 
      } else if (type === 'Degen') { 
        // 赌徒：1,000 - 8,000 LvMON
        initialLvMON = Math.floor(Math.random() * 7000) + 1000; 
      } else if (type === 'Farmer') { 
        // 打金者：15,000 - 30,000 LvMON
        initialLvMON = Math.floor(Math.random() * 15000) + 15000; 
      } else {
        // 其他：5,000 - 20,000 LvMON
        initialLvMON = Math.floor(Math.random() * 15000) + 5000;
      }

      bots.push({
        id: i,
        name: `Bot-${i+1} [${type}]`,
        personality: type,
        lvMON: initialLvMON,
        meme: initialMeme,
        stakedMeme: 0,
        medals: 0,
        wealth: 0,
        chests: 0,
        equipmentCount: 0,
        investedMedals: 0 // Init invested medals
      });
    }
    return bots;
  }

  private checkRateLimit(): { allowed: boolean; waitTime: number } {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.MIN_CALL_INTERVAL) {
      return { allowed: false, waitTime: this.MIN_CALL_INTERVAL - elapsed };
    }
    return { allowed: true, waitTime: 0 };
  }

  async getPlayersDecisions(
    context: MarketContext, 
    bots: BotState[]
  ): Promise<{ 
    actions: BotAction[], 
    analysis: string,
    reason: 'Success' | 'RateLimit' | 'Quota' | 'Error'
  }> {
    
    // 1. Check Rate Limit
    const { allowed, waitTime } = this.checkRateLimit();
    if (!allowed) {
        return { actions: [], analysis: `⏳ API 冷却中...`, reason: 'RateLimit' };
    }

    try {
      this.lastCallTime = Date.now();
      this.apiCallCount++;

      // 2. Build Contextual Prompt
      // 精简 Bot 状态以减少 Token 消耗
      const botsSummary = bots.map(b => 
        `ID:${b.id} Type:${b.personality} LvMON:${Math.floor(b.lvMON)} MEME:${Math.floor(b.meme)} Staked:${Math.floor(b.stakedMeme)} Chests:${b.chests}`
      ).join('\n');

      const prompt = `
        你是一个 MMORPG 经济系统的核心模拟引擎。你需要分别控制 10 个具有不同性格和资产状况的玩家。
        
        **目标**：每个玩家都是**自私**的，他们的终极目标是**最大化手中的 LvMON (法币)**。
        
        **经济参数**：
        1. **制作装备**：消耗 ${CONFIG.CRAFT_COST} LvMON -> 获得装备 + 少量宝箱。
        2. **开宝箱**：消耗 ${CONFIG.CHEST_OPEN_COST} LvMON -> 获得勋章 (Medals)。
        3. **挖矿 (Invest)**：投入勋章 -> 瓜分每日 ${CONFIG.DAILY_MEME_REWARD} MEME 奖池。
           * 收益公式：(我的勋章 / 全服总勋章) * 100万 * 当前MEME价格。
           * 如果全服勋章太多(Dilution)，回本周期会变长，玩家可能会停止投入。
        4. **质押 (Stake)**：质押 MEME -> 获得系统回购的 MEME 分红 (APY: ${context.apy.toFixed(1)}%)。
        5. **交易**：高价卖出 MEME 换回 LvMON 才是落袋为安。

        **当前市场**：
        - Day: ${context.day}
        - MEME Price: ${context.price.toFixed(4)} LvMON
        - Price Trend: ${context.priceTrend}
        - Estimated Total Medals in Pool: ${context.totalMedalsInPool} (用于计算稀释)

        **玩家列表 (现有资产)**：
        ${botsSummary}

        **性格指南**：
        - **Whale**: 资金雄厚，喜欢通过质押控制市场，价格高时会分批出货。
        - **Degen**: 赌徒，喜欢梭哈开箱子挖矿，不爱持有 LvMON，拿到 MEME 就卖或者全质押。
        - **Farmer**: 精打细算，只有当挖矿收益 > 成本时才制作/开箱，否则只卖 MEME。
        - **PaperHand**: 价格一下跌就恐慌抛售 (Sell 100%)。
        - **DiamondHand**: 无论涨跌都囤积 MEME (Stake 100%)。

        请为这 10 个玩家分别制定今天的操作策略。
      `;

      // 3. Call Gemini
      const result = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: "You are a selfish, profit-driven economic simulator. Return JSON only.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              marketAnalysis: { type: Type.STRING, description: "One sentence summary of the market sentiment." },
              actions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    botId: { type: Type.INTEGER },
                    craftCount: { type: Type.INTEGER, description: "How many equipments to craft" },
                    openChests: { type: Type.INTEGER, description: "How many chests to open" },
                    investMedals: { type: Type.BOOLEAN },
                    stakeMemePercent: { type: Type.NUMBER, description: "0.0 to 1.0" },
                    unstakeMemePercent: { type: Type.NUMBER, description: "0.0 to 1.0" },
                    sellMemePercent: { type: Type.NUMBER, description: "0.0 to 1.0" },
                    rationale: { type: Type.STRING }
                  },
                  required: ["botId", "craftCount", "openChests", "stakeMemePercent", "unstakeMemePercent", "sellMemePercent"]
                }
              }
            },
            required: ["actions", "marketAnalysis"]
          }
        }
      });

      const response = JSON.parse(result.text || "{}");
      return { 
        actions: response.actions || [], 
        analysis: response.marketAnalysis || "No analysis", 
        reason: 'Success' 
      };

    } catch (error: any) {
      console.error("AI Decision Error:", error);
      const isQuota = error.toString().includes("429") || error.toString().includes("RESOURCE_EXHAUSTED");
      return { actions: [], analysis: isQuota ? "Quota Exceeded" : "Error", reason: isQuota ? 'Quota' : 'Error' };
    }
  }
}