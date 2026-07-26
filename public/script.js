function loading(btn, on) {
  if (!btn) return;
  btn.classList.toggle('loading', on);
  btn.disabled = on;
}

function toast(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast ' + (type || '') + ' show';
  setTimeout(() => el.classList.remove('show'), 5000);
}

/* ====== Email check ====== */
function checkEmail(input, hint) {
  input.addEventListener('blur', async () => {
    const v = input.value.trim();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      if (v) { input.className = 'invalid'; if (hint) { hint.textContent = 'FORMAT SALAH'; hint.className = 'hint error'; } }
      return;
    }
    if (hint) { hint.textContent = 'MEMERIKSA...'; hint.className = 'hint'; }
    try {
      const r = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: v }),
      });
      const d = await r.json();
      if (d.valid) {
        input.className = 'valid';
        if (hint) { hint.textContent = '✓ VALID'; hint.className = 'hint success'; }
      } else {
        input.className = 'invalid';
        if (hint) { hint.textContent = d.reason.toUpperCase(); hint.className = 'hint error'; }
      }
    } catch { if (hint) { hint.textContent = 'GAGAL CEK'; hint.className = 'hint error'; } }
  });
  input.addEventListener('input', () => { input.className = ''; if (hint) hint.textContent = ''; });
}

/* ====== OTP ====== */
function bindOtp(digits) {
  digits.forEach((d, i) => {
    d.addEventListener('input', (e) => {
      d.value = e.target.value.replace(/\D/, '').slice(0, 1);
      d.classList.toggle('filled', !!d.value);
      if (d.value && i < digits.length - 1) digits[i + 1].focus();
    });
    d.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !d.value && i > 0) { digits[i - 1].focus(); digits[i - 1].value = ''; digits[i - 1].classList.remove('filled'); }
      if (e.key === 'ArrowLeft' && i > 0) digits[i - 1].focus();
      if (e.key === 'ArrowRight' && i < digits.length - 1) digits[i + 1].focus();
    });
    d.addEventListener('paste', (e) => {
      e.preventDefault();
      const p = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      if (!p) return;
      digits.forEach((x, j) => { x.value = p[j] || ''; x.classList.toggle('filled', !!x.value); });
      const next = Array.from(digits).findIndex(x => !x.value);
      if (next >= 0) digits[next].focus(); else digits[5].focus();
    });
  });
}

let otpTimer = null;
let otpExpires = 0;

function startTimer(el) {
  stopTimer();
  otpExpires = Date.now() + 300000;
  otpTimer = setInterval(() => {
    const r = Math.max(0, otpExpires - Date.now());
    el.textContent = `${Math.floor(r/60000)}:${Math.floor((r%60000)/1000).toString().padStart(2,'0')}`;
    if (r <= 0) { stopTimer(); el.textContent = '0:00'; }
  }, 200);
}

function stopTimer() { if (otpTimer) { clearInterval(otpTimer); otpTimer = null; } }

/* ====== LOGIN ====== */
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const email = document.getElementById('email');
  const pass = document.getElementById('password');
  const btn = document.getElementById('loginBtn');
  const t = document.getElementById('toast');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loading(btn, true);
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), password: pass.value }),
      });
      const d = await r.json();
      if (d.success) { window.location.href = '/dashboard.html'; }
      else { toast(t, d.message.toUpperCase(), 'error'); }
    } catch { toast(t, 'GAGAL TERHUBUNG', 'error'); }
    finally { loading(btn, false); }
  });
}

/* ====== REGISTER ====== */
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  const email = document.getElementById('email');
  const pass = document.getElementById('password');
  const confirm = document.getElementById('passwordConfirm');
  const btn = document.getElementById('registerBtn');
  const t = document.getElementById('toast');
  const hint = document.getElementById('emailHint');
  const wrap = document.getElementById('otpWrap');
  const digits = wrap ? wrap.querySelectorAll('.otp-digits input') : [];
  const verifyBtn = document.getElementById('verifyBtn');
  const resendBtn = document.getElementById('resendBtn');
  const timer = document.getElementById('otpTimer');

  let currentEmail = '';
  let emailOk = false;

  checkEmail(email, hint);
  email.addEventListener('blur', () => { emailOk = email.className === 'valid'; });
  bindOtp(digits);

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const em = email.value.trim();
    const pw = pass.value;
    const cf = confirm.value;

    if (!emailOk) { toast(t, 'CEK EMAIL DULU', 'error'); email.focus(); return; }
    if (pw !== cf) { toast(t, 'PASSWORD TIDAK COCOK', 'error'); pass.focus(); return; }
    if (pw.length < 6) { toast(t, 'MIN 6 KARAKTER', 'error'); pass.focus(); return; }

    loading(btn, true);
    try {
      const r = await fetch('/api/register-send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, password: pw }),
      });
      const d = await r.json();
      if (d.success) {
        currentEmail = em;
        email.disabled = true; pass.disabled = true; confirm.disabled = true;
        btn.querySelector('.label').textContent = 'TERKIRIM'; btn.disabled = true;
        document.getElementById('otpEmail').textContent = em;
        wrap.classList.add('show');
        startTimer(timer);
        digits[0]?.focus();
      } else {
        toast(t, d.message.toUpperCase(), 'error');
      }
    } catch { toast(t, 'GAGAL TERHUBUNG', 'error'); }
    finally { loading(btn, false); }
  });

  if (verifyBtn) {
    verifyBtn.addEventListener('click', async () => {
      const code = Array.from(digits).map(d => d.value).join('');
      if (code.length !== 6) { toast(t, 'MASUKKAN 6 DIGIT', 'error'); return; }
      loading(verifyBtn, true);
      try {
        const r = await fetch('/api/register-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentEmail, otp: code }),
        });
        const d = await r.json();
        if (d.success) { stopTimer(); window.location.href = '/dashboard.html'; }
        else { toast(t, d.message.toUpperCase(), 'error'); digits.forEach(x => { x.value = ''; x.classList.remove('filled'); }); digits[0].focus(); }
      } catch { toast(t, 'GAGAL TERHUBUNG', 'error'); }
      finally { loading(verifyBtn, false); }
    });
  }

  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      if (!currentEmail) return;
      loading(resendBtn, true);
      try {
        const r = await fetch('/api/register-send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentEmail, password: pass.value }),
        });
        const d = await r.json();
        if (d.success) { startTimer(timer); }
        else { toast(t, d.message.toUpperCase(), 'error'); }
      } catch { toast(t, 'GAGAL', 'error'); }
      finally { loading(resendBtn, false); }
    });
  }
}

/* ====== DASHBOARD ====== */
const downloadBtn = document.getElementById('downloadBtn');
if (downloadBtn) {
  const urlInput = document.getElementById('tiktokUrl');
  const t = document.getElementById('toast');
  const resultCard = document.getElementById('resultCard');
  const cover = document.getElementById('resultCover');
  const author = document.getElementById('resultAuthor');
  const title = document.getElementById('resultTitle');
  const dur = document.getElementById('durationText');
  const resultType = document.getElementById('resultType');
  const resultMeta = document.getElementById('resultMeta');
  const dlNowm = document.getElementById('downloadNoWatermark');
  const dlWm = document.getElementById('downloadWatermark');
  const dlMusic = document.getElementById('downloadMusic');
  const logoutBtn = document.getElementById('logoutBtn');
  const navEmail = document.getElementById('navEmail');
  const limitBanner = document.getElementById('limitBanner');
  const photoGrid = document.getElementById('photoGrid');
  const resultDl = document.getElementById('resultDl');

  let isLoggedIn = false;

  async function fetchLimit() {
    try {
      const r = await fetch('/api/limit');
      const d = await r.json();
      if (d.isUnlimited) {
        isLoggedIn = true;
        limitBanner.innerHTML = '<div class="banner"><span style="font-size:1.2rem">∞</span> Download unlimited <span style="margin-left:auto;font-size:0.7rem;opacity:0.6">PREMIUM</span></div>';
      } else {
        const left = d.limit - d.used;
        const usedClass = d.used > 0 ? 'used' : 'dim';
        const leftClass = left <= 0 ? 'used' : '';
        limitBanner.innerHTML = `
          <div class="banner">
            <span class="num ${usedClass}">${d.used}</span>
            <span style="font-size:0.6rem;opacity:0.4">/</span>
            <span class="num ${leftClass}">${left}</span>
            <span style="flex:1">GRATIS</span>
            ${left <= 0 ? '<a href="/login.html" class="btn btn-primary btn-sm">LOGIN</a>' : ''}
          </div>`;
      }
    } catch {}
  }

  (async () => {
    try {
      const r = await fetch('/api/me');
      const d = await r.json();
      if (d.success) {
        isLoggedIn = true;
        if (navEmail) navEmail.textContent = d.user.email;
      }
      fetchLimit();
    } catch { window.location.href = '/'; }
  })();

  const go = async () => {
    const u = urlInput.value.trim();
    if (!u) { toast(t, 'MASUKKAN URL', 'error'); urlInput.focus(); return; }

    loading(downloadBtn, true);
    resultCard.classList.remove('show');
    photoGrid.innerHTML = '';
    photoGrid.style.display = 'none';
    resultDl.style.display = 'flex';

    try {
      const r = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });

      if (r.status === 403) {
        const d = await r.json();
        toast(t, d.message.toUpperCase(), 'error');
        fetchLimit();
        return;
      }

      const d = await r.json();
      if (!d.success) { toast(t, d.message.toUpperCase(), 'error'); return; }

      const v = d.data;
      cover.src = v.cover;
      author.textContent = v.author ? '@' + v.author : 'TIKTOK';
      title.textContent = v.title || 'TIKTOK';
      fetchLimit();
      resultCard.classList.add('show');

      if (d.type === 'photo') {
        resultType.textContent = 'FOTO (' + v.images.length + ')';
        resultMeta.textContent = v.author ? '@' + v.author : 'TIKTOK';
        dur.textContent = '--';
        photoGrid.style.display = 'grid';
        photoGrid.innerHTML = v.images.map((img, i) =>
          `<img src="${img}" alt="Foto ${i+1}" onclick="window.open('/api/dl?url=${encodeURIComponent(img)}','_blank')" />`
        ).join('');
        dlNowm.style.display = 'none';
        dlWm.style.display = 'none';
        dlMusic.style.display = 'none';
        resultDl.style.display = 'none';
      } else {
        resultType.textContent = 'VIDEO';
        const mins = v.duration ? Math.floor(v.duration/60) : 0;
        const secs = v.duration ? v.duration % 60 : 0;
        dur.textContent = mins + ':' + secs.toString().padStart(2,'0');
        resultMeta.textContent = 'DURASI: ' + dur.textContent;
        dlNowm.href = '/api/dl?url=' + encodeURIComponent(v.play);
        dlWm.href = '/api/dl?url=' + encodeURIComponent(v.wmplay);
        dlNowm.style.display = 'flex';
        dlWm.style.display = 'flex';
        dlMusic.style.display = v.music ? 'flex' : 'none';
        resultDl.style.display = 'flex';
        if (v.music) dlMusic.onclick = () => { const a = document.createElement('a'); a.href = '/api/dl?url=' + encodeURIComponent(v.music); a.download = 'music.mp3'; a.click(); };
      }
    } catch { toast(t, 'GAGAL DOWNLOAD', 'error'); }
    finally { loading(downloadBtn, false); }
  };

  downloadBtn.addEventListener('click', go);
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });
  }
}
