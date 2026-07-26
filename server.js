require('dotenv/config');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static('public'));

app.post('/api/download', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.includes('tiktok.com')) {
      return res.status(400).json({ success: false, message: 'URL TikTok tidak valid' });
    }

    const response = await axios.post('https://tikwm.com/api/',
      new URLSearchParams({ url, hd: 1 }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );

    if (response.data.code !== 0) {
      return res.status(400).json({ success: false, message: 'Konten tidak ditemukan. Pastikan URL benar.' });
    }

    const d = response.data.data;
    const isPhoto = Array.isArray(d.images) && d.images.length > 0;

    const payload = {
      success: true,
      type: isPhoto ? 'photo' : 'video',
      data: {
        title: d.title || 'TikTok',
        cover: d.cover,
        author: d.author?.nickname || '',
        avatar: d.author?.avatar || '',
        duration: d.duration,
        isPhoto,
      },
    };

    if (isPhoto) {
      payload.data.images = d.images;
    } else {
      payload.data.play = d.play;
      payload.data.wmplay = d.wmplay;
      payload.data.music = d.music;
    }

    res.json(payload);
  } catch (err) {
    if (err.code === 'ECONNABORTED') return res.status(504).json({ success: false, message: 'Server sibuk. Coba lagi.' });
    console.error('Download error:', err);
    res.status(500).json({ success: false, message: 'Gagal download. Coba lagi nanti.' });
  }
});

app.get('/api/dl', async (req, res) => {
  const fileUrl = req.query.url;
  if (!fileUrl) return res.status(400).json({ success: false, message: 'Parameter url required' });

  try {
    const response = await axios.get(fileUrl, { responseType: 'stream', timeout: 30000 });
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const ext = contentType.includes('image') ? 'jpg' : 'mp4';
    const fileName = `tiktok_${Date.now()}.${ext}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', response.headers['content-length'] || '');

    let bytes = 0;
    response.data.on('data', (chunk) => { bytes += chunk.length; });
    response.data.on('end', () => console.log(`Proxied ${bytes} bytes`));
    response.data.pipe(res);
  } catch (err) {
    console.error('Proxy error:', err);
    if (!res.headersSent) res.status(502).json({ success: false, message: 'Gagal mengunduh.' });
  }
});

app.listen(PORT, () => {
  console.log(`TikTok Downloader running on http://localhost:${PORT}`);
});
