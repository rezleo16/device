# Telegram Fraud Prevention SaaS 🛡️

A powerful, low-code Device Verification system designed for Telegram Bot developers. This system prevents users from exploiting "Refer & Earn" bots by creating multiple fake accounts on the exact same physical device.

By utilizing advanced browser fingerprinting (Canvas, Navigator, Screen, etc.) and a secure session bridge via Telegram Mini Apps, it guarantees **1 Physical Device = 1 Account** per bot.

---

## 🏗️ Architecture Overview

The system operates across four distinct layers to ensure maximum security and a seamless user experience:

1. **The Developer's Telegram Bot (`bot.py`)**: The bot that wants to verify a user before giving them points.
2. **The Centralized Mini App (`fraud_saas/public/index.html`)**: A gateway hosted on Vercel. It acts as an invisible bridge that securely grabs the Telegram User ID and redirects the user outside of the Telegram Sandbox.
3. **The External Scanner (`public/index.html`)**: Hosted on GitHub Pages. Because it runs in the phone's native browser (Safari/Chrome), it can generate a highly accurate, persistent hardware fingerprint.
4. **The Verification Backend (`fraud_saas/app.js`)**: An Express.js API connected to Upstash Redis that orchestrates the secure handshakes between the Bot, the Mini App, and the Scanner.

---

## 🚀 How Developers Use It (The Integration Flow)

To use this SaaS, a third-party developer does **not** need to set up their own Mini App or backend. They only need to implement two simple things in their Bot code (see `bot.py` for the full example):

### 1. Send the Universal WebApp Button
The developer sends an Inline Keyboard Button pointing to your centralized Mini App, injecting their unique Bot ID into the URL payload (`startapp`):

```python
bot_id = str(bot.id) 
web_app_url = f"https://t.me/Webapptrstbot/browser?startapp={bot_id}"

# Send the button to the user
```

### 2. Poll for Status
Immediately after sending the button, the developer's bot polls your API using the user's ID and their Bot ID to see if the user passed the hardware check:

```python
GET https://device-sooty.vercel.app/api/session/status?user_id=123456789&bot_id=987654321
```
Once the endpoint returns `{"status": "verified"}`, the bot stops polling and awards the points.

---

## 🔌 API Endpoints Documentation

The Express Backend exposes 3 strictly-typed endpoints to manage the lifecycle of a verification session. 

### 1. `POST /api/session/init`
**Caller:** The Telegram Mini App (`fraud_saas/public/index.html`)
**Purpose:** Initializes a secure, time-limited verification session before redirecting the user to the native browser.

**Request Body:**
```json
{
  "user_id": "123456789",
  "bot_id": "987654321"
}
```

**Response:**
```json
{
  "status": "success",
  "session_token": "a1b2c3d4e5f6g7h8..."
}
```
*Behind the scenes:* Maps the `session_token` to the user/bot, and sets the initial `status` in Redis to `pending`.

---

### 2. `POST /api/session/evaluate`
**Caller:** The External Fingerprint Browser (`public/index.html` on GitHub Pages)
**Purpose:** Submits the cryptographically generated hardware fingerprint hash for evaluation.

**Request Body:**
```json
{
  "token": "a1b2c3d4e5f6g7h8...",
  "device_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

**Response (Success):**
```json
{
  "status": "verified"
}
```

**Response (Fraud Detected):**
```json
{
  "status": "rejected",
  "reason": "Device already registered to another user"
}
```
*Behind the scenes:* It checks if `device_hash` exists in Redis for this specific `bot_id`. If it does, and the stored `user_id` doesn't match the current `user_id`, it rejects the session. Otherwise, it approves it.

---

### 3. `GET /api/session/status`
**Caller:** The Developer's Telegram Bot (`bot.py`)
**Purpose:** Polled asynchronously by the developer's bot to determine if it should release the referral rewards to the user.

**Query Parameters:**
- `user_id` (string)
- `bot_id` (string)

**Response States:**
- `{"status": "pending"}` - The user is still in the browser. Keep polling.
- `{"status": "verified"}` - Hardware passed. Award points.
- `{"status": "rejected"}` - Fraud detected. Do not award points.
- `{"status": "expired_or_not_found"}` - Session timed out or invalid.

---

## 🔒 Security Notes
- **Namespacing:** Device hashes are strictly namespaced by `bot_id` (`device:{bot_id}:{device_hash}`). This means a user *can* verify their device on Bot A, and then verify the exact same device on Bot B without getting banned. They are only banned if they try to use two different accounts on Bot A.
- **Payload Extraction:** The Mini App dynamically extracts the `bot_id` from `window.Telegram.WebApp.initDataUnsafe.start_param` to ensure verifications are routed to the correct developer's namespace automatically.
