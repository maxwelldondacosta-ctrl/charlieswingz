# Charlie's Wingz — Final Handover Specification
*Date: May 2026 | Prepared by Gemini CLI*

This document summarizes the full-stack upgrades, game implementations, and visual overhauls completed for the Charlie's Wingz web presence.

---

## 🎮 1. The Arcade (Phaser.js Engine)
All games have been migrated from vanilla Canvas/React to the **Phaser 3** professional game engine. They are now high-performance, GPU-accelerated, and mobile-responsive.

### 🏁 Vector Asset Standard
Every game now uses **Twemoji Vector SVGs**.
*   **Benefits:** Infinite scaling (sharp on 4K), perfect transparency (no "squares"), and consistent clean aesthetics.
*   **Characters:** All sprites are chicken-themed (Chickens, Roosters, Wings, Crowns).

### 🕹️ The Games
1.  **Sauce Shooter (`/shooter`):**
    *   **Logic:** Top-down defender. Blast rival vans with sauce bolts.
    *   **Difficulty:** Tuned for high-challenge. Features aggressive speed scaling and limited fire rate.
2.  **Wing King (`/platformer`):**
    *   **Logic:** Infinite side-scroller. Double-jump over bins and inspectors.
    *   **Integration:** 🍗 wings collected count toward your global score.
3.  **Wing Run (`/wing-run.html`):**
    *   **Logic:** Vertical delivery scroller. Ride an e-bike, hop traffic, and hit delivery zones.
    *   **Mechanic:** Survival 'Heat' bar—keep delivering to stay in the game.
4.  **Snake (`/snake`):**
    *   **Logic:** Modern grid-based crawler. Eat wings to grow.
    *   **Control:** Supports keyboard and mobile swipe.

---

## 🍗 2. Wing Economy & Rewards
A centralized progression system that turns arcade points into real-world discounts.

### 🛒 The Wing Shop
*   **UI:** Located in **Profile > Game**.
*   **Items:** 7 tiers ranging from "Free Can of Pop" to "Free 20 Wings" (10 million points).
*   **Automation:** Redeeming an item immediately deducts `total_score` and generates a unique code in the **Discounts** table.

### 🔥 Daily Drops
*   **Daily Check-In:** Located in **Profile > Loyalty**. Rewards players for daily visits with a 7-day streak bonus (up to 10,000 points).
*   **Daily Challenges:** 3 randomized challenges generated every 24h. Points are only awarded if the challenge is active in the current daily set.

---

## 🛵 3. Order Experience
### 📍 Live Order Tracker
*   **Activation:** Triggers automatically after a successful Stripe checkout.
*   **Security:** Uses a 12-character `track_token` (no login required for customers to view).
*   **UI:** 4-step progress bar (Confirmed → Preparing → Ready/On the Way → Delivered).
*   **Integration:** Includes a "One-tap Reorder" button that pre-fills the cart in `index.html`.

---

## 💎 4. Referral System
*   **Referrer Reward:** 15% discount code generated after a friend's first order.
*   **Friend Reward:** 15% discount code applied to their account.
*   **Milestone:** Every 10th successful referral triggers a **30% discount code** for the referrer.

---

## 🛠️ 5. Technical Architecture
### Database (`db.js`)
*   **New Tables:** `daily_completions` (challenge tracking), `lottery` (order milestones).
*   **New Columns:** `game_players` (streak, claim dates), `orders` (track_token).
*   **Standardization:** All customer emails are handled via `LOWER()` to prevent duplicate accounts.

### Backend (`server.js`)
*   **Reward Triggers:** Centralized in the `checkout.session.completed` webhook.
*   **API:** Clean endpoints for `/api/game/shop`, `/api/game/daily-claim`, and `/api/orders/track`.

---

## 🚀 6. Deployment Status
*   **GitHub:** All code is committed to `origin main`.
*   **Deployment Commands:**
    ```bash
    git pull origin main
    npm install --production
    node server.js # Run once to trigger migrations
    mkdir -p tmp && touch tmp/restart.txt
    ```

**All systems are go. The games are fully integrated into the rewards ecosystem.**
