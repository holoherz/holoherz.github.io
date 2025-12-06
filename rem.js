/**
 * REM.js - Core functions for blink detection application
 */

/**
 * Filters an array by returning only elements at specified indices
 * @param {Array} array - Source array
 * @param {Array} subset - Array of indices to keep
 * @returns {Array} Filtered array containing only elements at subset indices
 */
function getSubset(array, subset) {
  function checkIndexInSubset(value, index) {
    return subset.includes(index);
  }
  return array.filter(checkIndexInSubset);
}

/**
 * Calculates the aspect ratio (height/width) of a bounding box around points
 * @param {Array} points - Array of landmark points with _x and _y properties
 * @param {Array} dim - Initial [x, y] dimensions for comparison
 * @returns {Array} [ratio, minX, minY, maxX, maxY]
 */
function getRatio(points, dim) {
  var x = dim[0];
  var y = dim[1];
  var w = 0;
  var h = 0;

  for (var i = 0; i < points.length; i++) {
    point = points[i];
    if (point._x > w) w = point._x;
    if (point._x < x) x = point._x;
    if (point._y > h) h = point._y;
    if (point._y < y) y = point._y;
  }

  return [(h - y) / (w - x), x, y, w, h];
}

/**
 * Preloads videos from the vid directory
 * @param {number} numVideos - Number of videos to preload
 * @returns {Array} Array of video filenames
 */
function precacheVideos(numVideos) {
  const videoCache = [];
  for (let i = 0; i < numVideos; i++) {
    const filename = "vid/" + String(i + 1).padStart(3, "0") + ".mp4";
    videoCache.push(filename);
  }
  return videoCache;
}

/**
 * Loads and decodes an audio file
 * @param {string} audioPath - Path to the audio file
 * @returns {Promise<Object>} Object containing audioContext and audioBuffer
 */
async function loadAudio(audioPath) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const response = await fetch(audioPath);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return { audioContext, audioBuffer };
}

/**
 * Plays audio from a specific start time with looping
 * @param {AudioContext} audioContext - Web Audio API context
 * @param {AudioBuffer} audioBuffer - Decoded audio buffer
 * @param {AudioBufferSourceNode} currentSource - Current playing source (will be stopped)
 * @param {number} startTime - Time in seconds to start playback from
 * @returns {AudioBufferSourceNode} New audio source node
 */
function playAudioFrom(audioContext, audioBuffer, currentSource, startTime) {
  if (currentSource) {
    currentSource.stop();
  }

  const newSource = audioContext.createBufferSource();
  newSource.buffer = audioBuffer;
  newSource.loop = true;
  newSource.loopStart = 0;
  newSource.loopEnd = audioBuffer.duration;
  newSource.connect(audioContext.destination);

  const offset = startTime % audioBuffer.duration;
  newSource.start(0, offset);

  return newSource;
}

/**
 * Updates FPS tracking statistics using exponential moving average
 * @param {number} lastTimestamp - Previous timestamp
 * @param {number} avgDelta - Current average delta
 * @param {number} timestamp - Current timestamp
 * @returns {Object} Updated { lastTimestamp, avgDelta }
 */
function updateTimeStats(lastTimestamp, avgDelta, timestamp) {
  if (lastTimestamp == 0) {
    lastTimestamp = timestamp;
  }

  var delta = timestamp - lastTimestamp;
  lastTimestamp = timestamp;
  avgDelta = avgDelta * 0.9 + delta * 0.1;

  return { lastTimestamp, avgDelta };
}

/**
 * Handles blink event - displays random video and plays audio from random position
 * @param {number} bcounter - Current blink count
 * @param {number} numVideos - Total number of videos available
 * @param {AudioBuffer} audioBuffer - Decoded audio buffer
 * @param {AudioContext} audioContext - Web Audio API context
 * @param {AudioBufferSourceNode} currentSource - Current playing audio source
 * @returns {AudioBufferSourceNode} New audio source node
 */
function blink(bcounter, numVideos, audioBuffer, audioContext, currentSource) {
  const randomIndex = Math.floor(Math.random() * numVideos);
  const filename = "vid/" + String(randomIndex + 1).padStart(3, "0") + ".mp4";
  const videoElement = document.getElementById("blinkVideo");

  if (videoElement) {
    videoElement.src = filename;
    videoElement.load();
    videoElement.play();
  }

  // Jump to random position in audio
  if (audioBuffer) {
    const randomTime = Math.random() * audioBuffer.duration;
    return playAudioFrom(audioContext, audioBuffer, currentSource, randomTime);
  }

  return currentSource;
}
