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

/* ====== DOWNLOAD ====== */
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
  const photoGrid = document.getElementById('photoGrid');
  const resultDl = document.getElementById('resultDl');

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

      const d = await r.json();
      if (!d.success) { toast(t, d.message.toUpperCase(), 'error'); return; }

      const v = d.data;
      cover.src = v.cover;
      author.textContent = v.author ? '@' + v.author : 'TIKTOK';
      title.textContent = v.title || 'TIKTOK';
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
}
