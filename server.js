const express = require('express');
const cors = require('cors');
const { scanPage } = require('./scanner.js');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

app.post('/api/scan', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" in request body' });
  }

  try {
    console.log(`Scanning: ${url}`);
    const result = await scanPage(url);
    res.json(result);
  } catch (err) {
    console.error('Scan failed:', err.message);
    res.status(500).json({ error: 'Scan failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Cookie scanner API running on http://localhost:${PORT}`);
});
