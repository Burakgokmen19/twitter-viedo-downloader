document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const errorMsg = document.getElementById('errorMsg');
  const resultsSection = document.getElementById('results');

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      urlInput.value = text;
      urlInput.focus();
    } catch {
      urlInput.focus();
      urlInput.select();
    }
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchVideo();
  });

  downloadBtn.addEventListener('click', fetchVideo);

  async function fetchVideo() {
    const url = urlInput.value.trim();
    if (!url) {
      showError('Please enter a Twitter/X video link.');
      return;
    }

    if (!/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url)) {
      showError('Invalid link format. Example: https://x.com/user/status/123456789');
      return;
    }

    setLoading(true);
    hideError();
    hideResults();

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        showError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      showResults(data);
    } catch {
      showError('Connection error. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function showResults(data) {
    const { tweet, downloads } = data;

    const avatar = document.getElementById('tweetAvatar');
    if (tweet.avatar) {
      avatar.src = tweet.avatar;
      avatar.style.display = 'block';
    } else {
      avatar.style.display = 'none';
    }

    document.getElementById('tweetAuthor').textContent = tweet.author;
    document.getElementById('tweetUsername').textContent = tweet.username ? `@${tweet.username}` : '';
    document.getElementById('tweetText').textContent = tweet.text;

    const thumbnail = document.getElementById('videoThumbnail');
    const videoPreview = document.querySelector('.video-preview');
    if (tweet.thumbnail) {
      thumbnail.src = tweet.thumbnail;
      videoPreview.style.display = 'block';
    } else {
      videoPreview.style.display = 'none';
    }

    const optionsContainer = document.getElementById('downloadOptions');
    optionsContainer.innerHTML = '';

    downloads.forEach((dl) => {
      const option = document.createElement('div');
      option.className = 'download-option';

      option.innerHTML = `
        <div class="download-option-left">
          <div class="download-option-icon" style="background: ${dl.color}20">
            ${dl.icon}
          </div>
          <div class="download-option-info">
            <h4>${dl.label}</h4>
            <span>${dl.quality} • MP4</span>
          </div>
        </div>
        <button class="download-option-btn" data-url="${encodeURIComponent(dl.url)}">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="7,10 12,15 17,10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Download
        </button>
      `;

      const btn = option.querySelector('.download-option-btn');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const videoUrl = decodeURIComponent(btn.dataset.url);
        downloadVideo(videoUrl);
      });

      option.addEventListener('click', () => {
        const videoUrl = decodeURIComponent(btn.dataset.url);
        downloadVideo(videoUrl);
      });

      optionsContainer.appendChild(option);
    });

    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function downloadVideo(url) {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = `twitter-video-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function setLoading(loading) {
    const btnText = downloadBtn.querySelector('.btn-text');
    const btnLoader = downloadBtn.querySelector('.btn-loader');
    const btnArrow = downloadBtn.querySelector('.btn-arrow');

    if (loading) {
      btnText.style.display = 'none';
      btnArrow.style.display = 'none';
      btnLoader.style.display = 'flex';
      downloadBtn.disabled = true;
    } else {
      btnText.style.display = 'inline';
      btnArrow.style.display = 'block';
      btnLoader.style.display = 'none';
      downloadBtn.disabled = false;
    }
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  }

  function hideError() {
    errorMsg.style.display = 'none';
  }

  function hideResults() {
    resultsSection.style.display = 'none';
  }

  // FAQ accordion
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
      if (!isActive) item.classList.add('active');
    });
  });
});
