import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { execFile, spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === 'win32';
const BIN_DIR = path.join(__dirname, '../../bin');
const EXE_NAME = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp';
const EXE_PATH = path.join(BIN_DIR, EXE_NAME);
const DOWNLOAD_URL =
  `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${EXE_NAME}`;

const TMP_PATH = EXE_PATH + '.part';

function download(url, dest, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) return reject(new Error('Too many redirects'));
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    file.on('error', reject);
    protocol.get(url, { headers: { 'User-Agent': 'FX9-VOICE-Bot/3.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        file.close(() => download(res.headers.location, dest, redirectCount + 1).then(resolve).catch(reject));
        return;
      }
      if (res.statusCode !== 200) {
        file.close(() => reject(new Error(`HTTP ${res.statusCode}`)));
        return;
      }
      res.on('error', reject);
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0, lastPct = -1;
      res.on('data', chunk => {
        received += chunk.length;
        if (total) {
          const pct = Math.floor((received / total) * 100);
          if (pct !== lastPct && pct % 10 === 0) {
            process.stdout.write(`\r[yt-dlp] تحميل... ${pct}%`);
            lastPct = pct;
          }
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        process.stdout.write('\r[yt-dlp] ✅ اكتمل التحميل!        \n');
        resolve();
      });
    }).on('error', err => { file.close(() => reject(err)); });
  });
}

let _ready = false;
export async function ensureYtDlp() {
  if (_ready) return EXE_PATH;
  fs.mkdirSync(BIN_DIR, { recursive: true });
  let attempts = 0;
  while (!fs.existsSync(EXE_PATH)) {
    attempts++;
    if (attempts > 3) {
      let listing = 'ن/م';
      try { listing = fs.readdirSync(BIN_DIR).join(', '); } catch (_) {}
      console.error(`[yt-dlp] فشل التحميل بعد ${attempts} محاولات — bin/ يحتوي: ${listing}`);
      throw new Error(`Failed to download yt-dlp after ${attempts} attempts`);
    }
    try {
      console.log(`\n[yt-dlp] جاري التحميل من GitHub... (محاولة ${attempts})`);
      await download(DOWNLOAD_URL, TMP_PATH);
      const st = fs.statSync(TMP_PATH);
      if (!st.size) throw new Error('downloaded file is empty');
      fs.renameSync(TMP_PATH, EXE_PATH);
      if (!IS_WIN) fs.chmodSync(EXE_PATH, 0o755);
      console.log(`[yt-dlp] ✅ binary ready: ${EXE_PATH} (${(st.size / 1048576).toFixed(1)} MB)`);
    } catch (err) {
      console.error(`[yt-dlp] محاولة ${attempts} فشلت:`, err.message);
      try { fs.rmSync(TMP_PATH, { force: true }); } catch (_) {}
      try { fs.rmSync(EXE_PATH, { force: true }); } catch (_) {}
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  _ready = true;
  return EXE_PATH;
}

export async function getAudioUrl(videoUrl) {
  const bin = await ensureYtDlp();
  return new Promise((resolve, reject) => {
    execFile(bin, [
      '--no-playlist',
      '--no-check-certificate',
      '--no-warnings',
      '-f', 'bestaudio[protocol!*=dash][ext=webm]/bestaudio[protocol!*=dash]/bestaudio',
      '-g',
      videoUrl,
    ], { timeout: 30_000 }, (err, stdout, stderr) => {
      const lines = (stdout || '').trim().split('\n').filter(Boolean);
      if (!lines.length) {
        return reject(new Error(
          stderr?.split('\n').find(l => l.includes('ERROR')) || err?.message || 'No URL returned'
        ));
      }
      const audioUrl = lines[lines.length - 1];
      console.log(`[yt-dlp] URLs received: ${lines.length} (${lines.length > 1 ? 'DASH' : 'non-DASH'})`);
      resolve(audioUrl);
    });
  });
}

export async function getVideoInfo(videoUrl) {
  const bin = await ensureYtDlp();
  return new Promise((resolve, reject) => {
    execFile(bin, [
      '--no-playlist',
      '--no-check-certificate',
      '--no-warnings',
      '--print', '%(title)s|||%(channel)s|||%(duration)s|||%(thumbnail)s|||%(webpage_url)s',
      videoUrl,
    ], { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err || !stdout?.trim()) {
        return reject(new Error(stderr?.split('\n')[0] || err?.message || 'No info'));
      }
      const [title, channel, duration, thumbnail, url] = stdout.trim().split('|||');
      resolve({
        title: title || 'Unknown',
        author: channel || 'Unknown',
        durationSec: parseInt(duration, 10) || 0,
        thumbnail: thumbnail || null,
        url: url || videoUrl,
      });
    });
  });
}

export async function searchYtDlp(query, limit = 5) {
  let bin;
  try { bin = await ensureYtDlp(); }
  catch (err) {
    console.error('[yt-dlp] search failed to load binary:', err.message);
    return [];
  }
  return new Promise(resolve => {
    execFile(bin, [
      '--no-check-certificate',
      '--no-warnings',
      '--flat-playlist',
      '--print', '%(id)s|||%(title)s|||%(channel)s|||%(duration)s|||%(thumbnail)s',
      `ytsearch${Math.max(1, Math.min(limit, 10))}:${query}`,
    ], { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err || !stdout?.trim()) {
        console.error('[yt-dlp] search error:', err?.message || 'no output', '| stderr:', (stderr || '').split('\n').find(l => l.includes('ERROR')) || '');
        return resolve([]);
      }
      const results = stdout.trim().split('\n').filter(Boolean).map(line => {
        const [id, title, channel, duration, thumb] = line.split('|||');
        return {
          title: title || 'Unknown',
          url: `https://www.youtube.com/watch?v=${id || ''}`,
          author: channel || 'Unknown',
          durationSec: parseInt(duration, 10) || 0,
          thumbnail: thumb && thumb.startsWith('http') ? thumb : null,
        };
      });
      resolve(results);
    });
  });
}

export async function verifyYtDlp() {
  const bin = await ensureYtDlp();
  return new Promise((resolve, reject) => {
    execFile(bin, ['--version'], { timeout: 15_000 }, (err, stdout) => {
      if (err) return reject(new Error(`yt-dlp failed to run: ${err.message}`));
      resolve(stdout.trim());
    });
  });
}

export { EXE_PATH };
