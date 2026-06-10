# 番种计分 + 多局连战设计

Date: 2026-06-10

## 背景与目标

回合引擎已支持完整对局（抓/吃/碰/杠/胡、玩家认领、流局、抢杠/杠上花），结局横幅能明牌并显示主牌型名，但**胡了不知道值多少分**，且每局孤立、没有连续对局的积分积累。本设计补上：

1. **经典长沙计分**：小胡 1 分、大胡 6 分起多番翻倍叠加。
2. **无限连战**：四家积分跨局累计，胡者做庄、流局连庄，随时可重新开桌清零。

保持项目约束：原生 ESM、零依赖、不可变状态、核心逻辑纯函数可测（node:test）、TDD。

## 已确认决策

| 决策点 | 选择 |
| --- | --- |
| 计分制式 | 经典长沙：小胡 1 分 / 大胡 6×2^(n-1) 分（n=大胡个数，叠加翻倍） |
| 付分方式 | 点炮/抢杠 → 放炮者（被抢杠者）单付；自摸 → 三家各付；流局 0 分 |
| 连战形态 | 无限连战 + 累计积分；「下一局」继续、「重新开桌」清零 |
| 庄家规则 | 胡者做庄、流局连庄；庄家首发 14 张并先手 |
| 架构 | 方案 A：独立牌桌层（match）+ 纯计分模块，单局引擎最小侵入 |

## 番种与计分规则

**大胡**（每个 6 分起，可叠加）：

| 番种 | 判定 |
| --- | --- |
| 清一色 | 全部牌（暗手+副露）同一花色 |
| 碰碰胡 | 无顺子（暗手全刻+一对，副露无 chi） |
| 将将胡 | 全部牌（暗手+副露）rank ∈ {2,5,8} |
| 杠上花 | ctx.afterKong && selfDraw |
| 抢杠胡 | ctx.robKong |
| 海底捞月 | ctx.haidi：摸牌墙最后一张自摸胡 |

**小胡**：平胡（未命中任何大胡的胡牌）。

补充约定：
- **自摸不是番种**，只决定付分方式（三家各付）。
- 起手无将路线的胡按同样规则归类（将将胡天然满足将牌要求，无冲突）。
- 分数：小胡 total=1；大胡 total = 6 × 2^(n-1)。例：清一色+碰碰胡=12。
- payments 总和恒为 0（赢家 +、付家 −）。
- **本期不做**：杠的即时分（放杠/暗杠分）、点炮型海底（海底炮）、AI 按分数调整策略——列入后续扩展。

## 模块设计

### patterns.js（升级）

- 新增 `identifyPatterns(concealed, melds, winningTile, ctx)` → `string[]`：返回全部命中的**大胡**名（可为空数组）。ctx = `{ selfDraw?, afterKong?, robKong?, haidi? }`。
- 原 `identifyPattern`（单主名，含 自摸/平胡 兜底）保留，内部可基于 `identifyPatterns` 实现，展示主名时大胡用顿号连接。

### scoring.js（新，纯函数）

```js
scoreWin({ bigPatterns, winType, winner, loser })
// → { category: '大胡'|'小胡', base, multiplier, total, payments: [{ seat, delta }] }
```
- bigPatterns 为空 → 小胡 total=1；非空 → 大胡 total=6×2^(n-1)。
- winType 'discard'/'rob-kong' → loser 单付；'self-draw' → 其余三家各付 total。

### match.js（新，纯函数）

```js
createMatch() // → { scores:[0,0,0,0], handIndex:0, dealerSeat:0 }
settleHand(match, game)
// → { match: { scores 更新, handIndex+1, dealerSeat: 胡者 | 流局原庄 }, settlement: scoring 结果 | null }
```

### game-state.js（微调）

- `createInitialGame({ seed, dealerSeat = 0 })`：14 张发给 dealerSeat，其余各 13 张；`currentPlayer = dealerSeat`。默认值保持旧行为。

### turn-engine.js（微调）

- 自摸分支 ctx 增加 `haidi: game.wall.length === 0`。
- 用 `identifyPatterns` 组装 result：`result.patterns: string[]`（大胡列表），`result.pattern`（主名字符串）保留兼容。

### main.js / UI

- main.js 持 `match` 状态：局结束（onUpdate 检测 hand-over）即 `settleHand` 并保存 settlement 供横幅显示；「下一局」按 `match.dealerSeat` 开新局（积分保留）；「重新开桌」= `createMatch()` + 新局。
- **积分条**：center-area 顶部显示四家 名字+累计分，庄家带「庄」徽标，显示「第 N 局」。
- **结算横幅**：明牌之上加番种与分数行（「清一色 × 碰碰胡 → 12 分」/「平胡 · 1 分」）+ 四家分数变动；按钮「下一局」+「重新开桌」。
- 复盘/建议面板不变。

## 错误处理

- 流局：settlement 为 null，积分不变、连庄。
- 海底判定只在自摸分支生效；点炮时不判海底。
- match 不可变：settleHand 返回新对象，main.js 持引用替换。

## 测试策略（node:test，TDD）

- `patterns.test`：多大胡叠加（清一色+碰碰胡）、将将胡、haidi ctx、无大胡 → 空数组；identifyPattern 兼容不破。
- `scoring.test`：小胡点炮/自摸、单大胡 6 分、双大胡 12 分、抢杠付分方、payments 和为 0。
- `match.test`：积分累计、胡者做庄、流局连庄、handIndex 递增、不可变。
- `game-state.test`：dealerSeat=2 时该座 14 张/先手；默认行为不变。
- `turn-engine.test`：海底自摸 result.patterns 含海底捞月（零延迟脚本 agent）。
- UI：node DOM 桩烟测 + 浏览器预览验收。

## 后续扩展（不在本期）

- 杠的即时分、海底炮、定局数对局制、AI 按分差调整攻防、积分持久化（localStorage）。
