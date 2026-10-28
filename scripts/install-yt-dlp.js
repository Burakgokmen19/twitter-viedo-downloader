const fs = require('fs');
const path = require('path');
const { downloadYtDlp } = require('yt-dlp-dl');

const binaryDirectory = path.join(__dirname, '..', 'node_modules', 'yt-dlp-bin');

fs.mkdirSync(binaryDirectory, { recursive: true });

downloadYtDlp(binaryDirectory)
  .then(() => {
    console.log('yt-dlp is ready.');
  })
  .catch(error => {
    console.error('Failed to install yt-dlp:', error.message);
    process.exitCode = 1;
  });
