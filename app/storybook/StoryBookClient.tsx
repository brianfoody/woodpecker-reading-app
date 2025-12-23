"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
  RotateCcw,
  Loader2,
  Volume2,
  BookOpen,
  Download,
  Clock,
  X,
  ChevronDown,
} from "lucide-react";

interface Word {
  text: string;
  startTime: number;
  endTime: number;
  characterIndices: number[];
  paragraphIndex?: number;
}

interface WordWithAudio extends Word {
  audioBase64?: string;
  isLoading?: boolean;
}

interface Paragraph {
  words: WordWithAudio[];
  index: number;
  audioBase64?: string;
  text?: string;
}

type PlaybackSpeed = "0.60" | "0.85" | "1.1";

interface StoryHistoryItem {
  text: string;
  timestamp: number;
}

const STORY_HISTORY_KEY = "storybook-history";
const MAX_HISTORY_ITEMS = 10;

import {
  generateStoryId,
  getOrCreateUserId,
  saveStoryData,
  getStoryData,
  type StoryData,
} from "@/lib/utils/ids";

interface StoryBookClientProps {
  storyId?: string;
}

export default function StoryBookClient({ storyId }: StoryBookClientProps) {
  const router = useRouter();
  const [text, setText] = useState(
    "The little rabbit hopped through the garden.\n\nShe found a bright red strawberry and nibbled it happily.\n\nThe sun was shining and the birds were singing."
  );
  const [storyHistory, setStoryHistory] = useState<StoryHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [generateWords, setGenerateWords] = useState(true);
  const [words, setWords] = useState<WordWithAudio[]>([]);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingWords, setIsLoadingWords] = useState(false);
  const wordAudioMapRef = useRef<Map<string, string>>(new Map());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [hoveredWordIndex, setHoveredWordIndex] = useState(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>("0.85");
  const audioRef = useRef<HTMLAudioElement>(null);
  const isUserInteracting = useRef(false);
  const wordPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const continuousPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentPlayingAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentHighlightIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Swipe gesture state
  const [swipeWords, setSwipeWords] = useState<number[]>([]);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pointerStart, setPointerStart] = useState<{ x: number; y: number } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(storyId || null);

  // Initialize userId and load story data on mount
  useEffect(() => {
    // Get or create userId
    const userIdValue = getOrCreateUserId();
    setUserId(userIdValue);

    // Load story history
    const loadHistory = () => {
      try {
        const stored = localStorage.getItem(STORY_HISTORY_KEY);
        if (stored) {
          const history = JSON.parse(stored) as StoryHistoryItem[];
          setStoryHistory(history);
        }
      } catch (error) {
        console.error("Failed to load story history:", error);
      }
    };
    loadHistory();

    // If storyId is provided, load the story data
    if (storyId) {
      const storyData = getStoryData(storyId);
      if (storyData) {
        setText(storyData.text);
        setCurrentStoryId(storyId);
      } else {
        // Story not found, redirect to main storybook page
        router.push("/storybook");
      }
    }
  }, [storyId, router]);

  // Save story to history
  const saveToHistory = (storyText: string) => {
    try {
      const newItem: StoryHistoryItem = {
        text: storyText,
        timestamp: Date.now(),
      };

      // Check if this story already exists in history
      const existingIndex = storyHistory.findIndex(
        (item) => item.text === storyText
      );

      let updatedHistory: StoryHistoryItem[];
      if (existingIndex >= 0) {
        // Move existing item to the top
        updatedHistory = [
          newItem,
          ...storyHistory.filter((_, index) => index !== existingIndex),
        ];
      } else {
        // Add new item to the beginning
        updatedHistory = [newItem, ...storyHistory].slice(0, MAX_HISTORY_ITEMS);
      }

      setStoryHistory(updatedHistory);
      localStorage.setItem(STORY_HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      console.error("Failed to save story to history:", error);
    }
  };

  const generateAudio = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    setCurrentWordIndex(-1);
    wordAudioMapRef.current.clear();

    // Generate storyId if not already set
    let storyIdToUse = currentStoryId;
    if (!storyIdToUse) {
      storyIdToUse = generateStoryId();
      setCurrentStoryId(storyIdToUse);
      
      // Update URL to include storyId
      router.push(`/storybook/${storyIdToUse}`, { scroll: false });
    }

    // Save story data
    if (userId) {
      const storyData: StoryData = {
        id: storyIdToUse,
        userId,
        text: text.trim(),
        createdAt: Date.now(),
        audioGenerated: false,
      };
      saveStoryData(storyData);
    }

    // Save to history when generating audio
    saveToHistory(text.trim());

    try {
      // First, generate paragraph audio with timestamps (fast)
      const fullAudioResponse = await fetch("/api/elevenlabs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, mode: "full" }),
      });

      if (!fullAudioResponse.ok) {
        throw new Error("Failed to generate audio");
      }

      const fullData = await fullAudioResponse.json();

      // Process paragraphs and words from the response
      let initialWords: WordWithAudio[] = [];

      // Use the combined words from the full audio if available
      if (fullData.words && fullData.words.length > 0) {
        initialWords = fullData.words.map((word: Word) => ({
          ...word,
          audioBase64: undefined,
          isLoading: false,
        }));
        setWords(initialWords);
      }

      // Process paragraphs for individual paragraph playback
      if (fullData.paragraphs) {
        const paragraphsWithAudio: Paragraph[] = fullData.paragraphs.map(
          (para: any) => {
            const wordsWithPlaceholder = para.words.map((word: Word) => ({
              ...word,
              audioBase64: undefined,
              isLoading: false,
            }));

            // Only set initial words from paragraphs if not already set from main words
            if (initialWords.length === 0) {
              initialWords = [...initialWords, ...wordsWithPlaceholder];
            }

            return {
              words: wordsWithPlaceholder,
              index: para.index,
              audioBase64: para.audioBase64,
              text: para.text,
            };
          }
        );
        setParagraphs(paragraphsWithAudio);

        // Set words if not already set
        if (fullData.words?.length === 0 || !fullData.words) {
          setWords(initialWords);
        }
      }

      // Set the main combined audio for "Play All" functionality
      setAudioSrc(`data:audio/mpeg;base64,${fullData.audioBase64}`);
      setIsLoading(false);

      // Update story data to mark audio as generated
      if (userId && storyIdToUse) {
        const storyData: StoryData = {
          id: storyIdToUse,
          userId,
          text: text.trim(),
          createdAt: Date.now(),
          audioGenerated: true,
        };
        saveStoryData(storyData);
      }

      // Then load word audio in the background (only if generateWords is enabled)
      if (generateWords) {
        setIsLoadingWords(true);
        loadWordAudioInBackground(initialWords);
      }
    } catch (error) {
      console.error("Error generating audio:", error);
      alert("Failed to generate audio. Please check your API key.");
      setIsLoading(false);
    }
  };

  const loadWordAudioInBackground = async (currentWords: WordWithAudio[]) => {
    try {
      const wordAudioResponse = await fetch("/api/elevenlabs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, mode: "words" }),
      });

      if (!wordAudioResponse.ok) {
        console.error("Failed to generate word audio");
        return;
      }

      const wordData = await wordAudioResponse.json();

      // Update the word audio map
      if (wordData.words) {
        wordData.words.forEach(
          (item: { word: string; audioBase64: string }) => {
            if (item.audioBase64) {
              wordAudioMapRef.current.set(
                item.word.toLowerCase(),
                item.audioBase64
              );
            }
          }
        );

        // Update words with audio
        const updatedWords = currentWords.map((word) => {
          // Remove punctuation to match how the API generates words
          const cleanWord = word.text
            .toLowerCase()
            .replace(/[.,!?;:'"()\[\]{}]/g, "");
          const audioBase64 = wordAudioMapRef.current.get(cleanWord);
          return {
            ...word,
            audioBase64,
            isLoading: false,
          };
        });

        setWords(updatedWords);

        // Update paragraphs with audio
        setParagraphs((prev) =>
          prev.map((para) => ({
            ...para,
            words: para.words.map((word) => {
              // Remove punctuation to match how the API generates words
              const cleanWord = word.text
                .toLowerCase()
                .replace(/[.,!?;:'"()\[\]{}]/g, "");
              const audioBase64 = wordAudioMapRef.current.get(cleanWord);
              return {
                ...word,
                audioBase64,
                isLoading: false,
              };
            }),
          }))
        );
      }
    } catch (error) {
      console.error("Error loading word audio:", error);
    } finally {
      setIsLoadingWords(false);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateHighlighting = () => {
      // Skip automatic highlighting if user is interacting with a word
      if (isUserInteracting.current) return;

      const currentTime = audio.currentTime;

      // Add a small look-ahead offset (100ms) to highlight words slightly before they're spoken
      const lookAheadTime = currentTime + 0.1;

      // Find the word that should be highlighted based on current playback time
      let wordIndex = -1;
      for (let i = 0; i < words.length; i++) {
        if (words[i].startTime <= lookAheadTime) {
          wordIndex = i;
        } else {
          break;
        }
      }

      setCurrentWordIndex(wordIndex);
    };

    const handlePlay = () => {
      setIsPlaying(true);

      // Clear any existing continuous play interval
      if (continuousPlayIntervalRef.current) {
        clearInterval(continuousPlayIntervalRef.current);
      }

      // Start our own interval for highlighting updates during continuous playback
      continuousPlayIntervalRef.current = setInterval(() => {
        updateHighlighting();
      }, 50); // Check every 50ms for responsive highlighting
    };

    const handlePause = () => {
      setIsPlaying(false);

      // Clear the continuous play interval
      if (continuousPlayIntervalRef.current) {
        clearInterval(continuousPlayIntervalRef.current);
        continuousPlayIntervalRef.current = null;
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentWordIndex(-1);
      isUserInteracting.current = false;

      // Clear the continuous play interval
      if (continuousPlayIntervalRef.current) {
        clearInterval(continuousPlayIntervalRef.current);
        continuousPlayIntervalRef.current = null;
      }
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);

      // Clean up intervals on unmount
      if (continuousPlayIntervalRef.current) {
        clearInterval(continuousPlayIntervalRef.current);
      }
    };
  }, [words]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    // Stop any currently playing paragraph/word audio
    if (currentPlayingAudioRef.current) {
      currentPlayingAudioRef.current.pause();
      currentPlayingAudioRef.current = null;
    }

    // Clear any highlight interval
    if (currentHighlightIntervalRef.current) {
      clearInterval(currentHighlightIntervalRef.current);
      currentHighlightIntervalRef.current = null;
    }

    isUserInteracting.current = false;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const resetAudio = () => {
    if (!audioRef.current) return;

    audioRef.current.currentTime = 0;
    setCurrentWordIndex(-1);
    isUserInteracting.current = false;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSpeedChange = (speed: string) => {
    setPlaybackSpeed(speed as PlaybackSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = parseFloat(speed);
    }
  };

  const playParagraph = async (paragraphIndex: number) => {
    if (!paragraphs[paragraphIndex]) return;

    const paragraph = paragraphs[paragraphIndex];

    // Stop any currently playing audio
    if (currentPlayingAudioRef.current) {
      currentPlayingAudioRef.current.pause();
      currentPlayingAudioRef.current = null;
    }

    // Clear any existing highlight interval
    if (currentHighlightIntervalRef.current) {
      clearInterval(currentHighlightIntervalRef.current);
      currentHighlightIntervalRef.current = null;
    }

    // Use dedicated paragraph audio if available
    if (paragraph.audioBase64) {
      // Clear any existing interval
      if (wordPlayIntervalRef.current) {
        clearInterval(wordPlayIntervalRef.current);
        wordPlayIntervalRef.current = null;
      }

      // Set interaction flag
      isUserInteracting.current = true;

      // Pause main audio if playing
      if (audioRef.current && isPlaying) {
        audioRef.current.pause();
      }

      try {
        // Create a temporary audio element for the paragraph
        const paragraphAudio = new Audio(
          `data:audio/mpeg;base64,${paragraph.audioBase64}`
        );
        paragraphAudio.playbackRate = parseFloat(playbackSpeed);

        // Store reference to current playing audio
        currentPlayingAudioRef.current = paragraphAudio;

        // Find the starting index of this paragraph's words in the global words array
        let startWordIndex = 0;
        for (let i = 0; i < paragraphIndex; i++) {
          if (paragraphs[i]) {
            startWordIndex += paragraphs[i].words.length;
          }
        }

        // Play the paragraph audio
        await paragraphAudio.play();

        // Update highlighting during playback
        const highlightInterval = setInterval(() => {
          if (!isUserInteracting.current) {
            clearInterval(highlightInterval);
            currentHighlightIntervalRef.current = null;
            return;
          }

          const currentTime = paragraphAudio.currentTime;
          const lookAheadTime = currentTime + 0.1;

          // Find which word within the paragraph should be highlighted
          let localWordIndex = -1;
          for (let i = 0; i < paragraph.words.length; i++) {
            if (paragraph.words[i].startTime <= lookAheadTime) {
              localWordIndex = i;
            } else {
              break;
            }
          }

          // Convert to global word index
          if (localWordIndex >= 0) {
            setCurrentWordIndex(startWordIndex + localWordIndex);
          }
        }, 50);

        // Store the highlight interval reference
        currentHighlightIntervalRef.current = highlightInterval;

        // Wait for the paragraph to finish
        await new Promise<void>((resolve) => {
          paragraphAudio.onended = () => {
            clearInterval(highlightInterval);
            currentHighlightIntervalRef.current = null;
            currentPlayingAudioRef.current = null;
            isUserInteracting.current = false;
            setTimeout(() => {
              if (!isPlaying) {
                setCurrentWordIndex(-1);
              }
            }, 200);
            resolve();
          };

          paragraphAudio.onerror = () => {
            clearInterval(highlightInterval);
            currentHighlightIntervalRef.current = null;
            currentPlayingAudioRef.current = null;
            console.error("Failed to play paragraph audio");
            isUserInteracting.current = false;
            setCurrentWordIndex(-1);
            resolve();
          };
        });
      } catch (error) {
        console.error(`Error playing paragraph: ${error}`);
        isUserInteracting.current = false;
        setCurrentWordIndex(-1);
      }

      return;
    }

    // Fallback to the original method if no dedicated paragraph audio
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const firstWord = paragraph.words[0];
    const lastWord = paragraph.words[paragraph.words.length - 1];

    if (!firstWord || !lastWord) return;

    // Clear any existing interval
    if (wordPlayIntervalRef.current) {
      clearInterval(wordPlayIntervalRef.current);
      wordPlayIntervalRef.current = null;
    }

    // Set interaction flag
    isUserInteracting.current = true;

    // Pause if playing
    if (isPlaying) {
      audio.pause();
    }

    // Set the current time to the start of the paragraph
    audio.currentTime = firstWord.startTime;

    // Play the audio
    await audio.play();

    // Use interval to stop at paragraph boundary and update highlighting
    wordPlayIntervalRef.current = setInterval(() => {
      const currentTime = audio.currentTime;

      // Update word highlighting within the paragraph
      const lookAheadTime = currentTime + 0.1;
      let wordIndex = -1;

      // Find the global word index for highlighting
      for (let i = 0; i < words.length; i++) {
        if (words[i].startTime <= lookAheadTime) {
          wordIndex = i;
        } else {
          break;
        }
      }
      setCurrentWordIndex(wordIndex);

      // Check if we've reached the end of the paragraph
      if (currentTime >= lastWord.endTime || !isUserInteracting.current) {
        audio.pause();
        isUserInteracting.current = false;
        if (wordPlayIntervalRef.current) {
          clearInterval(wordPlayIntervalRef.current);
          wordPlayIntervalRef.current = null;
        }
        setTimeout(() => {
          if (!isPlaying) {
            setCurrentWordIndex(-1);
          }
        }, 200);
      }
    }, 50);

    // Failsafe timeout
    const maxDuration =
      ((lastWord.endTime - firstWord.startTime) * 1000) /
        parseFloat(playbackSpeed) +
      500;
    setTimeout(() => {
      if (isUserInteracting.current) {
        audio.pause();
        isUserInteracting.current = false;
        if (wordPlayIntervalRef.current) {
          clearInterval(wordPlayIntervalRef.current);
          wordPlayIntervalRef.current = null;
        }
      }
    }, maxDuration);
  };

  const playWordSegment = async (wordIndex: number) => {
    if (!words[wordIndex]) return;

    const word = words[wordIndex];

    // If word generation was disabled, don't allow clicking
    if (!generateWords) {
      return;
    }

    // If word audio is loading, show loading state
    if (!word.audioBase64 && isLoadingWords) {
      // Mark word as loading
      setWords((prev) =>
        prev.map((w, i) => (i === wordIndex ? { ...w, isLoading: true } : w))
      );

      // Wait for the audio to be available
      const checkInterval = setInterval(() => {
        const audioBase64 = wordAudioMapRef.current.get(
          word.text.toLowerCase()
        );
        if (audioBase64 || !isLoadingWords) {
          clearInterval(checkInterval);

          // Update word with audio and play it
          setWords((prev) =>
            prev.map((w, i) =>
              i === wordIndex ? { ...w, audioBase64, isLoading: false } : w
            )
          );

          if (audioBase64) {
            playWordWithAudio(audioBase64, wordIndex);
          }
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        setWords((prev) =>
          prev.map((w, i) => (i === wordIndex ? { ...w, isLoading: false } : w))
        );
      }, 5000);

      return;
    }

    // Use individual word audio if available
    if (word.audioBase64) {
      playWordWithAudio(word.audioBase64, wordIndex);
      return;
    }

    // No audio available yet, just return
    return;
  };

  const playWordWithAudio = async (audioBase64: string, wordIndex: number) => {
    // Stop any currently playing audio
    if (currentPlayingAudioRef.current) {
      currentPlayingAudioRef.current.pause();
      currentPlayingAudioRef.current = null;
    }

    // Clear any existing interval
    if (wordPlayIntervalRef.current) {
      clearInterval(wordPlayIntervalRef.current);
      wordPlayIntervalRef.current = null;
    }

    // Set interaction flag
    isUserInteracting.current = true;

    // Pause main audio if playing
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
    }

    // Highlight the word
    setCurrentWordIndex(wordIndex);

    try {
      // Create a temporary audio element for the word
      const wordAudio = new Audio(audioBase64);
      wordAudio.playbackRate = parseFloat(playbackSpeed);

      // Store reference to current playing audio
      currentPlayingAudioRef.current = wordAudio;

      // Play the word audio
      await wordAudio.play();

      // Wait for the word to finish playing
      await new Promise<void>((resolve) => {
        wordAudio.onended = () => {
          currentPlayingAudioRef.current = null;
          resolve();
        };
        wordAudio.onerror = () => {
          console.error(`Failed to play word audio`);
          currentPlayingAudioRef.current = null;
          resolve();
        };
      });
    } catch (error) {
      console.error(`Error playing word audio: ${error}`);
    } finally {
      // Reset state
      isUserInteracting.current = false;

      // Remove highlight after a brief delay
      setTimeout(() => {
        if (!isPlaying) {
          setCurrentWordIndex(-1);
        }
      }, 200);
    }
  };

  // Set initial playback rate when audio loads
  useEffect(() => {
    if (audioRef.current && audioSrc) {
      audioRef.current.playbackRate = parseFloat(playbackSpeed);
    }
  }, [audioSrc, playbackSpeed]);

  const downloadAudio = () => {
    if (!audioSrc) return;

    // Convert base64 to blob
    const base64Data = audioSrc.split(",")[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "audio/mpeg" });

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `story-audio-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Get client coordinates from mouse or touch event
  const getClientCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if ("touches" in e) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  // Play a sequence of words using paragraph audio
  const animateWordSequence = useCallback(
    async (indices: number[]) => {
      setIsAnimating(true);
      const sortedIndices = [...indices].sort((a, b) => a - b);

      for (const index of sortedIndices) {
        // Check if animation was cancelled
        const shouldContinue = await new Promise<boolean>((resolve) => {
          setIsAnimating((current: boolean) => {
            if (!current) {
              resolve(false);
              return current;
            }
            resolve(true);
            return current;
          });
        });

        if (!shouldContinue) break;

        // Find which paragraph this word belongs to
        let paragraphIndex = -1;
        let wordInParagraphIndex = -1;
        let cumulativeWordCount = 0;

        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
          const paragraph = paragraphs[pIdx];
          if (index < cumulativeWordCount + paragraph.words.length) {
            paragraphIndex = pIdx;
            wordInParagraphIndex = index - cumulativeWordCount;
            break;
          }
          cumulativeWordCount += paragraph.words.length;
        }

        if (paragraphIndex === -1 || wordInParagraphIndex === -1) continue;

        const paragraph = paragraphs[paragraphIndex];
        const word = paragraph.words[wordInParagraphIndex];

        if (!word || !paragraph.audioBase64) continue;

        // Stop any currently playing audio
        if (currentPlayingAudioRef.current) {
          currentPlayingAudioRef.current.pause();
          currentPlayingAudioRef.current = null;
        }

        setCurrentWordIndex(index);

        try {
          // Create audio element for this word segment
          const wordAudio = new Audio(
            `data:audio/mpeg;base64,${paragraph.audioBase64}`
          );
          wordAudio.playbackRate = parseFloat(playbackSpeed);
          
          // Set the playback to start at word's start time
          wordAudio.currentTime = word.startTime;
          currentPlayingAudioRef.current = wordAudio;

          // Play the audio
          await wordAudio.play();

          // Create interval to stop at word's end time
          await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              if (!currentPlayingAudioRef.current || wordAudio.currentTime >= word.endTime) {
                clearInterval(checkInterval);
                wordAudio.pause();
                currentPlayingAudioRef.current = null;
                resolve();
              }
            }, 10);

            // Timeout safety
            setTimeout(() => {
              clearInterval(checkInterval);
              if (currentPlayingAudioRef.current === wordAudio) {
                wordAudio.pause();
                currentPlayingAudioRef.current = null;
              }
              resolve();
            }, (word.endTime - word.startTime) * 1000 / parseFloat(playbackSpeed) + 100);
          });

          // Small pause between words
          await new Promise(resolve => setTimeout(resolve, 50));

        } catch (error) {
          console.error(`Failed to play word: ${word.text}`, error);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      setCurrentWordIndex(-1);
      setIsAnimating(false);
    },
    [paragraphs, playbackSpeed]
  );

  // Handle pointer start (mouse down or touch start)
  const handlePointerStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, index: number) => {
      e.stopPropagation();
      if (isLoading) return;

      const coords = getClientCoords(e);
      setPointerStart(coords);
      setSwipeWords([index]);
      setIsSwiping(true);
      setIsAnimating(false);
      
      // Stop any playing audio
      if (currentPlayingAudioRef.current) {
        currentPlayingAudioRef.current.pause();
        currentPlayingAudioRef.current = null;
      }
      if (audioRef.current && isPlaying) {
        audioRef.current.pause();
      }
    },
    [isLoading, isPlaying]
  );

  // Handle pointer move (mouse move or touch move)
  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!pointerStart || !isSwiping) return;

      e.preventDefault();

      const coords = getClientCoords(e);
      const element = document.elementFromPoint(coords.x, coords.y);
      const wordElement = element?.closest("[data-word-index]");

      if (wordElement) {
        const wordIndex = Number.parseInt(
          wordElement.getAttribute("data-word-index") || "0"
        );
        setSwipeWords((prev) => {
          const newWords = [...prev];
          if (!newWords.includes(wordIndex)) {
            const minIndex = Math.min(...newWords);
            const maxIndex = Math.max(...newWords);

            // Allow adding words that extend the range or fill gaps
            if (
              wordIndex === maxIndex + 1 ||
              wordIndex === minIndex - 1 ||
              (wordIndex > minIndex && wordIndex < maxIndex)
            ) {
              newWords.push(wordIndex);
            }
          }
          return newWords;
        });
      }
    },
    [pointerStart, isSwiping]
  );

  // Handle pointer end (mouse up or touch end)
  const handlePointerEnd = useCallback(async () => {
    if (isSwiping) {
      if (swipeWords.length > 1) {
        // Multiple words - play sequence using paragraph audio
        animateWordSequence(swipeWords);
      } else if (swipeWords.length === 1) {
        // Single tap - play just that word using paragraph audio
        const index = swipeWords[0];
        
        // Find which paragraph this word belongs to
        let paragraphIndex = -1;
        let wordInParagraphIndex = -1;
        let cumulativeWordCount = 0;

        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
          const paragraph = paragraphs[pIdx];
          if (index < cumulativeWordCount + paragraph.words.length) {
            paragraphIndex = pIdx;
            wordInParagraphIndex = index - cumulativeWordCount;
            break;
          }
          cumulativeWordCount += paragraph.words.length;
        }

        if (paragraphIndex !== -1 && wordInParagraphIndex !== -1) {
          const paragraph = paragraphs[paragraphIndex];
          const word = paragraph.words[wordInParagraphIndex];

          if (word && paragraph.audioBase64) {
            setCurrentWordIndex(index);
            
            try {
              // Stop any currently playing audio
              if (currentPlayingAudioRef.current) {
                currentPlayingAudioRef.current.pause();
                currentPlayingAudioRef.current = null;
              }

              const wordAudio = new Audio(
                `data:audio/mpeg;base64,${paragraph.audioBase64}`
              );
              wordAudio.playbackRate = parseFloat(playbackSpeed);
              wordAudio.currentTime = word.startTime;
              currentPlayingAudioRef.current = wordAudio;

              await wordAudio.play();

              await new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                  if (!currentPlayingAudioRef.current || wordAudio.currentTime >= word.endTime) {
                    clearInterval(checkInterval);
                    wordAudio.pause();
                    currentPlayingAudioRef.current = null;
                    resolve();
                  }
                }, 10);

                setTimeout(() => {
                  clearInterval(checkInterval);
                  if (currentPlayingAudioRef.current === wordAudio) {
                    wordAudio.pause();
                    currentPlayingAudioRef.current = null;
                  }
                  resolve();
                }, (word.endTime - word.startTime) * 1000 / parseFloat(playbackSpeed) + 100);
              });
            } catch (error) {
              console.error("Error playing word audio:", error);
            } finally {
              setTimeout(() => setCurrentWordIndex(-1), 200);
            }
          }
        }
      }
      
      setPointerStart(null);
      setIsSwiping(false);
      setTimeout(() => setSwipeWords([]), 300);
    }
  }, [swipeWords, isSwiping, animateWordSequence, paragraphs, playbackSpeed]);

  return (
    <div className="min-h-screen bg-neutral-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Input Section */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label
                htmlFor="text-input"
                className="text-lg text-neutral-700 font-medium"
              >
                Enter your story text
              </label>
              {storyHistory.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-neutral-600 hover:text-neutral-800 flex items-center text-sm font-medium transition-colors"
                >
                  <Clock className="mr-1 h-4 w-4" />
                  History ({storyHistory.length})
                  <ChevronDown
                    className={`ml-1 h-4 w-4 transition-transform ${
                      showHistory ? "rotate-180" : ""
                    }`}
                  />
                </button>
              )}
            </div>

            {showHistory && storyHistory.length > 0 && (
              <div className="mb-4 border border-neutral-200 rounded-lg p-2 bg-neutral-50 max-h-48 overflow-y-auto">
                <div className="space-y-1">
                  {storyHistory.map((item, index) => (
                    <div
                      key={item.timestamp}
                      className="p-2 hover:bg-neutral-100 rounded cursor-pointer text-sm group flex justify-between items-start"
                      onClick={() => {
                        setText(item.text);
                        setShowHistory(false);
                      }}
                    >
                      <span className="flex-1 line-clamp-2">
                        {item.text.substring(0, 100)}...
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const updatedHistory = storyHistory.filter(
                            (_, i) => i !== index
                          );
                          setStoryHistory(updatedHistory);
                          localStorage.setItem(
                            STORY_HISTORY_KEY,
                            JSON.stringify(updatedHistory)
                          );
                        }}
                        className="opacity-0 group-hover:opacity-100 ml-2 text-neutral-400 hover:text-neutral-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <textarea
              id="text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              placeholder="Type or paste your story here..."
              className="w-full min-h-[140px] resize-none border-4 border-neutral-400  ring-black rounded-lg px-4 py-3 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-base"
            />

            <div className="flex items-center space-x-2 mt-2">
              <input
                type="checkbox"
                id="generate-words"
                checked={generateWords}
                onChange={(e) => setGenerateWords(e.target.checked)}
                className="w-4 h-4 text-emerald-600 border-neutral-300 rounded focus:ring-emerald-500"
              />
              <label
                htmlFor="generate-words"
                className="text-sm text-neutral-700 cursor-pointer"
              >
                Generate individual word audio (enables click-to-hear words)
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-4 items-center">
            <button
              onClick={generateAudio}
              disabled={isLoading || !text.trim()}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-300 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Story...
                </>
              ) : (
                <>
                  <Volume2 className="mr-2 h-4 w-4" />
                  <span>Generate Audio</span>
                </>
              )}
            </button>

            {isLoadingWords && (
              <div className="text-xs text-neutral-500 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading word audio...
              </div>
            )}
          </div>
        </div>

        {/* Story Display Section */}
        {paragraphs.length > 0 && (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 md:p-8">
            {audioSrc && (
              <div className="flex flex-wrap gap-3 items-center p-6 md:p-8">
                <button
                  onClick={togglePlayPause}
                  className="px-4 py-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-sm rounded-full flex items-center gap-2 transition-colors"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="mr-2 h-3.5 w-3.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-3.5 w-3.5" />
                      Play
                    </>
                  )}
                </button>

                <button
                  onClick={resetAudio}
                  className="px-4 py-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-sm rounded-full flex items-center gap-2 transition-colors"
                >
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>

                <select
                  value={playbackSpeed}
                  onChange={(e) => handleSpeedChange(e.target.value)}
                  className="px-4 py-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-sm rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="0.60">Slow (0.75x)</option>
                  <option value="0.85">Normal (1.0x)</option>
                  <option value="1.1">Fast (1.25x)</option>
                </select>

                <button
                  onClick={downloadAudio}
                  className="px-4 py-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-sm rounded-full flex items-center gap-2 transition-colors"
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
              </div>
            )}

            <div>
              <div className="space-y-6">
                {paragraphs.map((paragraph, pIndex) => {
                  // Calculate the starting global index for this paragraph
                  let globalStartIndex = 0;
                  for (let i = 0; i < pIndex; i++) {
                    globalStartIndex += paragraphs[i].words.length;
                  }

                  return (
                    <div key={pIndex} className="flex gap-3 group">
                      {/* Paragraph play button */}
                      <button
                        onClick={() => playParagraph(pIndex)}
                        className="flex-shrink-0 mt-1 p-1.5 rounded-full bg-neutral-100 hover:bg-neutral-200 transition-all opacity-0 group-hover:opacity-100"
                        aria-label={`Play paragraph ${pIndex + 1}`}
                      >
                        <Play className="w-3 h-3 text-neutral-600" />
                      </button>

                      {/* Paragraph text */}
                      <div 
                        className="flex-1 text-xl md:text-2xl leading-relaxed text-neutral-700"
                        onTouchMove={handlePointerMove}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handlePointerEnd();
                        }}
                        onMouseMove={handlePointerMove}
                        onMouseUp={handlePointerEnd}
                        onMouseLeave={handlePointerEnd}
                      >
                        {paragraph.words.map((word, wIndex) => {
                          const globalIndex = globalStartIndex + wIndex;
                          const globalWord = words[globalIndex];
                          const isWordLoading = globalWord?.isLoading;

                          return (
                            <span
                              key={wIndex}
                              data-word-index={globalIndex}
                              onClick={
                                generateWords
                                  ? () => playWordSegment(globalIndex)
                                  : undefined
                              }
                              onTouchStart={(e) => handlePointerStart(e, globalIndex)}
                              onMouseDown={(e) => handlePointerStart(e, globalIndex)}
                              onMouseEnter={
                                generateWords
                                  ? () => setHoveredWordIndex(globalIndex)
                                  : undefined
                              }
                              onMouseLeave={
                                generateWords
                                  ? () => setHoveredWordIndex(-1)
                                  : undefined
                              }
                              className={`
                                  inline-block px-2 md:px-3 py-1 md:py-1.5 mx-1 rounded-lg
                                  transition-all duration-200 select-none relative
                                  cursor-pointer
                                  ${
                                    globalIndex === currentWordIndex
                                      ? "bg-emerald-600 text-white shadow-lg scale-105"
                                      : swipeWords.includes(globalIndex) && isSwiping
                                      ? "bg-amber-100 text-amber-900 ring-2 ring-amber-200"
                                      : globalIndex === hoveredWordIndex && generateWords
                                      ? "bg-neutral-100"
                                      : "hover:bg-neutral-50"
                                  }
                                  ${isWordLoading ? "opacity-50" : ""}
                                `}
                              style={{
                                fontFamily:
                                  "system-ui, -apple-system, sans-serif",
                              }}
                            >
                              {word.text}
                              {isWordLoading && (
                                <span className="absolute inset-0 flex items-center justify-center">
                                  <Loader2 className="h-3 w-3 animate-spin text-neutral-500" />
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 text-center text-xs text-neutral-400">
                Click any word to hear it • Swipe across words to hear them in sequence
              </div>
            </div>
          </div>
        )}

        {audioSrc && <audio ref={audioRef} src={audioSrc} className="hidden" />}
      </div>
    </div>
  );
}
