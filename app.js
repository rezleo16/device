require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the Mini App (index.html) from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * 1. Initiate a session
 * Developer backend calls this when a new user joins their bot.
 */
app.post('/api/session/init', async (req, res) => {
  const { user_id, bot_id } = req.body;
  if (!user_id || !bot_id) {
    return res.status(400).json({ error: 'Missing user_id or bot_id' });
  }

  try {
    // Generate a random session token
    const token = crypto.randomBytes(16).toString('hex');
    
    // Save to Redis: session:<token> -> { user_id, bot_id, status: 'pending' }
    // Expires in 300 seconds (5 minutes)
    await redis.set(`session:${token}`, {
      user_id,
      bot_id,
      status: 'pending'
    }, { ex: 300 });

    res.json({ status: 'success', session_token: token });
  } catch (error) {
    console.error('Redis error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * 2. Status polling (Ping)
 * Developer backend polls this to see if the user has completed verification.
 */
app.get('/api/session/status', async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).json({ error: 'Missing session token' });
  }

  try {
    const session = await redis.get(`session:${token}`);
    if (!session) {
      return res.json({ status: 'expired_or_not_found' });
    }

    res.json({ status: session.status });
  } catch (error) {
    console.error('Redis error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * 3. Evaluate Fingerprint
 * External browser calls this to submit the device hash.
 */
app.post('/api/session/evaluate', async (req, res) => {
  const { token, device_hash } = req.body;
  if (!token || !device_hash) {
    return res.status(400).json({ error: 'Missing token or device_hash' });
  }

  try {
    // 1. Get the session
    const session = await redis.get(`session:${token}`);
    if (!session) {
      return res.status(400).json({ error: 'Session expired or invalid' });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({ error: 'Session already processed' });
    }

    const { user_id, bot_id } = session;

    // 2. Check if this device hash already exists for this specific bot
    const existingUserId = await redis.get(`device:${bot_id}:${device_hash}`);

    if (existingUserId && String(existingUserId) !== String(user_id)) {
      // FRAUD DETECTED: Device used by a different user for this bot!
      session.status = 'rejected';
      await redis.set(`session:${token}`, session, { ex: 300 }); // update session
      return res.json({ status: 'rejected', reason: 'Device already registered to another user' });
    }

    // 3. SUCCESS: New device for this bot, or same user verifying again.
    // Save the device hash -> user_id mapping permanently (or for a long time)
    await redis.set(`device:${bot_id}:${device_hash}`, user_id);
    
    // Update session status
    session.status = 'verified';
    await redis.set(`session:${token}`, session, { ex: 300 });

    res.json({ status: 'verified' });

  } catch (error) {
    console.error('Redis error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Fraud Verification Server running on http://localhost:${PORT}`);
});
