# 融合：把"操作层"独有功能移植到回合引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。每个任务两道评审。Steps 用 `- [ ]`。

**Goal:** 以 `feature/turn-engine`（异步回合引擎，~1秒逐方、玩家认领、安全度AI、抢杠/杠上花/流局、桌面UI）为底座，把远端 `origin/main`"操作层"线独有的 4 块移植上来：①长沙将牌规则(2/5/8)+起手无将；②认领建议(recommendOperation)；③操作复盘；④副露感知的玩家建议。产出集两者之长的单一版本，并更新 PR `feature/turn-engine`。

**Architecture:** 统一 `rules.js` 的 meld-aware + jiang-aware API，把 `requireJiangPair` 贯穿胜负判定链（rules→melds→claims→turn-engine→ai/recommendation/operation-advice）；玩家在认领窗口时计算并展示认领建议、记录操作复盘。所有改动保持不可变状态、零依赖、`node --test`。

**Tech Stack:** 原生 JS ESM，node:test，浏览器直接运行。

## 源码参照（两版都在 git 里，移植时直接读）

- 我的底座（当前分支 `feature/turn-engine`）：`src/core/{rules,melds,claims,turn-engine,ai,recommendation,review,game-state}.js`、`src/ui/{render,overlays}.js`、`src/main.js`。
- 远端"操作层"（`origin/main`，用 `git show origin/main:<path>` 读）：`src/core/{rules,operation-advice,computer-strategy,review,game-state,recommendation}.js`、`src/ui/render.js`、`src/main.js`。计划文档在 `origin/main:docs/superpowers/plans/2026-06-04-*.md`。

## 关键设计决策（统一 API）

1. **rules.js 统一签名**（合并我的 `meldCount` 与远端的 `{requireJiangPair}`）：
   - `isWinningTiles(concealed, meldCount = 0, { requireJiangPair = false } = {})` —— requireJiangPair 时，所选**对子(将)必须是 2/5/8**。
   - `shantenWithMelds(hand, meldCount = 0, { requireJiangPair = false } = {})`；`shantenNumber(hand)` 仍 = `shantenWithMelds(hand,0)`。
   - `calcUkeire(hand13, visibleCounts, meldCount = 0, { requireJiangPair = false } = {})`。
   - 新增 `isJiangTile(tile)`、`hasJiangTile(tiles)`。jiang 约束逻辑**照搬** `origin/main:src/core/rules.js`（`isWinningHandWithOptions` 的 pair 守卫 + `shantenNumber` 的 `isJiangIndex` 守卫），移植到我的 `isWinningTiles`/`shantenWithMelds` 上。
2. **将牌门槛**：`game.players[i].flags = { initialNoJiang }`（发牌后按起手是否含 2/5/8 计算）；`shouldRequireJiangPair(player) = !player.flags.initialNoJiang`。
3. **胜负判定链都吃 jiang**：`canWinOnTile(hand, melds, tile, { requireJiangPair })`、`canSelfDrawWin(hand, melds, { requireJiangPair })`、`claimOptionsFor(seat, player, tile, discarderSeat, { requireJiangPair })`；turn-engine 在判定某座位能否胡/自摸/抢杠时传 `shouldRequireJiangPair(该座位)`。
4. **认领建议**：把远端 `operation-advice.js` 改造成**纯函数**，输入我的认领模型：`recommendOperation({ player, options, discardedTile, visibleTiles, requireJiangPair })`，`options` 为我的 `claimOptionsFor` 结果（type ∈ win/kong/pong/chi）。内部映射 win→胡/kong→杠/pong→碰/chi→吃，复用远端打分(含暴露惩罚)与中文解释，但调用统一后的 `shantenWithMelds`/`calcUkeire`。输出 `{ best, choices, id, ruleNote }`，每个 choice 保留**我的 type**以便高亮对应按钮。
5. **操作复盘**：直接采用 `origin/main:src/core/review.js`（它是我 review 的超集：含 `recordOperationDecision`/`summarizeOperationReview`）。
6. **不移植** `computer-strategy.js`（我的 `ai.decideDiscard` 已覆盖且更强）；改为给 `ai.js` 加 jiang 感知。

---

## Task 1: rules.js 统一 meld + jiang

**Files:** Modify `src/core/rules.js`; Test `tests/rules.test.mjs`

- [ ] **Step 1（红）** 在 `tests/rules.test.mjs` 追加 jiang 测试（参照 `git show origin/main:tests/rules.test.mjs` 里的 jiang 用例，改用统一签名）：
  - `isWinningTiles` 在 `{requireJiangPair:true}` 下：将为非 2/5/8 的胡牌被拒、为 2/5/8 的被接受。
  - `shantenWithMelds(hand, 0, {requireJiangPair:true})` 对"只差非将对子"的听牌返回 ≥0（不算听）。
  - `isJiangTile`/`hasJiangTile` 基本用例。
  - 保留全部既有 meldCount 测试。
- [ ] **Step 2** `node --test tests/rules.test.mjs` → 红。
- [ ] **Step 3（绿）** 在 `src/core/rules.js`：
  - 加 `export function isJiangTile(t){ return t.rank===2||t.rank===5||t.rank===8; }` 和 `hasJiangTile(tiles)`。
  - `isWinningTiles` 第三参 `{requireJiangPair=false}={}`；在 pair 候选循环里，`requireJiangPair && !isJiangTile(parseKey(key))` 时 `continue`。
  - `shantenWithMelds` 第三参 `{requireJiangPair=false}={}`；pair 提取分支加 `if (requireJiangPair && !isJiangIndex(i)) continue;`（`isJiangIndex(i)= (i%9)===1||4||7`）。把该 options 透传给两处 `shantenMelds` 调用不需要——jiang 只约束 pair 提取。**移植时对照 `git show origin/main:src/core/rules.js` 的等价实现确保行为一致。**
  - `calcUkeire` 第四参 `{requireJiangPair=false}={}`，透传给内部 `shantenWithMelds`。
  - 保持所有旧调用（2/3 参）行为不变。
- [ ] **Step 4** `npm test` → 绿（既有 72 + 新 jiang）。
- [ ] **Step 5** commit：`rules: unify meld-aware and jiang-pair (2/5/8) options`

## Task 2: game-state 将牌门槛标记

**Files:** Modify `src/core/game-state.js`; Test `tests/game-state.test.mjs`

- [ ] **Step 1（红）** 测试：`createInitialGame` 后每个 player 有 `flags.initialNoJiang`（布尔）；用受控手牌（全非 2/5/8）验证 `initialNoJiang===true`；`shouldRequireJiangPair(player)===!initialNoJiang`；`clonePlayers` 保留 flags（任一 apply* 迁移后 flags 仍在）。
- [ ] **Step 2** 红。
- [ ] **Step 3（绿）** `createPlayer` 增加 `flags`；`createInitialGame` 发牌后对每家算 `flags:{ initialNoJiang: !hasJiangTile(hand) }`（import `hasJiangTile`）；`clonePlayers` 复制 `flags`；导出 `shouldRequireJiangPair(player){ return !player.flags?.initialNoJiang; }`。参照 `git show origin/main:src/core/game-state.js`。
- [ ] **Step 4** `npm test` → 绿。
- [ ] **Step 5** commit：`game-state: per-player initialNoJiang flag + shouldRequireJiangPair`

## Task 3: 胜负判定链贯穿 requireJiangPair

**Files:** Modify `src/core/melds.js`, `src/core/claims.js`, `src/core/turn-engine.js`; Tests `tests/melds.test.mjs`, `tests/claims.test.mjs`, `tests/turn-engine.test.mjs`

- [ ] **Step 1（红）** 
  - melds：`canWinOnTile(hand, melds, tile, {requireJiangPair})` / `canSelfDrawWin(hand, melds, {requireJiangPair})`——加测试：非将对子的胡在 requireJiangPair 下为 false，默认仍 true。
  - claims：`claimOptionsFor(seat, player, tile, discarderSeat, {requireJiangPair})` 把 jiang 传给 canWinOnTile——加测试：requireJiangPair 下不出现非法的 win 选项。
  - turn-engine：加一个测试，构造"非将听牌"在普通门槛下点炮**不能**胡（不产生 win），起手无将门槛下可胡。
- [ ] **Step 2** 红。
- [ ] **Step 3（绿）** 
  - melds：两函数加可选 options，透传给 `isWinningTiles`（默认 `{}` 保持旧行为）。
  - claims：`claimOptionsFor` 加可选 options，`canWinOnTile(...,options)`。
  - turn-engine：在算认领选项与自摸/抢杠胜负时，传 `{ requireJiangPair: shouldRequireJiangPair(game.players[该座位]) }`（import `shouldRequireJiangPair`）。涉及：claim 窗口的 `claimOptionsFor`、`action.type==='self-win'` 的判定来源、`findRobKong` 的 `canWinOnTile`、discard-win 分支。
- [ ] **Step 4** `npm test` → 绿。
- [ ] **Step 5** commit：`engine: thread requireJiangPair through win detection`

## Task 4: recommendation + ai 吃 jiang/副露

**Files:** Modify `src/core/recommendation.js`, `src/core/ai.js`; Tests `tests/recommendation.test.mjs`, `tests/ai.test.mjs`

- [ ] **Step 1（红）** 
  - recommendation：`recommendDiscards({hand, visibleTiles, openMeldCount=0, requireJiangPair=false})`——测试：requireJiangPair 下推荐偏向 2/5/8 将；openMeldCount 改变向听。参照 `git show origin/main:src/core/recommendation.js` 与其测试。
  - ai：`decideDiscard/decideClaim/decideAction` 用 `shouldRequireJiangPair(game.players[seat])` 调用胜负/向听——测试：起手无将座位能用非将对子自摸（decideAction 返回 self-win）。
- [ ] **Step 2** 红。
- [ ] **Step 3（绿）** recommendation 加两参并透传给 `shantenWithMelds`/`calcUkeire`；ai 各函数内部用座位 flag 传 `{requireJiangPair}` 给 `calcUkeire`/`shantenWithMelds`/`canSelfDrawWin`。
- [ ] **Step 4** `npm test` → 绿。
- [ ] **Step 5** commit：`recommendation+ai: meld-aware and jiang-aware scoring`

## Task 5: 采用 review 超集（操作复盘）

**Files:** Replace `src/core/review.js` with origin/main version; Test `tests/review.test.mjs`

- [ ] **Step 1** 用 `git show origin/main:src/core/review.js` 覆盖本地 `review.js`（它含我现有的 `recordDecision`/`summarizeReview` + 新 `recordOperationDecision`/`summarizeOperationReview`）。确认我现有 review 调用点签名兼容（`recordDecision(records,{turn,chosenDiscard,recommendation})` 一致）。
- [ ] **Step 2** 把 `git show origin/main:tests/review.test.mjs` 的操作复盘用例并入 `tests/review.test.mjs`（保留我现有用例）。
- [ ] **Step 3** `npm test` → 绿。
- [ ] **Step 4** commit：`review: add operation-decision recording and summary`

## Task 6: operation-advice 适配到认领模型

**Files:** Create `src/core/operation-advice.js`; Test `tests/operation-advice.test.mjs`

- [ ] **Step 1（红）** 写 `tests/operation-advice.test.mjs`（参照 `git show origin/main:tests/operation-advice.test.mjs` 的断言意图，改用新输入）：
  - 输入 `{ player, options, discardedTile, visibleTiles, requireJiangPair }`，`options` 为我的 claim-option 数组。
  - 有 `win` 选项 → `best.type==='win'`（胡）。
  - 一个对结构无益的 `pong` → 建议 `pass`。
  - `chi` 能降向听 → 出现带中文解释、shanten/ukeireCount 的 scored choice。
- [ ] **Step 2** 红。
- [ ] **Step 3（绿）** 以 `git show origin/main:src/core/operation-advice.js` 为蓝本新建，改造：①入参换成上面的纯函数签名（不读 `game.pendingAction`）；②动作类型用我的 `win/kong/pong/chi`（展示标签映射 胡/杠/碰/吃）；③内部 `shantenNumber(hand,meld,opts)` 改成统一的 `shantenWithMelds(hand,meld,{requireJiangPair})`、`calcUkeire(...,{requireJiangPair})`；④`pass` 选项与暴露惩罚、解释文案沿用。输出 `{ best, choices, id, ruleNote }`，choice 含 `{ type, tiles, score, shanten, ukeireCount, explanation }`。
- [ ] **Step 4** `npm test` → 绿。
- [ ] **Step 5** commit：`operation-advice: claim recommendation adapted to engine claim model`

## Task 7: main.js 接线

**Files:** Modify `src/main.js`（手动验证 + node --check）

- [ ] **Step 1** 接入：
  - import `shouldRequireJiangPair`（game-state）、`recommendOperation`（operation-advice）、`recordOperationDecision`/`summarizeOperationReview`（review）。
  - `recommendCurrentHand` 传 `openMeldCount: game.players[0].melds.length` 和 `requireJiangPair: shouldRequireJiangPair(game.players[0])`（**消除副露不感知限制**）。
  - 人类 `chooseClaim` 被调用时（有 options）：算 `operationAdvice = recommendOperation({ player:game.players[0], options, discardedTile:game.lastDiscard.tile, visibleTiles:visibleTiles(), requireJiangPair: shouldRequireJiangPair(game.players[0]) })`，存入 `pending` 并 render；玩家点认领/过后 `recordOperationDecision` 记录到操作复盘，再 resolve。
  - `visibleTiles()` 改为含副露牌（discards + melds.tiles），与远端一致。
- [ ] **Step 2** `node --check src/main.js`；`npm test` 仍绿（main 不被测试导入）。
- [ ] **Step 3** commit：`main: operation advice on human claim + operation review + jiang/meld-aware advice`

## Task 8: render/overlays + styles 展示

**Files:** Modify `src/ui/overlays.js`, `src/ui/render.js`, `src/styles.css`（手动验证）

- [ ] **Step 1** overlays：`claimControls(options, operationAdvice)` 在按钮上方渲染"建议操作 + 解释 + 备选(向听/进张)"（参照 `git show origin/main:src/ui/render.js` 的 `operationAdviceBlock`/`actionText`，用我的 SVG 牌面 `tileFaceSvg`）。新增 `operationReviewBlock(summary)`。
- [ ] **Step 2** render：`renderApp` 接 `operationAdvice`/`operationReviewSummary`；认领时把 advice 传给 `claimControls`；复盘区加操作复盘块；当 `game.players[0].flags.initialNoJiang` 时在建议区显示"起手无将路线"提示。
- [ ] **Step 3** styles：加 `.operation-advice/.operation-best/.operation-choice-list` 等（参照远端 styles 对应段，配色对齐我的深色主题）。
- [ ] **Step 4** `node --check`；浏览器实测（见 Task 9）。
- [ ] **Step 5** commit：`ui: show claim advice + operation review + no-jiang prompt`

## Task 9: 端到端验证 + 更新 PR

- [ ] **Step 1** `npm test` 全绿。
- [ ] **Step 2** 浏览器实测（preview MCP，空闲端口）：认领时出现"建议操作"且与按钮对应；起手无将提示出现；操作复盘记录；副露后玩家建议向听正确；四家节奏、流局、胡牌、新开一局正常；无 console error。
- [ ] **Step 3** `git push`（更新 `feature/turn-engine`，PR 自动更新）。报告。

---

## 自检（写计划时）

- **覆盖**：将牌(2/5/8)+起手无将(Task1/2/3/4)、认领建议(Task6/7/8)、操作复盘(Task5/7/8)、副露感知玩家建议(Task1/4/7)。
- **不破坏**：底座 72 测试全程保持绿；旧 API 默认参数保持行为。
- **类型一致**：统一 `(hand, meldCount, {requireJiangPair})` 链；认领建议用我的 `win/kong/pong/chi` type；`flags.initialNoJiang`/`shouldRequireJiangPair` 贯穿。
- **不引入** computer-strategy（ai.js 取代）。
