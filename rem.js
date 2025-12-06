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
function playAudioWithCrossfade(audioContext, audioBuffer, activeSource, activeGain, inactiveGain, startTime, crossfadeDuration = 0.005) {
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
function blink(bcounter, numVideos, audioBuffer, audioContext, audioSource1, audioSource2, gainNode1, gainNode2, activeAudioIndex, activeVideoIndex, audioAction, currentVideoIndex) {
  // Get both video elements
  const activeVideo = document.getElementById("blinkVideo" + activeVideoIndex);
  const inactiveIndex = activeVideoIndex === 1 ? 2 : 1;
  const inactiveVideo = document.getElementById("blinkVideo" + inactiveIndex);

  // Select a random video different from the current one
  let newVideoIndex;
  do {
    newVideoIndex = Math.floor(Math.random() * numVideos);
  } while (newVideoIndex === currentVideoIndex && numVideos > 1);

  const filename = "vid/" + String(newVideoIndex + 1).padStart(3, "0") + ".mp4";

  if (inactiveVideo && activeVideo) {
    // Load new video into the inactive element
    inactiveVideo.src = filename;
    inactiveVideo.load();

    // When loaded, swap visibility
    inactiveVideo.onloadeddata = function() {
      inactiveVideo.play();
      inactiveVideo.style.opacity = "1";
      inactiveVideo.style.zIndex = "2";
      activeVideo.style.opacity = "0";
      activeVideo.style.zIndex = "1";
    };
  }

  // Handle audio based on action
  let newAudioSource1 = audioSource1;
  let newAudioSource2 = audioSource2;
  let newActiveAudioIndex = activeAudioIndex;

  if (audioBuffer && audioContext && gainNode1 && gainNode2) {
    if (audioAction === 'start') {
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
    } else if (audioAction === 'jump') {
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
    currentVideoIndex: newVideoIndex
  };
}
