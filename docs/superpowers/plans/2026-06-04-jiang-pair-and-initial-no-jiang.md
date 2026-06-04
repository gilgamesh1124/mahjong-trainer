# Jiang Pair And Initial No-Jiang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make normal Changsha Mahjong advice respect 2/5/8 jiang-pair rules while preserving the starting no-jiang special route.

**Architecture:** Extend rules helpers with a `requireJiangPair` option, mark each player with `initialNoJiang` immediately after the deal, and pass that rule context through discard recommendation, operation advice, and computer strategy. The wall remains random and untouched.

**Tech Stack:** Vanilla JavaScript ES modules, immutable game state, `node:test`.

---

### Task 1: Jiang Pair Rule Support

**Files:**
- Modify: `src/core/rules.js`
- Test: `tests/rules.test.mjs`

- [x] **Step 1: Write failing tests**

Add tests showing:
- A normal winning structure with a non-2/5/8 pair is rejected when `requireJiangPair` is true.
- The same hand is accepted when `requireJiangPair` is false.
- `getWinningTiles` and `calcUkeire` only count winning tiles that satisfy the jiang-pair rule when enabled.

- [x] **Step 2: Run tests and verify red**

Run: `npm test`

Expected: fails because the rule helpers do not support jiang-pair filtering.

- [x] **Step 3: Implement rule options**

Add `isJiangTile(tile)` and `hasJiangTile(tiles)`. Update `isWinningHand`, `getWinningTiles`, `isTenpai`, `getUsefulTilesAfterDiscard`, `shantenNumber`, and `calcUkeire` to accept an options object while preserving existing default behavior where possible.

- [x] **Step 4: Run tests and verify green**

Run: `npm test`

Expected: all tests pass.

### Task 2: Initial No-Jiang Game Context

**Files:**
- Modify: `src/core/game-state.js`
- Test: `tests/game-state.test.mjs`

- [x] **Step 1: Write failing tests**

Add tests showing player flags include `initialNoJiang` and a controlled deal with no 2/5/8 marks the player.

- [x] **Step 2: Implement flags**

Store `flags: { initialNoJiang }` on every player, computed immediately after the initial deal. Clone flags when cloning players.

- [x] **Step 3: Run tests**

Run: `npm test`

### Task 3: Advice And Strategy Integration

**Files:**
- Modify: `src/core/recommendation.js`
- Modify: `src/core/operation-advice.js`
- Modify: `src/core/computer-strategy.js`
- Modify: `src/main.js`
- Modify: `src/ui/render.js`
- Test: `tests/recommendation.test.mjs`
- Test: `tests/operation-advice.test.mjs`
- Test: `tests/computer-strategy.test.mjs`

- [x] **Step 1: Write failing tests**

Add tests proving normal recommendations prefer jiang-compliant waits and initial no-jiang recommendations can use non-jiang pairs.

- [x] **Step 2: Pass rule context**

Use `requireJiangPair: !player.flags.initialNoJiang` for player advice and computer strategy. Include a short UI prompt when `initialNoJiang` is active.

- [x] **Step 3: Run verification**

Run:
- `npm test`
- `node --check src/main.js`
- `node --check src/core/rules.js`
- `node --check src/core/recommendation.js`
- `node --check src/core/operation-advice.js`
- `node --check src/core/computer-strategy.js`

### Task 4: Browser Check And GitHub Sync

**Files:**
- All changed project files

- [x] **Step 1: Browser smoke check**

Confirm the page loads, advice text appears, and console has no errors.

- [ ] **Step 2: Commit and push**

Commit with message `Add jiang pair rule context` and push to `origin/main`.
