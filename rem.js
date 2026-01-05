/**
 * REM.js - Core functions for blink detection application
 */

/**
 * Calculates Euclidean distance between two points
 * @param {Object} p1 - First point with x/y or _x/_y properties
 * @param {Object} p2 - Second point with x/y or _x/_y properties
 * @returns {number} Euclidean distance
 */
function euclideanDistance(p1, p2) {
  const x1 = p1.x !== undefined ? p1.x : p1._x;
  const y1 = p1.y !== undefined ? p1.y : p1._y;
  const x2 = p2.x !== undefined ? p2.x : p2._x;
  const y2 = p2.y !== undefined ? p2.y : p2._y;

  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

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
 * Calculates the Eye Aspect Ratio (EAR) using landmark distances
 * @param {Array} points - Array of 6 eye landmark points with _x and _y properties
 * @returns {number} Eye aspect ratio (height/width)
 */
function getRatio(points) {
  // Width: distance between outer corner (0) and inner corner (3)
  const width = euclideanDistance(points[0], points[3]);

  // Height: average of two vertical distances
  const height1 = euclideanDistance(points[1], points[5]); // Top-left to bottom-left
  const height2 = euclideanDistance(points[2], points[4]); // Top-right to bottom-right
  const height = (height1 + height2) / 2;

  // Return aspect ratio
  return height / width;
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
 * Initializes dual gain nodes for audio crossfading
 * @param {AudioContext} audioContext - Web Audio API context
 * @returns {Object} { gainNode1, gainNode2 }
 */
function initializeGainNodes(audioContext) {
  const gainNode1 = audioContext.createGain();
  const gainNode2 = audioContext.createGain();

  gainNode1.connect(audioContext.destination);
  gainNode2.connect(audioContext.destination);

  gainNode1.gain.value = 0;
  gainNode2.gain.value = 0;

  return { gainNode1, gainNode2 };
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
 * Plays audio with crossfade between two sources
 * @param {AudioContext} audioContext - Web Audio API context
 * @param {AudioBuffer} audioBuffer - Decoded audio buffer
 * @param {AudioBufferSourceNode} activeSource - Currently playing source
 * @param {GainNode} activeGain - Gain node for active source
 * @param {GainNode} inactiveGain - Gain node for inactive source
 * @param {number} startTime - Time in seconds to start playback from
 * @param {number} crossfadeDuration - Crossfade duration in seconds (default 0.005)
 * @returns {AudioBufferSourceNode} New audio source node
 */
function playAudioWithCrossfade(
  audioContext,
  audioBuffer,
  activeSource,
  activeGain,
  inactiveGain,
  startTime,
  crossfadeDuration = 0.005
) {
  const now = audioContext.currentTime;
  const offset = startTime % audioBuffer.duration;

  // Create new source connected to inactive gain
  const newSource = audioContext.createBufferSource();
  newSource.buffer = audioBuffer;
  newSource.loop = true;
  newSource.loopStart = 0;
  newSource.loopEnd = audioBuffer.duration;
  newSource.connect(inactiveGain);

  // Start new source at target position with gain at 0
  inactiveGain.gain.setValueAtTime(0, now);
  newSource.start(0, offset);

  // Crossfade: fade out active, fade in inactive
  activeGain.gain.setValueAtTime(1, now);
  activeGain.gain.linearRampToValueAtTime(0, now + crossfadeDuration);

  inactiveGain.gain.setValueAtTime(0, now);
  inactiveGain.gain.linearRampToValueAtTime(1, now + crossfadeDuration);

  // Stop old source after crossfade completes
  if (activeSource) {
    setTimeout(() => {
      try {
        activeSource.stop();
      } catch (e) {
        // Source may already be stopped
      }
    }, crossfadeDuration * 1000 + 100);
  }

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
 * Draws debug visualization of eye landmarks on canvas
 * @param {HTMLCanvasElement} canvas - Canvas element to draw on
 * @param {Array} leftEyePoints - Array of left eye landmark points
 * @param {Array} rightEyePoints - Array of right eye landmark points
 */
function drawDebugLandmarks(canvas, leftEyePoints, rightEyePoints) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";

  // Draw left eye landmarks
  for (let i = 0; i < leftEyePoints.length; i++) {
    ctx.fillRect(leftEyePoints[i]._x, leftEyePoints[i]._y, 3, 3);
  }

  // Draw right eye landmarks
  for (let i = 0; i < rightEyePoints.length; i++) {
    ctx.fillRect(rightEyePoints[i]._x, rightEyePoints[i]._y, 3, 3);
  }
}

/**
 * Draws a chart showing the history of eye aspect ratios
 * @param {HTMLCanvasElement} canvas - Canvas element to draw on
 * @param {Array} lRatHistory - History of left eye aspect ratios (last 100 values)
 * @param {Array} rRatHistory - History of right eye aspect ratios (last 100 values)
 */
function drawRatioChart(canvas, lRatHistory, rRatHistory) {
  if (lRatHistory.length < 2 && rRatHistory.length < 2) return;

  const ctx = canvas.getContext("2d");
  const chartX = 20;
  const chartY = 20;
  const chartWidth = 300;
  const chartHeight = 150;

  // Draw chart background
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(chartX, chartY, chartWidth, chartHeight);

  // Draw chart border
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;
  ctx.strokeRect(chartX, chartY, chartWidth, chartHeight);

  // Find min/max for scaling
  const allValues = [...lRatHistory, ...rRatHistory];
  const minRat = Math.min(...allValues);
  const maxRat = Math.max(...allValues);
  const range = maxRat - minRat || 1;

  // Helper function to scale and position points
  const scaleY = (value) => {
    return chartY + chartHeight - ((value - minRat) / range) * chartHeight;
  };
  const scaleX = (index, total) => {
    return chartX + (index / Math.max(total - 1, 1)) * chartWidth;
  };

  // Draw left eye ratio (red)
  if (lRatHistory.length > 1) {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleX(0, lRatHistory.length), scaleY(lRatHistory[0]));
    for (let i = 1; i < lRatHistory.length; i++) {
      ctx.lineTo(scaleX(i, lRatHistory.length), scaleY(lRatHistory[i]));
    }
    ctx.stroke();
  }

  // Draw right eye ratio (cyan)
  if (rRatHistory.length > 1) {
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleX(0, rRatHistory.length), scaleY(rRatHistory[0]));
    for (let i = 1; i < rRatHistory.length; i++) {
      ctx.lineTo(scaleX(i, rRatHistory.length), scaleY(rRatHistory[i]));
    }
    ctx.stroke();
  }

  // Draw threshold line at 1.05 (blue)
  const thresholdValue = 1.05;
  if (thresholdValue >= minRat && thresholdValue <= maxRat) {
    const thresholdY = scaleY(thresholdValue);
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]); // Dashed line
    ctx.beginPath();
    ctx.moveTo(chartX, thresholdY);
    ctx.lineTo(chartX + chartWidth, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]); // Reset to solid line
  }

  // Draw labels
  ctx.fillStyle = "white";
  ctx.font = "12px monospace";
  ctx.fillText("L_RAT", chartX + 5, chartY + 15);
  ctx.fillStyle = "red";
  ctx.fillRect(chartX + 50, chartY + 7, 15, 10);
  ctx.fillStyle = "white";
  ctx.fillText("R_RAT", chartX + 70, chartY + 15);
  ctx.fillStyle = "cyan";
  ctx.fillRect(chartX + 115, chartY + 7, 15, 10);
  ctx.fillStyle = "white";
  ctx.fillText("THRESHOLD", chartX + 135, chartY + 15);
  ctx.fillStyle = "blue";
  ctx.fillRect(chartX + 205, chartY + 7, 15, 10);
}

/**
 * Handles blink event - displays random video and optionally controls audio
 * Uses dual video elements for seamless transitions and dual audio sources with crossfading
 * @param {number} bcounter - Current blink count
 * @param {number} numVideos - Total number of videos available
 * @param {AudioBuffer} audioBuffer - Decoded audio buffer
 * @param {AudioContext} audioContext - Web Audio API context
 * @param {AudioBufferSourceNode} audioSource1 - First audio source
 * @param {AudioBufferSourceNode} audioSource2 - Second audio source
 * @param {GainNode} gainNode1 - Gain node for first source
 * @param {GainNode} gainNode2 - Gain node for second source
 * @param {number} activeAudioIndex - Currently active audio source (1 or 2)
 * @param {number} activeVideoIndex - Currently visible video element (1 or 2)
 * @param {string} audioAction - 'none', 'start', or 'jump' - controls audio behavior
 * @param {number} currentVideoIndex - Currently playing video content (0-based index)
 * @returns {Object} { audioSource1, audioSource2, activeAudioIndex, activeVideoIndex, currentVideoIndex }
 */
function blink(
  bcounter,
  numVideos,
  audioBuffer,
  audioContext,
  audioSource1,
  audioSource2,
  gainNode1,
  gainNode2,
  activeAudioIndex,
  activeVideoIndex,
  audioAction,
  currentVideoIndex
) {
  // Get both video elements
  const activeVideo = document.getElementById("blinkVideo" + activeVideoIndex);
  const inactiveIndex = activeVideoIndex === 1 ? 2 : 1;
  const inactiveVideo = document.getElementById("blinkVideo" + inactiveIndex);

  // The inactive video already has the next video preloaded
  // Increment to next video sequentially (this is what's already loaded in inactive)
  const newVideoIndex = (currentVideoIndex + 1) % numVideos;

  if (inactiveVideo && activeVideo) {
    // Immediately swap to show the preloaded video
    inactiveVideo.play();
    inactiveVideo.style.opacity = "1";
    inactiveVideo.style.zIndex = "2";
    activeVideo.style.opacity = "0";
    activeVideo.style.zIndex = "1";

    // Now preload the NEXT video (after the one we just switched to) into the now-inactive element
    const nextVideoIndex = (newVideoIndex + 1) % numVideos;
    const nextFilename =
      "vid/" + String(nextVideoIndex + 1).padStart(3, "0") + ".mp4";
    activeVideo.src = nextFilename;
    activeVideo.load();
  }

  // Handle audio based on action
  let newAudioSource1 = audioSource1;
  let newAudioSource2 = audioSource2;
  let newActiveAudioIndex = activeAudioIndex;

  if (audioBuffer && audioContext && gainNode1 && gainNode2) {
    if (audioAction === "start") {
      // Start audio from beginning on source 1
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = audioBuffer.duration;
      source.connect(gainNode1);
      source.start(0, 0);

      gainNode1.gain.setValueAtTime(1, audioContext.currentTime);
      gainNode2.gain.setValueAtTime(0, audioContext.currentTime);

      newAudioSource1 = source;
      newActiveAudioIndex = 1;
    } else if (audioAction === "jump") {
      // Jump to random position with crossfade
      const randomTime = Math.random() * audioBuffer.duration;
      const activeSource = activeAudioIndex === 1 ? audioSource1 : audioSource2;
      const activeGain = activeAudioIndex === 1 ? gainNode1 : gainNode2;
      const inactiveGain = activeAudioIndex === 1 ? gainNode2 : gainNode1;
      const inactiveAudioIndex = activeAudioIndex === 1 ? 2 : 1;

      const newSource = playAudioWithCrossfade(
        audioContext,
        audioBuffer,
        activeSource,
        activeGain,
        inactiveGain,
        randomTime
      );

      if (inactiveAudioIndex === 1) {
        newAudioSource1 = newSource;
      } else {
        newAudioSource2 = newSource;
      }
      newActiveAudioIndex = inactiveAudioIndex;
    }
    // If audioAction is 'none', sources remain unchanged (audio continues)
  }

  return {
    audioSource1: newAudioSource1,
    audioSource2: newAudioSource2,
    activeAudioIndex: newActiveAudioIndex,
    activeVideoIndex: inactiveIndex,
    currentVideoIndex: newVideoIndex,
  };
}
