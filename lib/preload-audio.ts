import { type WordAudio } from "./audio";

interface AudioManifest {
  sentence: string;
  words: Record<string, string>;
  generated: string;
}

/**
 * Fetch a file as a blob
 */
async function fetchAudioBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${url}`);
  }
  return response.blob();
}

/**
 * Get audio duration from a blob
 */
async function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration * 1000; // Convert to milliseconds
      URL.revokeObjectURL(url);
      resolve(duration);
    });
    
    audio.addEventListener('error', (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    });
  });
}

/**
 * Load pregenerated audio files from public folder
 */
export async function loadPreGeneratedAudio(): Promise<WordAudio[] | null> {
  try {
    // Fetch the manifest
    const manifestResponse = await fetch('/audio/manifest.json');
    if (!manifestResponse.ok) {
      console.log('No pregenerated audio manifest found');
      return null;
    }
    
    const manifest: AudioManifest = await manifestResponse.json();
    console.log('Loading pregenerated audio for:', manifest.sentence);
    
    // Load all audio files in parallel
    const audioPromises = Object.entries(manifest.words).map(async ([word, url]) => {
      try {
        const blob = await fetchAudioBlob(url);
        const duration = await getAudioDuration(blob);
        
        return {
          word,
          audio: blob,
          duration
        };
      } catch (error) {
        console.error(`Failed to load audio for "${word}":`, error);
        return null;
      }
    });
    
    const results = await Promise.all(audioPromises);
    const validResults = results.filter((r): r is WordAudio => r !== null);
    
    console.log(`Loaded ${validResults.length} pregenerated audio files`);
    return validResults;
  } catch (error) {
    console.error('Failed to load pregenerated audio:', error);
    return null;
  }
}

/**
 * Initialize the cache with pregenerated audio
 */
export async function initializeCacheWithPreGeneratedAudio(): Promise<boolean> {
  try {
    const preGeneratedAudio = await loadPreGeneratedAudio();
    
    if (!preGeneratedAudio || preGeneratedAudio.length === 0) {
      return false;
    }
    
    // Get the cache instance
    const { getAudioCache } = await import('./audio');
    const cache = await getAudioCache();
    
    // Store each word in the cache
    for (const wordAudio of preGeneratedAudio) {
      await cache.setWord(wordAudio.word, wordAudio.audio);
    }
    
    console.log('Cache initialized with pregenerated audio');
    return true;
  } catch (error) {
    console.error('Failed to initialize cache:', error);
    return false;
  }
}

/**
 * Get the default sentence from the manifest
 */
export async function getDefaultSentence(): Promise<string | null> {
  try {
    const manifestResponse = await fetch('/audio/manifest.json');
    if (!manifestResponse.ok) {
      return null;
    }
    
    const manifest: AudioManifest = await manifestResponse.json();
    return manifest.sentence;
  } catch (error) {
    return null;
  }
}