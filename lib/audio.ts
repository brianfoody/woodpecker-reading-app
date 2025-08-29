
// Types for audio data
interface AudioCacheEntry {
  word: string;
  audioBlob: Blob;
  timestamp: number;
}

interface WordAudio {
  word: string;
  audio: Blob;
  duration: number; // Duration in milliseconds
}

// IndexedDB cache manager for browser-compatible storage
class AudioCache {
  private dbName = "audioCache";
  private storeName = "wordAudio";
  private db: IDBDatabase | null = null;
  private sessionId: string;

  constructor() {
    // Generate a unique session ID
    this.sessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 11)}`;
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        // Clear old sessions on init
        this.clearOldSessions().then(() => resolve());
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "id" });
          store.createIndex("sessionId", "sessionId", { unique: false });
          store.createIndex("word", "word", { unique: false });
        }
      };
    });
  }

  private async clearOldSessions(): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);
    const index = store.index("sessionId");

    // Clear all entries that don't belong to current session
    const request = index.openCursor();

    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          if (cursor.value.sessionId !== this.sessionId) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }

  async getWord(word: string): Promise<Blob | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(`${this.sessionId}_${word.toLowerCase()}`);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.audioBlob);
        } else {
          resolve(null);
        }
      };
    });
  }

  async setWord(word: string, audioBlob: Blob): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.put({
        id: `${this.sessionId}_${word.toLowerCase()}`,
        sessionId: this.sessionId,
        word: word.toLowerCase(),
        audioBlob: audioBlob,
        timestamp: Date.now(),
      });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const index = store.index("sessionId");
      const request = index.openCursor(IDBKeyRange.only(this.sessionId));

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }
}

// Initialize cache manager
let audioCache: AudioCache | null = null;

const getAudioCache = async (): Promise<AudioCache> => {
  if (!audioCache) {
    audioCache = new AudioCache();
    await audioCache.init();
  }
  return audioCache;
};


/**
 * Get the duration of an audio blob in milliseconds
 */
const getAudioDuration = (blob: Blob): Promise<number> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.addEventListener("loadedmetadata", () => {
      const duration = audio.duration * 1000; // Convert to milliseconds
      URL.revokeObjectURL(url);
      resolve(duration);
    });

    audio.addEventListener("error", (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    });
  });
};

/**
 * Tokenize a sentence into individual words, preserving punctuation context
 */
const tokenizeSentence = (sentence: string): string[] => {
  // Split by spaces while preserving punctuation attached to words
  const words = sentence.trim().split(/\s+/);

  // Further process to separate words that might need individual audio
  const processedWords: string[] = [];

  words.forEach((word) => {
    // Remove punctuation for audio generation but keep the original for context
    const cleanWord = word.replace(/[.,!?;:'"()[\]{}]/g, "");
    if (cleanWord) {
      processedWords.push(cleanWord);
    }
  });

  return processedWords;
};

/**
 * Create audio for a single word or phrase
 */
const createAudioFile = async (text: string): Promise<Blob> => {
  const response = await fetch("/api/audio", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate audio: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: "audio/wav" });

  return blob;
};

/**
 * Breaks sentence up into words and in parallel creates an audio file for each word.
 * Caches words for reuse in future sentences.
 *
 * @param sentence The sentence to generate audio for
 * @returns Array of word audio objects with duration
 */
const createSentenceAudio = async (sentence: string): Promise<WordAudio[]> => {
  const cache = await getAudioCache();
  const words = tokenizeSentence(sentence);

  // Check cache and identify words that need generation
  const wordAudioPromises = words.map(async (word) => {
    // First check cache
    let audioBlob = await cache.getWord(word);

    if (!audioBlob) {
      // Generate audio for uncached word
      try {
        audioBlob = await createAudioFile(word);
        // Store in cache for future use
        await cache.setWord(word, audioBlob);
      } catch (error) {
        console.error(`Failed to generate audio for word: ${word}`, error);
        // Return a silent audio blob or handle error appropriately
        audioBlob = new Blob([], { type: "audio/wav" });
      }
    }

    // Get the duration of the audio
    let duration = 0;
    try {
      duration = await getAudioDuration(audioBlob);
    } catch (error) {
      console.error(`Failed to get duration for word: ${word}`, error);
      duration = 500; // Default duration fallback
    }

    return {
      word,
      audio: audioBlob,
      duration,
    };
  });

  // Execute all audio generation/retrieval in parallel
  const wordAudios = await Promise.all(wordAudioPromises);

  return wordAudios;
};

/**
 * Utility function to play audio in the browser
 */
const playAudioBlob = (blob: Blob): Promise<void> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };

    audio.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };

    audio.play().catch(reject);
  });
};

/**
 * Play words sequentially with a small delay between them
 */
const playSentenceAudio = async (
  wordAudios: WordAudio[],
  delayMs: number = 100
): Promise<void> => {
  for (const wordAudio of wordAudios) {
    await playAudioBlob(wordAudio.audio);
    // Add small delay between words
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
};

/**
 * Clear the audio cache for the current session
 */
const clearAudioCache = async (): Promise<void> => {
  const cache = await getAudioCache();
  await cache.clear();
};

/**
 * Play a single word's audio
 * @param word The word to play
 * @returns Promise that resolves when audio finishes playing
 */
const playWord = async (word: string): Promise<void> => {
  const cache = await getAudioCache();

  // Check cache first
  let audioBlob = await cache.getWord(word);

  if (!audioBlob) {
    // Generate audio if not cached
    try {
      audioBlob = await createAudioFile(word);
      // Store in cache for future use
      await cache.setWord(word, audioBlob);
    } catch (error) {
      console.error(`Failed to generate audio for word: ${word}`, error);
      return; // Exit if audio generation fails
    }
  }

  // Play the audio
  await playAudioBlob(audioBlob);
};

/**
 * Play multiple words with options for sequential or concurrent playback
 * @param words Array of words to play
 * @param options Playback options
 * @returns Promise that resolves when all audio finishes playing
 */
interface PlayWordsOptions {
  sequential?: boolean; // If true, plays words one after another. If false, plays all at once
  delayMs?: number; // Delay between words (only applies when sequential is true)
}

const playWords = async (
  words: string[],
  options: PlayWordsOptions = { sequential: true, delayMs: 100 }
): Promise<void> => {
  const cache = await getAudioCache();

  // Fetch/generate audio for all words
  const wordAudioPromises = words.map(async (word) => {
    let audioBlob = await cache.getWord(word);

    if (!audioBlob) {
      try {
        audioBlob = await createAudioFile(word);
        await cache.setWord(word, audioBlob);
      } catch (error) {
        console.error(`Failed to generate audio for word: ${word}`, error);
        return null;
      }
    }

    // Get duration
    let duration = 500; // Default fallback
    try {
      duration = await getAudioDuration(audioBlob);
    } catch (error) {
      console.error(`Failed to get duration for word: ${word}`, error);
    }

    return { word, audio: audioBlob, duration };
  });

  const wordAudios = (await Promise.all(wordAudioPromises)).filter(
    (wa): wa is WordAudio => wa !== null
  );

  if (options.sequential) {
    // Play words one after another with delay
    for (const wordAudio of wordAudios) {
      await playAudioBlob(wordAudio.audio);
      if (options.delayMs && options.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
    }
  } else {
    // Play all words at once (concurrent)
    await Promise.all(wordAudios.map((wa) => playAudioBlob(wa.audio)));
  }
};

// Export functions for use in the application
export {
  createAudioFile,
  createSentenceAudio,
  playAudioBlob,
  playSentenceAudio,
  clearAudioCache,
  tokenizeSentence,
  playWord,
  playWords,
  getAudioCache,
  type WordAudio,
  type AudioCacheEntry,
  type PlayWordsOptions,
};
