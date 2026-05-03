# Gemini Fixes & Feature Implementations

This document logs the changes and fixes made to the Charlie's Wingz website by Gemini CLI.

## 2026-05-03

### 🛠 Bug Fixes
*   **Wing King Platformer:** Fixed a critical loading error where the game would not start due to a missing asset reference (`collectible-wing_fix1.png`). Renamed the existing `collectible-wing.png` to match the code.

### 🍗 Wing Economy (New Feature)
*   **Database (`app/db.js`):**
    *   Added `last_daily_claim` and `daily_streak` columns to `game_players`.
    *   Created `daily_completions` table to track daily challenge progress.
    *   Added `spendPoints`, `addPoints`, `setDailyClaim`, and `insertDailyCompletion` helpers.
*   **Backend (`app/server.js`):**
    *   Defined `WING_SHOP` catalogue and `DAILY_CHALLENGE_POOL`.
    *   Implemented `GET /api/game/shop` and `POST /api/game/shop/redeem`.
    *   Implemented `POST /api/game/daily-claim` and `GET /api/game/daily-status`.
    *   Retired legacy milestone endpoints (`410 Gone` / `400 Bad Request`).
*   **Frontend (`app/public/profile.html`):**
    *   Added **Wing Shop** grid to the Game tab.
    *   Added **Daily Check-In** and **Daily Challenges** to the Loyalty tab.
    *   Integrated points balance and real-time redemption logic.

### 🛸 Sauce Shooter (New Game)
*   **Game Implementation:** Created `app/public/shooter.html`, a top-down arcade shooter featuring the Chicken King.
*   **Routing:** Added `/shooter` route to `server.js`.
*   **Integration:** Added Sauce Shooter to the `play-win.html` arcade landing page.
*   **Scoring:** Wired the game into the centralized `POST /api/game/save` endpoint to earn Wing Shop points.

### 🎨 High-Fidelity Assets & Engine
*   **Asset Generation Upgrade:** Switched the generation model from Flux to **SDXL (fal-ai/fast-sdxl)** as requested. Updated `scripts/generate-assets.js` and `scripts/generate-sprite-sheet.js` to utilize SDXL with high-fidelity 4K prompts.
*   **Game Engine Upgrade (Phaser.js):**
*   **Wing Run & Snake:** Completely rewrote both games to replace the old React/Babel/Canvas implementations with **Phaser 3**.
    *   **Wing Run:** Now a smooth vertical-scrolling delivery game. You ride an e-bike, hop over traffic, and deliver wings to glowing houses. Includes a 'heat' survival mechanic.
    *   **Snake:** Updated to a smooth grid-based crawler with swipe support for mobile, dynamic food spawning, and growing mechanics.
*   **High-Fidelity Assets:** Updated `scripts/generate-assets.js` with new prompts for `wingrun` and `snake` to generate 4K 3D-rendered elements (cyberpunk bikes, sleek cars, glowing wings).

### 🎮 Game Visual & Transparency Fixes
*   **Real-time Background Removal:** Implemented a dynamic "Chroma Key" logic in both `platformer.html` and `shooter.html` that identifies the background color (from the top-left pixel) and replaces it with transparency on the fly. This removes the ugly "squares" around AI-generated assets.
*   **Wing King Visibility:**
    *   Added **Autocropping**: The game now scans the spritesheet to find the exact bounding box of the non-transparent pixels, ensuring the character is correctly framed regardless of AI generation variations.
    *   **Increased Size**: Enlarged the player sprite by 33% (from 60x72 to 80x96) to make the character easier to see on all screens.
*   **Sauce Shooter Improvements:** Applied the same background removal logic to all game assets (ship, vans, power-ups), ensuring a clean look against the scrolling background.

### 🛡️ Challenge Validation Fix
*   **Backend (`app/server.js`):** Updated `completeChallengeIfNew` to only award points if the completed challenge is in the active daily set (the 3 challenges picked for that day). This prevents users from farming points for non-active challenges.

### 🛵 Live Order Tracker (New Feature)
*   **Database (`app/db.js`):**
    *   Added `track_token` column to `orders` table with a unique index.
    *   Updated `insertOrder` to handle the new token and added `getOrderByTrackToken`.
*   **Backend (`app/server.js`):**
    *   Checkout process now generates a secure 12-char `trackToken`.
    *   Added public `GET /api/orders/track/:token` endpoint.
*   **Frontend (`app/public/index.html`):**
    *   Implemented a live polling tracker (10s interval) that appears after checkout.
    *   Added a multi-step progress bar (Confirmed → Preparing → Ready/On the Way → Delivered).
    *   Integrated "One-tap Reorder" directly into the tracker screen.

### 💎 Referral System Finalization
*   **Backend (`app/server.js`):**
    *   Updated Stripe webhook to automatically trigger 15% discount codes for both the referrer and the friend upon the friend's first order.
    *   Wired up the 10-referral milestone for a 30% discount.
