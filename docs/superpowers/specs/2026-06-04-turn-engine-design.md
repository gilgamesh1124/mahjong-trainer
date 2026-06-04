# 逐方出牌过程 / 回合引擎设计

Date: 2026-06-04

## 背景与目标

当前游戏循环（[src/main.js](../../../src/main.js)）里，电脑是**瞬间**完成"摸一张、打第一张"，三家在玩家一次点击内同步走完，没有任何碰/吃/杠/胡的判定与认领逻辑——`player.melds` 只是空占位。

本设计要把游戏改造成可观看的、带真实动作的对局：

- **逐方按 ~1 秒节奏轮流**，能看到每一步过程。
- 加入完整动作集合：**抓牌、吃（仅上家）、碰（任意家）、杠（明杠/暗杠/补杠）、胡（点炮/自摸）、出牌**。
- **玩家也参与认领**：别家打出可碰/杠/吃/胡的牌时，弹出认领按钮（无限等待 + 「过」）。
- 电脑决策**兼顾牌效与安全度**（进张 + 放炮风险）。
- 胡牌**判定 + 宣布谁胡/胡哪张/方式/牌型名 + 结束本局**；空牌墙流局。**不计番分**。

保持项目约束：原生 ES Modules、零依赖、无构建工具、不可变状态、测试先行（node:test）。

## 关键决策（已与用户确认）

| 决策点 | 选择 |
| --- | --- |
| 玩家是否参与认领 | 是，玩家可碰/杠/吃/胡 |
| 是否含吃 | 含吃，仅上家打出可吃 |
| 电脑智能 | 牌效（shanten/ukeire）+ 安全度（放炮风险）综合 |
| 胡牌结算深度 | 判定 + 宣布胡牌 + 牌型名，结束本局；不计番分 |
| 认领节奏 | 无限等待 + 「过」按钮；电脑动作 ~1 秒 |
| 认领优先级 | 胡 > 碰/杠 > 吃（仅下家）；多家胡取最近 |

## 既有 bug 修正

座位标签为 `['玩家'(0),'上家'(1),'对家'(2),'下家'(3)]`，但出牌顺序是 `0→1→2→3`，与"上家应在你之前、下家在你之后"矛盾。本次重做回合流程时修正为逆时针 **0→下家(3)→对家(2)→上家(1)→0**，即 `next = (cur + 3) % 4`。

## 架构（方案 A：智能体驱动的异步回合引擎）

分层，纯逻辑与异步编排解耦，可注入 `delay`/`agents`/`signal` 以便测试。

### 模块划分

```
src/core/
  rules.js        (扩展) isWinningHandWithMelds(concealed, meldCount)，复用现有回溯
  melds.js        (新) 纯函数：canPong / canChi(返回所有顺子组合) / canKong(明/暗/补)
                       / canWinOnTile / canSelfDrawWin（均含已副露 melds）
  patterns.js     (新) 纯函数：identifyPattern(...) → 牌型名
  claims.js       (新) 纯函数：claimOptionsFor(seat, ...) + resolveClaims(intents) 优先级裁决
  ai.js           (新) decideDiscard（牌效+危险度）/ decideClaim / tileDanger
  turn-engine.js  (新) async runHand(game, agents, { delay, onUpdate, signal }) 回合循环
  game-state.js   (扩展) 副露迁移 + lastDiscard + 结局态
  recommendation.js / review.js (沿用；AI 与玩家建议复用 recommendDiscards)
src/ui/
  render.js   (重构) 桌面 + 手牌 + 副露 + 建议
  overlays.js (新) 动作浮标 / 认领按钮 / 结局横幅
src/main.js   (重写编排) 引擎 + 人类 agent(Promise 桥) + 按状态渲染
```

### 状态结构（game-state 扩展）

仍然不可变、每步返回新对象并追加 `history`（保留未来回放能力）。

- `player.melds[]`：`{ type:'pong'|'chi'|'kong'|'concealed-kong'|'added-kong', tiles:[...], from: seat|null }`
- `game.lastDiscard`：`{ seat, tile } | null`，当前可被认领的牌。
- `game.lastDraw`：`{ seat, tile, afterKong:boolean }`，用于杠上花判定与摸牌高亮。
- `game.phase`：`'awaiting-discard' | 'awaiting-claim' | 'hand-over'`。
- `game.result`：`null | { type:'win'|'draw', winner, loser|null, tile, winType:'self-draw'|'discard'|'rob-kong', afterKong, pattern }`。

新增不可变迁移（均返回新 state）：

- `applyDiscard(game, seat, tile)`：移出手牌、入弃牌堆、设 `lastDiscard`、`phase='awaiting-claim'`。
- `applyPong(game, claimer, tile, fromSeat)` / `applyChi(game, claimer, seqTiles, fromSeat)`：从手牌移出对应牌、加副露、**把被认领的牌从 fromSeat 弃牌堆移除**、`currentPlayer=claimer`、`phase='awaiting-discard'`、清空 `lastDiscard`。
- `applyKong(game, claimer, tile, fromSeat, kind)`：明杠移 3 / 暗杠移 4 / 补杠升级已有碰并移 1；随后摸补牌（简化：从牌墙正面）。
- `applyWin(game, winner, { winType, tile, loser, afterKong, pattern })`：写 `result`、`phase='hand-over'`。
- `markDraw(game)`：牌墙空 → 流局（`result.type='draw'`、`phase='hand-over'`）。

### 引擎流程（turn-engine.js）

`runHand(initialGame, agents, { delay, onUpdate, signal })` 异步循环，直到 `phase==='hand-over'`：

1. 轮到 `seat`：若需摸牌则摸（庄家首手已 14 张，跳过该摸牌）。
2. 行动者先看**自摸胡 / 暗杠 / 补杠**选项 → `agent.chooseAction(view)` 返回 `{action:'discard', tile}` | `{action:'self-kong', ...}` | `{action:'win'}`。
3. 打牌后开**认领窗口**：对其余三家计算 `claimOptionsFor`，`agent.chooseClaim(view, options)` 收集意图；`resolveClaims(intents)` 按优先级裁决。
4. 认领者执行：碰/吃 → 接着由其打牌；杠 → 摸补牌（可能杠上花）；胡 → `applyWin`。无人认领 → 打牌者下家摸牌。补杠时其余家可胡 → 抢杠（rob-kong）。
5. 每步后 `onUpdate(game)` 重渲染；电脑步进 `await delay(~1000)`，人类步即时（已等过输入）。`signal`（AbortController）中止——"新开一局"时取消当前 run。

非己回合不阻塞：电脑 agent 内部 `await delay`。认领窗口对电脑用单一 ~1 秒窗口（不叠加三次），人类有选项时无限等待。

### 认领裁决（claims.js，纯函数，重点测试）

- `claimOptionsFor(seat, hand, melds, tile, isDiscarderUpperOfSeat)` → 该座位可选动作集合（吃仅当 seat 是打牌者下家）。
- `resolveClaims(intents)` → 唯一赢家或无：**胡 > 碰/杠 > 吃**；多家胡按离打牌者最近（逆时针距离）裁决。

### 人机桥（main.js）

- **人类 agent**：`chooseAction` 返回 Promise——点手牌牌 = 打出；可自摸/暗杠/补杠时同时显示按钮。`chooseClaim(view, options)` 有选项时显示 `碰/杠/吃/胡/过` 按钮（吃多组逐组列出），Promise 在点击时兑现；无选项即时 `过`。
- **电脑 agent**：调用 ai.js 决策后 `await delay(1000)`。
- main.js 持 `pendingResolve`，把 DOM 点击兑现给当前等待的 Promise；按 `phase` 决定显示哪种控件。

## AI（ai.js）

- **`tileDanger(tile, game, mySeat)` → 0..1**（简化启发式，代码注释说明）：现物（已在某对手弃牌中出现）对该家 0 危险；对手副露/弃牌集中某花色则该花色危险升高；中张(4–6)比幺九危险；取对三家危险的最大值。
- **`decideDiscard(game, seat)`**：候选 = `uniqueTiles(hand)`；每张 `score = 进张得分(复用 recommendDiscards 的 shanten/ukeire) − 危险权重·danger`；权重随局势调节（离听牌远偏牌效，有对手疑似听牌/多副露偏安全）；取最高分。
- **`decideClaim(game, seat, options)`**：胡→取；碰/杠→仅当降向听或达/保听、且认领后要打的牌不太危险才取，杠更保守；吃→仅当明显降向听；否则过。

## 牌型识别（patterns.js，纯函数）

`identifyPattern(concealed, melds, winningTile, ctx)` 按优先级返回主牌型名：
**抢杠胡 / 杠上花（由 ctx）> 清一色（全同花色）> 碰碰胡（无顺子）> 自摸 > 平胡**。
胡的方式（自摸/点炮）由 `result.winType` 单独显示。

## UI（render.js 重构 + overlays.js）

- **回合高亮**：当前座位/手牌加 `is-active`。
- **副露区**：各家 `melds` 用小号 SVG 牌面正面展示（碰/杠/吃）；玩家副露置于手牌左侧。
- **动作浮标**：行动后在对应座位弹出 `碰!/杠!/吃!/胡!/摸/自摸` 短暂淡出（读最新 history 动作）。
- **认领控件**：玩家可认领时在手牌上方显示 `碰/杠/吃/胡/过`（吃多组逐组）；自己回合可自摸/暗杠/补杠时同样给按钮。
- **结局横幅**：覆盖层显示 谁胡·胡哪张·方式·牌型名，或 `流局`，含「新开一局」。
- **建议面板**：保留打牌推荐（仅玩家出牌回合有意义），非己回合显示「等待 X…」。

## 错误处理

- 牌墙空 → 流局。
- 非法认领/越界动作防御性忽略；越回合受 phase 守卫。
- agent 返回非法动作 → 兜底（电脑改打最安全牌；人类忽略直至合法）。
- "新开一局" 通过 AbortController 取消当前 run，避免旧循环继续 onUpdate。

## 测试策略（node:test，测试先行）

- `melds.test`：碰/吃/各类杠/含副露的胡 判定。
- `patterns.test`：清一色/碰碰胡/杠上花/抢杠胡/平胡。
- `claims.test`：`resolveClaims` 优先级、最近座位平手、吃仅下家。
- `game-state.test`（扩展）：各副露迁移的手牌/副露/turn/lastDiscard 正确性与不可变。
- `ai.test`：避免明显放炮（偏现物）、能胡则胡、拒绝无益碰。
- `turn-engine.test`：注入**零延迟 + 脚本化 agent + 固定种子**，跑完整局到达预期胡牌与牌型；碰正确插队；空墙流局；`AbortController` 中止循环。

## 简化取舍（明确范围）

- 杠的补牌从牌墙正面摸（非杠尾），训练用途足够。
- 一炮多响只取最近一家（单一赢家）。
- 不算番/分；**认领建议**、定缺/花猪等长沙细则留后续。
- 玩家为庄家（首发 14 张），座位顺序按修正后的逆时针。

## 开放扩展点（不在本期）

- 认领时的训练建议（该不该碰/吃/杠）。
- 长沙番种与计分、特殊牌型。
- 限时认领窗口模式。
- 从种子回放整局。
