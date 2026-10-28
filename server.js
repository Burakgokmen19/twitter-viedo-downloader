const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const ytDlpPath = path.join(
  __dirname,
  'node_modules',
  'yt-dlp-bin',
  process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function extractTweetId(url) {
  const patterns = [
    /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/,
    /(?:twitter\.com|x\.com)\/i\/status\/(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function validatePlatformUrl(value, platform) {
  if (typeof value !== 'string' || value.length > 2048) return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;

  const hostname = url.hostname.toLowerCase();
  if (platform === 'instagram') {
    const allowedHosts = ['instagram.com', 'www.instagram.com'];
    const validPath = /^\/(?:reel|reels|p|tv)\/[A-Za-z0-9_-]+\/?/i.test(url.pathname);
    return allowedHosts.includes(hostname) && validPath ? `${url.origin}${url.pathname}` : null;
  }

  if (platform === 'tiktok') {
    const allowedHosts = [
      'tiktok.com',
      'www.tiktok.com',
      'm.tiktok.com',
      'vm.tiktok.com',
      'vt.tiktok.com'
    ];
    const shortLink = ['vm.tiktok.com', 'vt.tiktok.com'].includes(hostname)
      && /^\/[A-Za-z0-9]+\/?$/i.test(url.pathname);
    const videoLink = /^\/@[^/]+\/video\/\d+\/?/i.test(url.pathname)
      || /^\/t\/[A-Za-z0-9_-]+\/?$/i.test(url.pathname);
    return allowedHosts.includes(hostname) && (shortLink || videoLink) ? `${url.origin}${url.pathname}` : null;
  }

  return null;
}

function getVideoInfo(url, platform) {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const child = spawn(ytDlpPath, [
      '--ignore-config',
      '--force-ipv4',
      '--dump-single-json',
      '--skip-download',
      '--no-playlist',
      '--no-warnings',
      '--retries',
      '1',
      '--extractor-retries',
      '1',
      '--socket-timeout',
      '12',
      '--user-agent',
      userAgent,
      '--referer',
      `https://${platform}.com/`,
      '--format',
      'best[ext=mp4]/best',
      url
    ], { windowsHide: true });

    const output = [];
    let outputSize = 0;
    let stderr = '';
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 35000);

    child.stdout.on('data', chunk => {
      outputSize += chunk.length;
      if (outputSize > 5 * 1024 * 1024) child.kill();
      else output.push(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr = `${stderr}${chunk}`.slice(-2000);
    });
    child.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0 || outputSize > 5 * 1024 * 1024) {
        const error = new Error(stderr.trim() || `yt-dlp exited with ${code}`);
        error.code = timedOut ? 'ETIMEDOUT' : '';
        reject(error);
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(output).toString('utf8')));
      } catch (error) {
        reject(new Error(`Could not parse video metadata: ${error.message}`));
      }
    });
  });
}

function getPlatformErrorMessage(error) {
  if (error.code === 'ENOENT') {
    return 'Sunucuda video indirme aracı bulunamadı. Yeniden deploy edip tekrar dene.';
  }

  if (error.code === 'ETIMEDOUT' || /timed out|curl: \(28\)|resolving timed out/i.test(error.message)) {
    return 'Instagram/TikTok sunucusuna zamanında ulaşılamadı. Biraz sonra tekrar dene.';
  }

  if (/login required|log in|private|not available|age.?restricted/i.test(error.message)) {
    return 'Bu video herkese açık olmayabilir veya platform oturum isteyebilir.';
  }

  if (/unsupported url|no suitable extractor/i.test(error.message)) {
    return 'Bu bağlantı biçimi desteklenmiyor. Video bağlantısını doğrudan kopyalayıp tekrar dene.';
  }

  return 'Video alınamadı. Bağlantının herkese açık olduğunu kontrol edip tekrar dene.';
}

app.post('/api/platform/download', async (req, res) => {
  const { url, platform } = req.body || {};
  const videoUrl = validatePlatformUrl(url, platform);
  if (!videoUrl) {
    return res.status(400).json({ error: 'Geçerli bir Instagram Reels veya TikTok video bağlantısı gir.' });
  }

  try {
    const info = await getVideoInfo(videoUrl, platform);

    if (!info || info._type === 'playlist' || (!info.url && !info.formats?.length)) {
      return res.status(404).json({ error: 'Bu bağlantıda indirilebilir bir video bulunamadı.' });
    }

    const downloadUrl = `/api/platform-video?platform=${platform}&url=${encodeURIComponent(videoUrl)}`;
    res.json({
      success: true,
      tweet: {
        author: info.uploader || info.channel || platform,
        username: info.uploader_id || '',
        avatar: '',
        text: info.title || info.description || '',
        thumbnail: info.thumbnail || ''
      },
      downloads: [{
        url: downloadUrl,
        quality: info.height ? `${info.height}p` : 'MP4',
        label: 'Video',
        icon: '↓',
        color: '#284b39'
      }]
    });
  } catch (error) {
    console.error('Platform video lookup error:', error.message);
    res.status(502).json({ error: getPlatformErrorMessage(error) });
  }
});

app.get('/api/platform-video', (req, res) => {
  const { url, platform } = req.query;
  const videoUrl = validatePlatformUrl(url, platform);
  if (!videoUrl) {
    return res.status(400).send('Geçerli bir Instagram veya TikTok video bağlantısı gerekli.');
  }

  const child = spawn(ytDlpPath, [
    '--ignore-config',
    '--force-ipv4',
    '--format',
    'best[ext=mp4]/best',
    '--output',
    '-',
    '--max-filesize',
    '100M',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    '--retries',
    '1',
    '--extractor-retries',
    '1',
    '--socket-timeout',
    '12',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    '--referer',
    `https://${platform}.com/`,
    videoUrl
  ], { windowsHide: true });

  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr = `${stderr}${chunk}`.slice(-2000);
  });
  child.on('error', error => {
    console.error('Platform video download error:', error.message);
    if (!res.headersSent) res.status(503).send('Video indirme aracı başlatılamadı.');
    else res.destroy(error);
  });
  child.on('close', code => {
    if (code !== 0) {
      console.error('Platform video download failed:', stderr.trim() || `yt-dlp exited with ${code}`);
      if (!res.headersSent) res.status(502).send('Video indirilemedi. Bağlantıyı kontrol edip tekrar dene.');
      else if (!res.writableEnded) res.destroy();
    }
  });
  res.on('close', () => {
    if (!res.writableEnded && child.exitCode === null) child.kill();
  });

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="social-video-${Date.now()}.mp4"`);
  const timeout = setTimeout(() => child.kill(), 120000);
  child.on('close', () => clearTimeout(timeout));
  child.stdout.pipe(res);
});

app.post('/api/download', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Please enter a Twitter/X video link.' });
    }

    const tweetId = extractTweetId(url);
    if (!tweetId) {
      return res.status(400).json({ error: 'Invalid Twitter/X link. Please enter a valid tweet link.' });
    }

    const apiUrl = `https://api.fxtwitter.com/status/${tweetId}`;
    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'TwitterVideoDownloader/1.0' }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch tweet info.');
    }

    const data = await response.json();
    const tweet = data.tweet;

    if (!tweet || !tweet.media || !tweet.media.videos || tweet.media.videos.length === 0) {
      return res.status(404).json({ error: 'No video found in this tweet. Please enter a link to a tweet with a video.' });
    }

    const video = tweet.media.videos[0];
    const variants = [];

    if (video.variants) {
      video.variants
        .filter(v => v.content_type === 'video/mp4' || v.url?.endsWith('.mp4'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        .forEach(v => {
          const heightMatch = v.url?.match(/\/(\d+)x(\d+)\//);
          const height = heightMatch ? parseInt(heightMatch[2]) : null;
          variants.push({
            url: v.url,
            quality: height ? `${height}p` : 'MP4',
            bitrate: v.bitrate || 0
          });
        });
    }

    if (variants.length === 0 && video.url) {
      variants.push({
        url: video.url,
        quality: video.height ? `${video.height}p` : 'HD',
        bitrate: 0
      });
    }

    const qualityLabels = {
      high: { label: 'High Quality', icon: '🔥', color: '#B8A9E8' },
      medium: { label: 'Medium Quality', icon: '✨', color: '#F2B5D4' },
      low: { label: 'Low Quality', icon: '💫', color: '#A8D8EA' }
    };

    let downloads = [];
    if (variants.length >= 3) {
      downloads = [
        { ...variants[0], ...qualityLabels.high },
        { ...variants[Math.floor(variants.length / 2)], ...qualityLabels.medium },
        { ...variants[variants.length - 1], ...qualityLabels.low }
      ];
    } else if (variants.length === 2) {
      downloads = [
        { ...variants[0], ...qualityLabels.high },
        { ...variants[1], ...qualityLabels.low }
      ];
    } else if (variants.length === 1) {
      downloads = [
        { ...variants[0], ...qualityLabels.high }
      ];
    }

    res.json({
      success: true,
      tweet: {
        author: tweet.author?.name || 'Unknown',
        username: tweet.author?.screen_name || '',
        avatar: tweet.author?.avatar_url || '',
        text: tweet.text || '',
        thumbnail: video.thumbnail_url || tweet.media?.photos?.[0]?.url || ''
      },
      downloads
    });

  } catch (error) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: 'An error occurred while fetching video info. Please try again.' });
  }
});

app.get('/api/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://twitter.com/'
      }
    });

    if (!response.ok) throw new Error('Failed to download video');

    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="twitter-video-${Date.now()}.mp4"`);

    if (response.headers.get('content-length')) {
      res.setHeader('Content-Length', response.headers.get('content-length'));
    }

    response.body.pipe(res);
  } catch (error) {
    console.error('Proxy Error:', error.message);
    res.status(500).send('Video download error');
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
