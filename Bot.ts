import { GoogleGenAI, Type } from "@google/genai";

// 机器人性格定义
export type BotPersonality = 'Conservative' | 'Aggressive';

// 机器人决策结果接口
export interface BotDecision {
  activityMultiplier: number; // 0-3: 活跃度倍率 (影响新财富创造)
  stakeRatio: number;         // -1.0 to 1.0: 质押/解质押比例 (负数解质押，正数质押)
  sellRatio: number;          // 0-1: 卖出 MEME 的比例
}

// 市场上下文
export interface MarketContext {
  day: number;
  price: number;
  apy: number;
  priceTrend: 'Up' | 'Down' | 'Stable';
  consecutiveGreenDays: number;
  liquidityHealth: number; // 0-1, MEME ratio in LP
}

// 机器人个体类
export class Bot {
  id: number;
  personality: BotPersonality;
  history: BotDecision[];

  constructor(id: number, personality: BotPersonality) {
    this.id = id;
    this.personality = personality;
    this.history = [];
  }

  // 基于群体策略做出个体决策
  decide(groupStrategy: BotDecision, volatility: number): BotDecision {
    // 引入个体随机性 (高斯分布模拟)
    const randomize = (val: number, vol: number) => {
      const u = 1 - Math.random();
      const v = Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      return val + z * vol; // Mean + Z * StdDev
    };

    const decision: BotDecision = {
      activityMultiplier: Math.max(0, randomize(groupStrategy.activityMultiplier, volatility * 0.5)),
      stakeRatio: Math.max(-1, Math.min(1, randomize(groupStrategy.stakeRatio, volatility * 0.2))),
      sellRatio: Math.max(0, Math.min(1, randomize(groupStrategy.sellRatio, volatility * 0.2))),
    };

    this.history.push(decision);
    // 只保留最近 7 天记录
    if (this.history.length > 7) this.history.shift();
    
    return decision;
  }
}

// AI 响应的 Schema
interface AiStrategyResponse {
  conservative: BotDecision;
  aggressive: BotDecision;
  marketAnalysis: string; // 让 AI 简单解释原因
}

export class BotManager {
  private ai: GoogleGenAI;
  private bots: Bot[];

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.bots = [];
    this.initBots();
  }

  // 初始化 100 个机器人 (50 保守, 50 激进)
  private initBots() {
    for (let i = 0; i < 50; i++) {
      this.bots.push(new Bot(i, 'Conservative'));
    }
    for (let i = 50; i < 100; i++) {
      this.bots.push(new Bot(i, 'Aggressive'));
    }
  }

  getBots() {
    return this.bots;
  }

  // 调用 LLM 获取群体策略
  async getSwarmDecisions(context: MarketContext): Promise<{ decisions: Map<number, BotDecision>, analysis: string }> {
    try {
      // 构建 Prompt
      const prompt = `
        你是一个 MMORPG 经济系统的 AI 模拟器，负责控制 100 个机器人玩家的决策。
        
        当前市场数据:
        - 天数: Day ${context.day}
        - MEME 价格: ${context.price.toFixed(4)} LvMON
        - 质押 APY: ${context.apy.toFixed(2)}%
        - 价格趋势: ${context.priceTrend} (连续上涨 ${context.consecutiveGreenDays} 天)
        - 流动性池 MEME 占比: ${(context.liquidityHealth * 100).toFixed(1)}% (>60% 意味着抛压重)

        你需要为两类玩家制定**平均策略**：
        1. **保守型 (Conservative)**: 风险厌恶，喜欢落袋为安，高 APY 时才质押，价格暴涨时止盈。
        2. **激进型 (Aggressive)**: 风险偏好，喜欢复投和制作装备，追涨杀跌，容易 FOMO。

        请输出 JSON 格式，定义两类群体的行为均值：
        - activityMultiplier: 0.0 (休眠) 到 3.0 (极度活跃/FOMO)
        - stakeRatio: -1.0 (全部解质押) 到 1.0 (全部收益复投+追加本金)。0 表示不动。
        - sellRatio: 0.0 (不卖) 到 1.0 (清空流动资产)。
      `;

      const result = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: "You are an expert game economist engine. Respond ONLY in JSON.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              conservative: {
                type: Type.OBJECT,
                properties: {
                  activityMultiplier: { type: Type.NUMBER },
                  stakeRatio: { type: Type.NUMBER },
                  sellRatio: { type: Type.NUMBER },
                },
                required: ["activityMultiplier", "stakeRatio", "sellRatio"]
              },
              aggressive: {
                type: Type.OBJECT,
                properties: {
                  activityMultiplier: { type: Type.NUMBER },
                  stakeRatio: { type: Type.NUMBER },
                  sellRatio: { type: Type.NUMBER },
                },
                required: ["activityMultiplier", "stakeRatio", "sellRatio"]
              },
              marketAnalysis: { type: Type.STRING }
            },
            required: ["conservative", "aggressive", "marketAnalysis"]
          }
        }
      });

      const responseText = result.text;
      if (!responseText) throw new Error("Empty response from AI");
      
      const strategy: AiStrategyResponse = JSON.parse(responseText);

      // 为每个 Bot 生成独立决策
      const decisions = new Map<number, BotDecision>();
      
      this.bots.forEach(bot => {
        const groupStrategy = bot.personality === 'Conservative' ? strategy.conservative : strategy.aggressive;
        // 激进型玩家波动性更大 (0.3 vs 0.1)
        const volatility = bot.personality === 'Conservative' ? 0.1 : 0.3;
        decisions.set(bot.id, bot.decide(groupStrategy, volatility));
      });

      return { decisions, analysis: strategy.marketAnalysis };

    } catch (error) {
      console.error("AI Decision Failed, falling back to algorithm:", error);
      // Fallback: 返回空 Map，外部逻辑会处理
      return { decisions: new Map(), analysis: "AI Offline: Using Algorithmic Fallback" };
    }
  }
}