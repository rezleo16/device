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

app.post('/api/session/init', async (req, res) => {
  // Now called by the Mini App (index.html) directly
  const { user_id, bot_id } = req.body;
  if (!user_id || !bot_id) {
    return res.status(400).json({ error: 'Missing user_id or bot_id' });
  }

  try {
    const token = crypto.randomBytes(16).toString('hex');
    
    // Save the token mapping
    await redis.set(`session:${token}`, { user_id, bot_id }, { ex: 300 });
    
    // Set the initial status for the bot to poll
    await redis.set(`status:${bot_id}:${user_id}`, 'pending', { ex: 600 });

    res.json({ status: 'success', session_token: token });
  } catch (error) {
    console.error('Redis error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/session/status', async (req, res) => {
  // Polled by the Developer Bot
  const { user_id, bot_id } = req.query;
  if (!user_id || !bot_id) {
    return res.status(400).json({ error: 'Missing user_id or bot_id' });
  }

  try {
    const status = await redis.get(`status:${bot_id}:${user_id}`);
    if (!status) {
      return res.json({ status: 'expired_or_not_found' });
    }

    res.json({ status });
  } catch (error) {
    console.error('Redis error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/session/evaluate', async (req, res) => {
  const { token, device_hash } = req.body;
  if (!token || !device_hash) {
    return res.status(400).json({ error: 'Missing token or device_hash' });
  }

  try {
    const session = await redis.get(`session:${token}`);
    if (!session) {
      return res.status(400).json({ error: 'Session expired or invalid' });
    }

    const { user_id, bot_id } = session;
    const currentStatus = await redis.get(`status:${bot_id}:${user_id}`);
    
    if (currentStatus !== 'pending') {
      return res.status(400).json({ error: 'Session already processed' });
    }

    // Check if device hash already exists for this bot
    const existingUserId = await redis.get(`device:${bot_id}:${device_hash}`);

    if (existingUserId && String(existingUserId) !== String(user_id)) {
      // FRAUD DETECTED
      await redis.set(`status:${bot_id}:${user_id}`, 'rejected', { ex: 300 });
      return res.json({ status: 'rejected', reason: 'Device already registered to another user' });
    }

    // SUCCESS
    await redis.set(`device:${bot_id}:${device_hash}`, user_id);
    await redis.set(`status:${bot_id}:${user_id}`, 'verified', { ex: 300 });

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
