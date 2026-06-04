# Mahjong Operation Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first playable operation layer for chi, peng, gang, hu, and pass so the four seats feel like an active Mahjong table.

**Architecture:** Keep the random wall as the only draw source. Add claim detection and claim application in `src/core/game-state.js`, then let `src/main.js` pause when the human player has available operations and auto-resolve computer responses by priority.

**Tech Stack:** Vanilla JavaScript ES modules, immutable game state updates, `node:test`, existing HTML/CSS renderer.

---

### Task 1: Claim Rules And State Transitions

**Files:**
- Modify: `src/core/game-state.js`
- Test: `tests/game-state.test.mjs`

- [ ] **Step 1: Write failing tests**

Add tests for these behaviors:
- Discarding a tile creates a pending action when another player can hu, peng, gang, or chi.
- Chi is only available to the next player and returns concrete sequence choices.
- Claiming peng removes the exposed discard from the discarder, removes two matching tiles from the claimer, creates a meld, and gives the claimer the next discard.
- Declaring hu ends the hand.

- [ ] **Step 2: Run tests and verify red**

Run: `npm test`

Expected: fail because operation helpers and pending action state do not exist yet.

- [ ] **Step 3: Implement minimal game-state support**

Add helper exports in `src/core/game-state.js`:
- `getAvailableActions(game, playerIndex, discardedTile, fromPlayerIndex)`
- `claimDiscard(game, playerIndex, action, tiles = [])`
- `passClaim(game, playerIndex)`
- `declareSelfWin(game, playerIndex)`

Represent melds as `{ type, tiles, fromPlayerIndex }`. Represent ended hands with `phase: 'ended'` and `result`.

- [ ] **Step 4: Run tests and verify green**

Run: `npm test`

Expected: all current and new game-state tests pass.

### Task 2: Browser Flow And Computer Responses

**Files:**
- Modify: `src/main.js`
- Modify: `src/ui/render.js`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing behavior coverage where practical**

Use the state tests from Task 1 as the hard behavior gate. Browser wiring is verified by syntax checks and manual interaction because the project has no browser test dependency.

- [ ] **Step 2: Connect player operation buttons**

Render an operation panel when `game.pendingAction` includes player 0. Add buttons for `hu`, `gang`, `peng`, `chi`, and `pass`. For chi, show each sequence as a separate button.

- [ ] **Step 3: Connect computer response flow**

After every discard, auto-resolve computer actions by priority: hu, gang, peng, chi. If the human has actions, pause and wait. After claims or passes, continue the normal draw/discard loop from the correct seat.

- [ ] **Step 4: Keep recommendations scoped to player discard turns**

Only refresh discard recommendations when player 0 has a 14-tile hand and the hand has not ended.

### Task 3: Verification And GitHub Sync

**Files:**
- All changed project files

- [ ] **Step 1: Run local verification**

Run:
- `npm test`
- `node --check src/main.js`
- `node --check src/ui/render.js`
- `node --check src/core/game-state.js`

- [ ] **Step 2: Review diff**

Check the working tree and confirm the diff only contains operation-layer changes.

- [ ] **Step 3: Commit and push**

Create a feature branch if currently on `main`, commit the scoped changes, and push to GitHub.
