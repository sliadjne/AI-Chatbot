import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';

import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per minute
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/generate', limiter);

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const TARGET_URL = process.env.GEN_API_URL;
if (!TARGET_URL) {
  console.warn('Warning: GEN_API_URL not set. Set it in server/.env or env vars.');
}

app.post('/api/generate', async (req, res) => {
  try {
    if (!TARGET_URL) return res.status(500).json({ error: 'GEN_API_URL not configured on server' });

    const response = await fetch(TARGET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).send(text);
    }
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'proxy error', details: err.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Proxy listening on http://localhost:${port}`));
