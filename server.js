require('dotenv/config');
const express = require('express');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const dns = require('dns');
const util = require('util');
const axios = require('axios');
const db = require('./db');

const resolveMx = util.promisify(dns.resolveMx);

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const otpStore = new Map();
const anonDl = new Map();

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.com',
  'yopmail.com', 'sharklasers.com', 'trashmail.com', '10minutemail.com',
  'getairmail.com', 'temp-mail.org', 'spambox.com', 'maildrop.cc',
  'dispostable.com', 'mailnator.com', 'mailexpire.com', 'tempinbox.com',
]);

const DL_LIMIT = 3;

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function optionalAuth(req, res, next) {
  const token = req.cookies.session;
  if (!token) { req.user = null; return next(); }
  const session = db.findSession.get(token);
  req.user = session ? { id: session.user_id, email: session.email } : null;
  next();
}

function auth(req, res, next) {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ success: false, message: 'Belum login' });
  const session = db.findSession.get(token);
  if (!session) return res.status(401).json({ success: false, message: 'Sesi habis, login ulang' });
  req.user = { id: session.user_id, email: session.email };
  next();
}

app.post('/api/check-email', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.json({ valid: false, reason: 'Format email tidak valid' });
  }
  const domain = email.split('@')[1].toLowerCase();
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return res.json({ valid: false, reason: 'Email sekali pakai tidak diizinkan' });
  }
  try {
    const mx = await resolveMx(domain);
    if (!mx || mx.length === 0) return res.json({ valid: false, reason: 'Domain email tidak ditemukan' });
    res.json({ valid: true });
  } catch {
    res.json({ valid: false, reason: 'Domain email tidak terdaftar' });
  }
});

app.post('/api/register-send-otp', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Email tidak valid' });
    if (!password || password.length < 6) return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
    if (db.findUserByEmail.get(email)) return res.status(400).json({ success: false, message: 'Email sudah terdaftar' });

    const otp = generateOtp();
    const hashed = await bcrypt.hash(password, 10);
    otpStore.set(email, { otp, hashed, expiresAt: Date.now() + 5 * 60 * 1000 });

    await transporter.sendMail({
      from: `"TikTok Downloader" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Kode verifikasi akun TikTok Downloader',
      html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media only screen and (max-width:480px){ .wrap{padding:16px!important} .inner{padding:28px 20px!important} .code{font-size:32px!important;letter-spacing:8px!important} }
</style></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;background:#f0ede6">
<table class="wrap" role="presentation" width="100%" style="max-width:480px;background:#fff;border:3px solid #000">
<tr><td style="background:#ff3366;padding:32px 24px;text-align:center;border-bottom:3px solid #000">
  <div style="width:52px;height:52px;background:#000;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">
    <span style="color:#fff;font-size:26px;font-weight:900">♪</span>
  </div>
  <h1 style="color:#fff;font-size:22px;font-weight:900;margin:0;text-transform:uppercase">Kode Verifikasi</h1>
  <p style="color:rgba(255,255,255,.7);font-size:13px;margin:6px 0 0;font-weight:600;text-transform:uppercase">TikTok Downloader</p>
</td></tr>
<tr><td class="inner" style="padding:36px 28px">
  <p style="font-size:14px;color:#111;margin:0 0 24px;line-height:1.6">Gunakan kode berikut untuk menyelesaikan pendaftaran akun Anda.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#f0ede6;padding:28px 20px;border:2px solid #000">
    <p style="font-size:10px;color:#111;margin:0 0 10px;letter-spacing:2px;text-transform:uppercase;font-weight:700">Kode OTP</p>
    <div class="code" style="font-size:42px;font-weight:900;color:#111;letter-spacing:10px;font-family:'Courier New',monospace;text-align:center">${otp}</div>
  </td></tr></table>
  <p style="font-size:12px;color:#666;margin:20px 0 0;line-height:1.5">Kode berlaku <strong>5 menit</strong>. Jangan bagikan kode ini kepada siapa pun.</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f0ede6;border-top:2px solid #000">
  <p style="font-size:11px;color:#666;margin:0;text-align:center">Abaikan email ini jika Anda tidak mendaftar.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`,
    });

    console.log(`OTP sent to ${email}: ${otp}`);
    res.json({ success: true, message: 'Kode OTP telah dikirim ke email Anda' });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ success: false, message: 'Gagal kirim OTP. Coba lagi nanti.' });
  }
});

app.post('/api/register-verify', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, message: 'Email dan OTP harus diisi' });

  const stored = otpStore.get(email);
  if (!stored) return res.status(400).json({ success: false, message: 'OTP tidak ditemukan. Kirim ulang.' });
  if (Date.now() > stored.expiresAt) { otpStore.delete(email); return res.status(400).json({ success: false, message: 'OTP kedaluwarsa. Kirim ulang.' }); }
  if (stored.otp !== otp) return res.status(400).json({ success: false, message: 'Kode OTP salah' });

  try {
    db.createUser.run(email, stored.hashed);
    otpStore.delete(email);
    const user = db.findUserByEmail.get(email);
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600000).toISOString();
    db.createSession.run(user.id, token, expiresAt);
    res.cookie('session', token, { httpOnly: true, maxAge: 30 * 24 * 3600000, sameSite: 'lax' });
    res.json({ success: true, message: 'Akun berhasil dibuat!' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Gagal mendaftar. Coba lagi.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email dan password harus diisi' });

    const user = db.findUserByEmail.get(email);
    if (!user) return res.status(400).json({ success: false, message: 'Email belum terdaftar' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ success: false, message: 'Password salah' });

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600000).toISOString();
    db.createSession.run(user.id, token, expiresAt);
    res.cookie('session', token, { httpOnly: true, maxAge: 30 * 24 * 3600000, sameSite: 'lax' });
    res.json({ success: true, message: 'Selamat datang kembali!' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Gagal login' });
  }
});

app.post('/api/logout', auth, (req, res) => {
  db.deleteSession.run(req.cookies.session);
  res.clearCookie('session');
  res.json({ success: true, message: 'Berhasil keluar' });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.get('/api/limit', optionalAuth, (req, res) => {
  if (req.user) return res.json({ used: 0, limit: 0, isUnlimited: true });
  const key = req.ip;
  const track = anonDl.get(key);
  const used = track ? track.count : 0;
  res.json({ used, limit: DL_LIMIT, isUnlimited: false });
});

app.post('/api/download', optionalAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.includes('tiktok.com')) {
      return res.status(400).json({ success: false, message: 'URL TikTok tidak valid' });
    }

    if (!req.user) {
      const key = req.ip;
      const now = Date.now();
      let track = anonDl.get(key);
      if (!track || now > track.resetAt) {
        track = { count: 0, resetAt: now + 86400000 };
      }
      if (track.count >= DL_LIMIT) {
        return res.status(403).json({ success: false, limit: true, used: track.count, limit: DL_LIMIT, message: 'Batas 3x download gratis habis. Login untuk unlimited.' });
      }
      track.count += 1;
      anonDl.set(key, track);
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

app.get('/api/dl', auth, async (req, res) => {
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
    response.data.on('end', () => console.log(`Proxied ${bytes} bytes for ${req.user?.email || 'anon'}`));
    response.data.pipe(res);
  } catch (err) {
    console.error('Proxy error:', err);
    if (!res.headersSent) res.status(502).json({ success: false, message: 'Gagal mengunduh.' });
  }
});

app.listen(PORT, () => {
  console.log(`TikTok Downloader running on http://localhost:${PORT}`);
});
