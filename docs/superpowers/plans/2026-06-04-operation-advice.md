# Mahjong Operation Advice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-hand advice and replay notes for chi, peng, gang, hu, and pass decisions.

**Architecture:** Add a focused `operation-advice` core module that evaluates the current pending action from the player's point of view. Reuse shanten and ukeire scoring, extend those helpers to understand already-open melds, then pass the advice into the existing renderer and record player operation decisions for review.

**Tech Stack:** Vanilla JavaScript ES modules, immutable game-state helpers, `node:test`, existing HTML/CSS renderer.

---

### Task 1: Meld-Aware Scoring

**Files:**
- Modify: `src/core/rules.js`
- Modify: `src/core/recommendation.js`
- Test: `tests/rules.test.mjs`

- [ ] **Step 1: Write failing tests**

Add tests showing `shantenNumber(hand, 1)` treats one exposed meld as already complete and `calcUkeire(hand, visibleCounts, 1)` can count useful tiles for a reduced concealed hand.

- [ ] **Step 2: Run tests and verify red**

Run: `npm test`

Expected: fails because `shantenNumber` and `calcUkeire` ignore open meld counts.

- [ ] **Step 3: Implement minimal support**

Allow `shantenNumber(hand, openMeldCount = 0)` and `calcUkeire(hand, visibleCounts, openMeldCount = 0)`. Keep the default behavior unchanged for all existing callers.

- [ ] **Step 4: Run tests and verify green**

Run: `npm test`

Expected: all tests pass.

### Task 2: Operation Advice Engine

**Files:**
- Create: `src/core/operation-advice.js`
- Test: `tests/operation-advice.test.mjs`

- [ ] **Step 1: Write failing tests**

Add tests showing:
- If `hu` is available, best advice is `hu`.
- If `peng` worsens structure versus passing, best advice is `pass`.
- If `chi` improves shanten after the forced discard, it appears as a scored choice with a Chinese explanation.

- [ ] **Step 2: Run tests and verify red**

Run: `npm test`

Expected: fails because `operation-advice.js` does not exist.

- [ ] **Step 3: Implement minimal advice module**

Export `recommendOperation({ game, playerIndex, visibleTiles = [] })`. Return `{ best, choices }`, where each choice has `action`, optional `tiles`, `score`, `shanten`, `ukeireCount`, and `explanation`.

- [ ] **Step 4: Run tests and verify green**

Run: `npm test`

Expected: all tests pass.

### Task 3: UI And Operation Replay

**Files:**
- Modify: `src/main.js`
- Modify: `src/ui/render.js`
- Modify: `src/styles.css`
- Modify: `src/core/review.js`
- Test: `tests/review.test.mjs`

- [ ] **Step 1: Write failing review tests**

Add tests for recording an operation choice against operation advice and summarizing obvious deviations.

- [ ] **Step 2: Implement UI wiring**

Compute operation advice during render, show it above the operation buttons, and record the player's `hu/gang/peng/chi/pass` choice before applying it.

- [ ] **Step 3: Verify app**

Run:
- `npm test`
- `node --check src/main.js`
- `node --check src/ui/render.js`
- `node --check src/core/operation-advice.js`

Use the same local Playwright smoke check pattern as the prior operation-layer work.

### Task 4: Commit And GitHub Sync

**Files:**
- All changed project files

- [ ] **Step 1: Review diff**

Confirm only operation-advice, scoring, replay, and plan files changed.

- [ ] **Step 2: Commit and push**

Commit with message `Add operation advice` and push to `origin/main`.
