// Audio utility functions for the Gemini Live API PCM stream

/**
 * Downsamples float32 Web Audio buffer to 16kHz Int16 PCM array buffer.
 * @param {Float32Array} buffer - Raw audio channel data
 * @param {number} inputSampleRate - Current Web Audio context sample rate
 * @returns {ArrayBuffer}
 */
export function downsampleAndPCMEncode(buffer, inputSampleRate) {
  const targetSampleRate = 16000;
  if (inputSampleRate === targetSampleRate) {
    const pcmBuffer = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      pcmBuffer[i] = Math.max(-1, Math.min(1, buffer[i])) * 32767;
    }
    return pcmBuffer.buffer;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const pcmBuffer = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < pcmBuffer.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    const sample = count > 0 ? accum / count : 0;
    pcmBuffer[offsetResult] = Math.max(-1, Math.min(1, sample)) * 32767;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return pcmBuffer.buffer;
}

/**
 * Encodes an ArrayBuffer into base64 string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
