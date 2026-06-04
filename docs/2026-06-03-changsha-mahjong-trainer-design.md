# Changsha Mahjong Trainer Design

Date: 2026-06-03

## Purpose

Build a first-version web-based Changsha Mahjong training game. The program should help a player improve through realistic dealing and drawing, in-game discard recommendations, and post-game review.

The first version prioritizes trustworthy training over full entertainment features. It should feel like a playable mahjong table, but its core value is explaining why one discard is better than another.

## First-Version Scope

The first version will be a browser-based game stored under:

`E:\codexworkplace\projects\changsha-mahjong-trainer`

It will include:

- A horizontal mahjong-table layout inspired by common mobile mahjong tables.
- Four seats: the human player at the bottom and three computer players.
- Basic wall generation, shuffle, dealing, drawing, discarding, and discard piles.
- Click-to-discard interaction for the human player.
- Simple computer-player turns so a full hand can progress.
- Basic hand analysis for standard mahjong shapes.
- In-game recommendation for which tile to discard.
- Explanation of the recommendation using hand progress, remaining useful tiles, and visible discards.
- Post-game review records for important player decisions.

It will not include in the first version:

- Online multiplayer.
- Real-money, points-wallet, or matchmaking systems.
- Full local-rule completeness for every Changsha Mahjong variant.
- Forced teaching deals that manipulate the tile wall.
- Advanced AI trained from large datasets.

## Rule Positioning

The first version is a simplified Changsha Mahjong training version.

The tile set will start with suited tiles:

- Characters: 1-9 wan
- Bamboos: 1-9 tiao
- Dots: 1-9 tong
- Four copies of each tile

The rules engine should be written so Changsha-specific patterns can be added later. First-version support will focus on:

- Standard win structure detection.
- Tenpai detection.
- Useful-tile calculation.
- Basic pong and kong framework.
- A placeholder pattern system for later special hands, such as pure suit, all pongs, kong-related wins, and sea-bottom situations.

Special hands must be detected only when they naturally appear. They must never influence shuffle or draw order.

## Random Dealing Principle

The tile wall is the source of truth.

At the beginning of each hand, the program creates a full wall and shuffles it randomly. After that, all dealing, drawing, and replacement draws use the next tile from the wall in order.

Hard requirements:

- The program must not reorder tiles after the hand starts.
- The program must not alter probability to create pure suit, kong wins, or other special hands.
- The program must not secretly favor or punish the player.
- The analysis engine can observe the current state, but it cannot change the wall or game result.
- Each hand should record either the random seed or the full wall order so the hand can be reviewed or replayed.

This separation keeps the game credible: the play layer simulates reality, while the training layer explains the situation.

## Architecture

The application will be split into four main modules.

### Game State

Responsible for the current hand:

- Wall order and remaining wall count.
- Player hands.
- Discard piles.
- Melds.
- Current turn.
- Dealer and round metadata.
- Action history.

Game state should be serializable so review and replay can use the same record.

### Rules Engine

Responsible for legal actions and hand evaluation:

- Sort and compare tiles.
- Determine whether a hand is complete.
- Determine whether a hand is in tenpai.
- Calculate useful tiles after a candidate discard.
- Identify basic meld opportunities.
- Expose extension points for Changsha-specific patterns.

The first version can use deterministic rule checks instead of machine learning.

### Recommendation Engine

Responsible for discard advice when it is the player's turn.

For every tile the player can discard, the engine should calculate a score using:

- Shanten or distance-to-ready improvement.
- Number of useful tile types after discarding.
- Remaining visible-count-adjusted useful tiles.
- Whether key useful tiles have already appeared in other players' discards.
- Whether the discard preserves pairs, sequences, and flexible waits.
- Simplified danger based on visible discards, exposed melds, and recent table activity.

The output should include:

- Recommended discard.
- Second and third choices.
- Estimated improvement value.
- Useful tiles and remaining counts.
- Visible-discard evidence.
- Risk notes.
- Plain-language explanation.

The first version should use explainable scoring. A simulation-based probability estimator can be added later as a separate module without changing game flow.

### Review Engine

Responsible for post-hand learning.

It should record:

- Each human discard decision.
- The recommendation at that moment.
- Whether the player followed or ignored it.
- Changes in useful tiles after the decision.
- Missed tenpai or missed win opportunities.
- Risky discards based on visible information.

The review screen should summarize key moments instead of listing every mechanical event equally.

## Interface Design

The first version will be a browser app.

Layout:

- Center: mahjong table, wall, current discards, and turn indicator.
- Bottom: human player's hand, with clickable tiles.
- Top, left, and right: computer players with concealed hands and discard areas.
- Side panel: in-game recommendation.
- Review panel or screen: post-hand analysis.

Visual style:

- Table-first layout, similar in spirit to common mahjong apps.
- Clear tile faces for the player's hand.
- Green-backed concealed tiles for opponents and wall.
- Compact information panels so the table remains the main focus.
- Desktop browser and horizontal layout first.

The UI should avoid decorative complexity until the game logic and training explanations are reliable.

## Computer Players

The first version computer players can use simple behavior:

- Draw a tile.
- Discard using a lightweight heuristic.
- Take obvious pong or kong actions only if implemented safely.

They do not need to be strong players in the first version. Their main role is to keep the hand moving and create realistic public discard information for the training engine.

## Data Flow

1. Start hand.
2. Generate random wall.
3. Deal tiles from the wall.
4. Human and computer turns proceed from game state.
5. On the human player's turn, recommendation engine evaluates all candidate discards.
6. Human discards a tile.
7. Decision and recommendation snapshot are recorded.
8. Hand continues until win, draw, or manual reset.
9. Review engine summarizes the hand.

## Error Handling

The game should guard against invalid state:

- Drawing from an empty wall.
- Discarding a tile not in hand.
- Acting out of turn.
- Claiming a win when the hand is not complete.
- Using stale recommendation data after the hand state changes.

Invalid actions should be blocked in the UI and logged in development.

## Testing Strategy

The first implementation should include focused tests for:

- Tile wall creation has the correct count.
- Shuffle preserves tile counts.
- Dealing and drawing only consume from the wall.
- No rule or recommendation function can mutate the wall.
- Standard hand completion examples.
- Tenpai and useful-tile examples.
- Recommendation output includes a best discard and explanation.
- Review records decisions with the matching recommendation snapshot.

Browser testing should verify:

- The table renders without overlap on desktop.
- Player tiles are clickable.
- Recommendation panel updates after each draw or discard.
- A hand can progress through multiple turns without breaking state.

## Open Extension Points

Later versions can add:

- More complete Changsha Mahjong local rules.
- More realistic computer-player strategy.
- Monte Carlo simulation for estimated win probability.
- Replay mode from saved seed or wall order.
- Multiple visual themes.
- Training scenarios generated from real played hands, clearly labeled as non-random practice mode.

Random normal play and authored practice scenarios must remain separate modes.

