const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('ffmpeg-static');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegInstaller);

const input = path.join(__dirname, '..', 'welcome.wav');
const output = path.join(__dirname, '..', 'welcome.mp3');

console.log('Starting conversion...');
ffmpeg(input)
  .toFormat('mp3')
  .on('end', () => console.log('Successfully converted to welcome.mp3'))
  .on('error', (err) => console.error('Error during conversion:', err))
  .save(output);
