const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
