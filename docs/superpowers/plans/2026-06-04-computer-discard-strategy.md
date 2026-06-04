# Computer Discard Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make computer players discard by hand quality instead of always discarding the first tile.

**Architecture:** Add a focused strategy module that evaluates every legal discard with the same shanten and ukeire style already used by player recommendations. Keep the random wall untouched; the strategy only chooses from the computer player's current hand.

**Tech Stack:** Vanilla JavaScript ES modules, `node:test`, existing rules and recommendation helpers.

---

### Task 1: Computer Strategy Module

**Files:**
- Create: `src/core/computer-strategy.js`
- Test: `tests/computer-strategy.test.mjs`

- [ ] **Step 1: Write failing tests**

Add tests showing:
- The strategy chooses the discard that improves shanten when one discard is clearly better.
- Visible discards reduce ukeire and can change the preferred discard.
- The strategy does not mutate the input hand and never reads or changes the wall.

- [ ] **Step 2: Run tests and verify red**

Run: `npm test`

Expected: fails because `computer-strategy.js` does not exist.

- [ ] **Step 3: Implement minimal strategy**

Export `chooseComputerDiscard({ hand, visibleTiles = [], openMeldCount = 0 })`. Internally evaluate unique discards by removing one tile, computing `shantenNumber(afterDiscard, openMeldCount)` and `calcUkeire(afterDiscard, visibleCounts, openMeldCount)`, and returning `{ discard, choices }`.

- [ ] **Step 4: Run tests and verify green**

Run: `npm test`

Expected: all tests pass.

### Task 2: Main Flow Integration

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Replace first-tile discard**

Import `chooseComputerDiscard` and use it in `discardFirstTile(playerIndex)` for non-player seats. Keep player 0 behavior unchanged.

- [ ] **Step 2: Verify no wall manipulation**

Confirm the strategy receives only hand, visible tiles, and meld count. It must not receive `game.wall`.

- [ ] **Step 3: Run verification**

Run:
- `npm test`
- `node --check src/main.js`
- `node --check src/core/computer-strategy.js`

### Task 3: Browser Check And GitHub Sync

**Files:**
- All changed project files

- [ ] **Step 1: Browser smoke check**

Use the existing local Playwright smoke check path to confirm the game still loads, hand clicks still advance the table, and no console errors appear.

- [ ] **Step 2: Commit and push**

Commit with message `Improve computer discard strategy` and push to `origin/main`.
