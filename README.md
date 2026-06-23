# Telegram Anti-Fraud Verification API 🛡️

A powerful, low-code Device Verification system designed for Telegram Bot developers. This API prevents users from exploiting "Refer & Earn" bots by creating multiple fake accounts on the exact same physical device.

---

## 🚀 How to Integrate

Integrating the Anti-Fraud system into your Telegram bot requires just two simple steps: sending a WebApp button and polling an API.

### Step 1: Send the Verification Button

When a user joins your bot, you must send them an Inline Keyboard Button pointing to our centralized Verification Mini App. 

**Important:** You must inject your bot's unique ID into the URL payload (`startapp`) so the system can isolate your users securely.

**Mini App URL:**
`https://t.me/Webapptrstbot/browser?startapp={YOUR_BOT_ID}`

**Example Implementation (Python):**
```python
bot_id = "123456789" # Your bot's ID
web_app_url = f"https://t.me/Webapptrstbot/browser?startapp={bot_id}"

builder = InlineKeyboardBuilder()
builder.add(InlineKeyboardButton(text="🛡️ Verify Device", url=web_app_url))
# Send the button to the user...
```

---

### Step 2: Poll for Verification Status

Immediately after sending the button, your bot should start a background loop to poll our API. This checks whether the user has successfully passed the physical hardware check.

**Endpoint:**
```http
GET https://device-sooty.vercel.app/api/session/status
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | String | Yes | The Telegram ID of the user verifying. |
| `bot_id`  | String | Yes | Your Telegram Bot ID. |

**Example Request:**
```http
GET https://device-sooty.vercel.app/api/session/status?user_id=88888888&bot_id=123456789
```

### API Responses

When you poll the API, you will receive a JSON response indicating the exact state of the user's verification.

**1. Pending**
The user has not completed the check yet. You should continue to poll (e.g., every 3 seconds for 3 minutes).
```json
{
  "status": "pending"
}
```

**2. Verified (Success ✅)**
The user passed the hardware check. They are using a unique physical device for your bot. You can safely award them their referral points!
```json
{
  "status": "verified"
}
```

**3. Rejected (Fraud Detected ❌)**
The user failed the hardware check (e.g., they are trying to verify a second Telegram account on the exact same physical device). You should deny them rewards.
```json
{
  "status": "rejected"
}
```

**4. Expired or Not Found**
The session timed out, the user took too long, or the Mini App failed to initialize. You should stop polling and prompt the user to click the button again.
```json
{
  "status": "expired_or_not_found"
}
```
