/**
 * Creates and plays simple audio feedback sounds using Web Audio API
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play a simple beep sound
 * @param frequency - Frequency in Hz
 * @param duration - Duration in milliseconds
 * @param volume - Volume from 0 to 1
 */
function playBeep(frequency: number, duration: number, volume: number = 0.3): void {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);
  } catch (error) {
    console.error("Failed to play audio feedback:", error);
  }
}

/**
 * Play start recording sound (ascending beep)
 */
export function playStartSound(): void {
  playBeep(600, 100, 0.3);
  setTimeout(() => playBeep(800, 100, 0.3), 50);
}

/**
 * Play stop recording sound (descending beep)
 */
export function playStopSound(): void {
  playBeep(800, 100, 0.3);
  setTimeout(() => playBeep(600, 100, 0.3), 50);
}

/**
 * Play error sound
 */
export function playErrorSound(): void {
  playBeep(300, 200, 0.4);
}

/**
 * Play success sound
 */
export function playSuccessSound(): void {
  playBeep(500, 80, 0.3);
  setTimeout(() => playBeep(700, 80, 0.3), 60);
  setTimeout(() => playBeep(900, 120, 0.3), 120);
}