# 推荐过程化解释设计

Date: 2026-06-11

## 背景与目标

用户实测反馈：出牌推荐与备选目前只说明"几出几进"（向听数 + 进张总数），**没有表明过程**——为什么这张牌该打、打完后手牌剩什么结构、靠哪些牌推进、进张之后通向什么。本设计把推荐解释升级为可视的"过程叙述"：

1. **手牌结构分解**：打 X 后已成哪些面子、谁作将、哪些搭子各等哪张、哪些是孤张。
2. **进张后展望**：差 1 向时，进每种牌后听哪些张（含剩余张数）。

保持项目约束：原生 ESM、零依赖、纯函数核心可测（node:test）、TDD、计算量有明确预算。

## 已确认决策

| 决策点 | 选择 |
| --- | --- |
| 细化层级 | 手牌结构分解 + 进张后展望（进张明细随展望/分解自然呈现） |
| 架构 | 方案 A：独立 `decompose.js` 分解器 + recommendation 分层展望 |
| 展望预算 | 仅前三备选、且仅 shanten===1 时计算两层展望；0 向用既有听张数据；≥2 向只给进张明细 |
| UI 形态 | 推荐牌默认展开完整过程块；备选前三点击展开/收起 |

## 模块设计

### decompose.js（新，纯函数）

```js
decomposeHand(concealed, meldCount = 0, { requireJiangPair = false } = {})
// → { shanten,
//     sets:     [{ type: 'run'|'triplet', tiles: Tile[3] }],   // 已成面子
//     pair:     Tile[2] | null,                                 // 将
//     taatsu:   [{ tiles: Tile[2], waits: Tile[] }],            // 搭子及其等张
//     floaters: Tile[] }                                        // 孤张
```

- 在现有 27 格计数回溯框架（同 `shantenMelds`）上**记录最优路径**：外层枚举将对候选，内层依次尝试 刻子/顺子/对塔/两面/嵌张，保留**首个**达到最优向听的分解（遍历顺序固定 ⇒ 输出确定）。
- `waits` 推导规则：连张 n,n+1 → [n-1, n+2]（裁剪 1..9 边界，边张 12→[3]、89→[7]）；跳张 n,n+2 → [n+1]；对子作搭 → [同张]（成刻）。
- `requireJiangPair` 时将对候选仅限 2/5/8，与 `shantenWithMelds` 同规则。
- **核心不变量**：`decomposeHand(...).shanten === shantenWithMelds(concealed, meldCount, opts)`，用多手牌抽查测试钉死。
- 性能：单次微秒级；每个推荐周期约 14 次调用（每候选一次）。

### recommendation.js（增强）

每个 choice 新增字段：

- `decomposition`：打 X 后 13 张暗手的 `decomposeHand` 结果（全部候选都算）。
- `outlook`：仅 `choices` 排序后**前三**且 `shanten === 1` 时计算：
  ```js
  outlook: [{ tile, remaining,                      // 进张及其剩余张数
              waits: [{ tile, remaining }],          // 进张后（最优弃张后）听哪些
              waitTotal }]                           // 听张总数
  ```
  计算方式：进张并入成 14 张 → 枚举弃张取 shanten=0 且听张数最大者 → 该弃张后的 `calcUkeire` 即听张明细。`shanten === 0` 不算（既有 usefulTiles 即听张）；`shanten ≥ 2` 不算。
- `explanation` 重写为过程叙述模板（保留 牌型价值高/注意放炮/较安全 标签）：
  - 0 向：「打X后听牌：听 A/B，共 N 张。」
  - 1 向：「打X后差 1 向：已成 K 副面子（+将/搭子概述），进 A/B/C 即听牌。」
  - ≥2 向：「打X后差 N 向，进张 M 张（K 种）。」

### UI（render.js / main.js / styles.css）

- **过程块**（新渲染函数，best 与备选展开共用）：
  - 结构行：sets（mini 牌面分组）→ pair（标「将」）→ taatsu（各组旁标等张小牌面）→ floaters（标「孤」）。
  - 进张行：usefulTiles 牌面 + 剩余张数角标（>8 种显示前 8 + 「等 N 种」）。
  - 展望行（仅 1 向且有 outlook）：逐条「进 [X] → 听 [Y][Z] · N 张」（>8 条同样截断）。
- **推荐牌**：advice-explanation 下默认完整展开过程块。
- **备选前三**：每项可点击展开/收起（`data-choice-expand` + main.js `expandedChoiceIndex` 状态；推荐刷新时重置为收起）。
- 0 向时既有 wait-block 保留（听张明细），过程块只补结构行。

## 错误处理

- 分解器对非常规长度输入（与 meldCount 不自洽）返回按现有牌尽力分解，不抛错（推荐链路里输入恒自洽）。
- outlook 计算中任何一步无解（理论不发生）→ 该进张省略 waits（空数组），UI 跳过展望行。

## 测试策略（node:test，TDD）

- `decompose.test`：
  - 完整胡牌手 → 4 sets + pair，无 taatsu/floaters；
  - 听牌手 → 3 sets + pair + 1 taatsu（waits 正确：两面/嵌张/边张/对倒各一例）；
  - 孤张识别；含 meldCount>0；requireJiangPair 下 pair 只取 2/5/8；
  - **不变量抽查**：≥6 副随机/构造手牌上 `decompose.shanten === shantenWithMelds`。
- `recommendation.test`：
  - 每个 choice 带 `decomposition` 且其 shanten 与 choice.shanten 一致；
  - 1 向手：前三 choice 有 `outlook`，且某进张的 waits 非空、waitTotal>0；
  - 0 向与 ≥2 向：无 outlook 字段（或为 null）；
  - explanation 含过程要素（如「即听牌」/结构词）。
- UI：node DOM 桩烟测（过程块/展开属性存在）+ 浏览器实测验收。

## 后续扩展（不在本期）

- ≥2 向的多层展望；认领建议（碰/吃后）同款过程块；展望缓存。
