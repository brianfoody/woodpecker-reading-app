import Groq from "groq-sdk";

// Types for audio data
interface AudioCacheEntry {
  word: string;
  audioBlob: Blob;
  timestamp: number;
}

interface WordAudio {
  word: string;
  audio: Blob;
}

// IndexedDB cache manager for browser-compatible storage
class AudioCache {
  private dbName = "audioCache";
  private storeName = "wordAudio";
  private db: IDBDatabase | null = null;
  private sessionId: string;

  constructor() {
    // Generate a unique session ID
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
        timestamp: Date.now()
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

// Initialize Groq client (API key should be set via environment variables in Next.js)
const getGroqClient = () => {
  // In Next.js, use process.env for server-side or pass via API route
  const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  return new Groq({
    apiKey: apiKey,
    // For browser usage, might need to configure CORS or use via API route
    dangerouslyAllowBrowser: true
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
  
  words.forEach(word => {
    // Remove punctuation for audio generation but keep the original for context
    const cleanWord = word.replace(/[.,!?;:'"()[\]{}]/g, '');
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
  const client = getGroqClient();
  
  const response = await client.audio.speech.create({
    model: "playai-tts",
    voice: "Quinn-PlayAI",
    input: text,
    response_format: "wav",
  });

  // Convert response to Blob for browser compatibility
  const arrayBuffer = await response.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
  
  return blob;
};

/**
 * Breaks sentence up into words and in parallel creates an audio file for each word.
 * Caches words for reuse in future sentences.
 * 
 * @param sentence The sentence to generate audio for
 * @returns Array of word audio objects
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
        audioBlob = new Blob([], { type: 'audio/wav' });
      }
    }
    
    return {
      word,
      audio: audioBlob
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
const playSentenceAudio = async (wordAudios: WordAudio[], delayMs: number = 100): Promise<void> => {
  for (const wordAudio of wordAudios) {
    await playAudioBlob(wordAudio.audio);
    // Add small delay between words
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
};

/**
 * Clear the audio cache for the current session
 */
const clearAudioCache = async (): Promise<void> => {
  const cache = await getAudioCache();
  await cache.clear();
};

// Export functions for use in the application
export {
  createAudioFile,
  createSentenceAudio,
  playAudioBlob,
  playSentenceAudio,
  clearAudioCache,
  tokenizeSentence,
  type WordAudio,
  type AudioCacheEntry
};