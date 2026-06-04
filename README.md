# 长沙麻将训练桌 / Changsha Mahjong Trainer

[English](#english) | [中文](#中文)

---

## 中文

### 简介

长沙麻将训练桌是一款基于浏览器的长沙麻将训练工具。它的核心价值不在于娱乐，而在于**解释**——帮助玩家理解每一次打牌决策背后的逻辑：为什么这张牌该打，为什么那张牌要留。

### 功能特性

- **完整的麻将桌布局**：底部为玩家手牌，其余三位为电脑玩家，中间显示牌墙与各家弃牌
- **随机发牌**：每局开始时完全随机洗牌，程序不干预牌局走向
- **实时打牌建议**：每次摸牌后，推荐引擎分析所有可打牌，给出推荐打法及理由
  - 向听数改善分析
  - 有效牌种类与剩余数量
  - 结合场上可见弃牌的风险评估
  - 纯文字解释
- **局后复盘**：每局结束后，回顾关键决策点——你与推荐打法的异同、错过的听牌与和牌机会

### 技术栈

- 原生 JavaScript（ES Modules），无框架依赖
- 纯 HTML + CSS 前端，浏览器直接打开即可使用
- Node.js 用于本地开发服务器和测试

### 快速开始

**运行项目**

```bash
npm run serve
```

浏览器访问 `http://localhost:5177`

**运行测试**

```bash
npm test
```

### 项目结构

```
changsha-mahjong-trainer/
├── index.html              # 入口页面
├── src/
│   ├── main.js             # 应用入口
│   ├── styles.css          # 样式
│   ├── core/
│   │   ├── tiles.js        # 牌的定义与工具函数
│   │   ├── random.js       # 随机洗牌
│   │   ├── game-state.js   # 游戏状态管理
│   │   ├── rules.js        # 规则引擎（和牌、听牌判断）
│   │   ├── recommendation.js # 打牌建议引擎
│   │   └── review.js       # 复盘引擎
│   └── ui/
│       └── render.js       # UI 渲染
└── tests/                  # 单元测试
```

### 麻将规则说明

本项目实现的是长沙麻将的简化训练版本：

- **牌型**：万、条、筒各 1-9，共 108 张（无风牌、箭牌）
- **和牌结构**：4 组面子 + 1 对将
- **已支持**：和牌判断、听牌检测、有效牌计算、碰杠框架
- **后续计划**：长沙本地特殊牌型（清一色、全碰、杠上花等）

### 设计原则

> 牌墙是唯一真相来源。程序不会为了制造特殊牌型而干预洗牌或摸牌顺序。分析引擎只能观察当前状态，不能改变牌局结果。

---

## English

### Overview

Changsha Mahjong Trainer is a browser-based training tool for Changsha-style Mahjong. Its core value is **explanation** — helping players understand the reasoning behind every discard decision: why this tile should go, why that tile should stay.

### Features

- **Full mahjong table layout**: Player's hand at the bottom, three computer players around the table, with the tile wall and discard piles visible
- **Random dealing**: The wall is shuffled randomly at the start of every hand — the program never manipulates the tile order
- **Real-time discard recommendations**: After each draw, the recommendation engine analyzes every possible discard and explains the best choice
  - Shanten (distance-to-ready) improvement analysis
  - Useful tile types and remaining counts
  - Risk assessment based on visible discards
  - Plain-language explanation
- **Post-hand review**: After each hand, review key decision moments — where you agreed or differed from recommendations, missed tenpai, and missed wins

### Tech Stack

- Vanilla JavaScript (ES Modules), no framework dependencies
- Plain HTML + CSS frontend, runs directly in the browser
- Node.js for local dev server and tests

### Getting Started

**Start the dev server**

```bash
npm run serve
```

Open `http://localhost:5177` in your browser.

**Run tests**

```bash
npm test
```

### Project Structure

```
changsha-mahjong-trainer/
├── index.html              # Entry page
├── src/
│   ├── main.js             # App entry point
│   ├── styles.css          # Styles
│   ├── core/
│   │   ├── tiles.js        # Tile definitions and utilities
│   │   ├── random.js       # Random shuffle
│   │   ├── game-state.js   # Game state management
│   │   ├── rules.js        # Rules engine (win/tenpai detection)
│   │   ├── recommendation.js # Discard recommendation engine
│   │   └── review.js       # Post-hand review engine
│   └── ui/
│       └── render.js       # UI rendering
└── tests/                  # Unit tests
```

### Mahjong Rules

This project implements a simplified training version of Changsha Mahjong:

- **Tile set**: Characters, Bamboos, and Dots 1-9, totaling 108 tiles (no honor tiles)
- **Win structure**: 4 melds + 1 pair
- **Currently supported**: Win detection, tenpai detection, useful tile calculation, pong/kong framework
- **Planned**: Changsha-specific special hands (pure suit, all-pongs, kong-related wins, etc.)

### Design Principle

> The tile wall is the single source of truth. The program never alters shuffle or draw order to produce special hands. The analysis engine can observe the current state but cannot change the game result.

### Roadmap

- More complete Changsha Mahjong local rules
- Stronger computer player strategy
- Monte Carlo simulation for win probability estimation
- Replay mode from saved game seeds
- Mobile-friendly layout

---

## License

MIT
