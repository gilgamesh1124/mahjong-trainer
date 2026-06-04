# 长沙麻将训练桌

浏览器端长沙麻将训练工具。核心价值是**解释**：帮助玩家理解每次打牌决策背后的向听数和进张逻辑。

## 技术栈

- 原生 JavaScript（ES Modules），无框架、无构建工具
- 纯 HTML + CSS，浏览器直接运行
- Node.js 用于开发服务器和测试

## 常用命令

```bash
npm run serve   # 启动开发服务器 http://localhost:5177
npm test        # 运行所有测试（node --test）
```

停止服务器（PowerShell）：
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 5177 -ErrorAction SilentlyContinue).OwningProcess -Force
```

## 项目结构

```
src/
  core/
    tiles.js          # 牌定义、tileKey、tileLabel、tileGlyph、sortTiles
    random.js         # 随机洗牌
    game-state.js     # 游戏状态（发牌、摸牌、打牌）
    rules.js          # 规则引擎：isWinningHand、isTenpai、shantenNumber、calcUkeire
    recommendation.js # 推荐引擎：shanten+ukeire 双维度评分
    review.js         # 复盘引擎：记录向听差、识别关键时刻
  ui/
    render.js         # DOM 渲染（使用 Unicode emoji 牌面）
  main.js             # 应用入口
  styles.css
tests/                # node:test 测试，共 28 个
```

## 核心算法

**向听数（shantenNumber）**：回溯递归，对 27 位计数数组处理（tong 0-8, wan 9-17, tiao 18-26）。试刻子/顺子/对塔/两面/嵌张/跳过。shanten=-1 和牌，=0 听牌。

**进张数（calcUkeire）**：对每种牌检查 `shantenNumber([...hand, tile]) < currentShanten`，统计剩余可用张数。

**推荐排序**：`score = (8 - shanten) * 1000 + ukeireCount`

## 牌面显示

手牌和弃牌区使用 Unicode 麻将牌 emoji（🀇–🀡），`tileGlyph(tile)` 函数实现映射。

## 开发约定

- 手牌按筒→万→条、同花色小→大顺序排列（发牌和摸牌后自动 `sortTiles`）
- 游戏状态不可变：每次操作返回新的 state 对象
- 不引入构建工具，保持零依赖
- 测试先行（TDD）

## GitHub

https://github.com/gilgamesh1124/mahjong-trainer
