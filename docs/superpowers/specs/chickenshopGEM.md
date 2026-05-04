# Chicken Shop Manager — Gemini Feedback & Strategic Thoughts

**Date:** 2026-05-04
**Status:** Strategic Review
**Context:** Supplements `chickenshopGPT.md` and `2026-05-04-chicken-shop-game-design.md`

---

## 1. UX & Visual Clarity Under Pressure

As the game scales to Tier 6 (Full Shop), the primary challenge isn't just speed—it's **information processing**.

### The "Glance" Factor
With 6 stations and 4-6 orders on screen, the player cannot afford to read text. 
- **Feedback:** Instead of just a "patience bar," use **color-coded silhouettes**. A customer silhouette that turns from yellow to a pulsing red is easier to process in peripheral vision than a shrinking green line.
- **Buffer State:** The "Output Buffer" (waiting for player to release work) needs a very distinct visual treatment—perhaps a "Glow" or "Steam" effect—so the player knows that a station is idle simply because they haven't tapped to move the order forward.

### The "Station Occupied" Problem
- **Feedback:** Ensure that when a station is busy, its "hit area" for accepting a new order turns into a "Blocked" icon. This prevents the player from wasting taps/clicks on a queue that is already full (FIFO limit 3).

---

## 2. Advanced Game Mechanics (Post-Launch Retention)

While v1 avoids "Multiplayer" and "Cosmetics," we can add "Juice" that makes the game feel premium without massive dev effort.

### High-Combo "Heat" Mode
- **Thought:** If a player completes 3 "Perfect" station interactions in a row (e.g., Fryer Perfect + Sauce Correct + Sides Correct), the shop enters a brief "Rush Heat" state where movement animations for all orders speed up by 20%. 
- **Benefit:** This rewards skill and makes the "endgame grind" (Levels 61-100) feel more dynamic.

### The "Prestige" Level 100
- **Thought:** Once Level 100 is cleared, unlock an "Endless Mode" where the speed never stops ramping until the player fails.
- **Integration:** This could link to the main site's **Wing Economy**. Perhaps clearing Level 100 or reaching a certain score in Endless Mode grants a unique "Wing King" badge on their Profile page.

---

## 3. Technical Polish & Resilience

### Retina/4K Scaling
Since the user mentioned "Gameboy resolution" issues earlier, we must ensure **PixiJS v8** is configured for high-DPI:
- **Resolution Handling:** Always use `window.devicePixelRatio` in the Pixi application config.
- **Vector Power:** Stick to the "Textures from Graphics" approach mentioned in the spec. Generating textures from `Pixi.Graphics` at runtime ensures the game looks razor-sharp on an iPhone 15 Pro and a 4K Desktop alike.

### Desync & Conflict Resolution
The authoritative server model is correct, but network lag on mobile is real.
- **Edge Case:** Player finishes Level 25, the POST fails due to a tunnel/elevator, and they close the tab.
- **Feedback:** Implement a **Local Persistence Queue**. If a save fails, store the "Level Complete" payload in a separate `pendingSaves` key in localStorage. On the next boot, the game should attempt to sync these *before* letting the player enter the menu. This protects "Paid Skips" and "Life Refills."

---

## 4. Audio Feedback Loop (The "Juice")

Spec `2026-05-04` deferred SFX, but sound is 50% of the pressure in a Diner Dash game.
- **Ticking Clock:** The last 10 seconds of a level should have a high-pitched, accelerating "ding" or "pulse."
- **Customer Anger:** An audible "Hmph!" or "Door bell" when a customer walks out.
- **Till Cash:** A satisfying "Cha-ching!" is the ultimate dopamine hit for completing an order.

---

## 5. Strategic "Usage" Management

To build this game within the user's "usage limits," we should prioritize the **State Machine** over the **Visuals**.
- **Phase 1:** Build the `runStore` and `StationRuntime` logic. It can be tested with plain HTML buttons first.
- **Phase 2:** Wrap the working logic in the PixiJS view layer.
- **Phase 3:** Integrate the `metaStore` with the server for lives/credits.

**Summary:** The design is technically sound. The focus should stay on **visual hierarchy** (making sure the player knows what to tap next) and **data resilience** (making sure they never lose a level they actually cleared).
