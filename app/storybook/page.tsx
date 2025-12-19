"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

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

type PlaybackSpeed = "0.6" | "0.85" | "1.1";

interface StoryHistoryItem {
  text: string;
  timestamp: number;
}

const STORY_HISTORY_KEY = "storybook-history";
const MAX_HISTORY_ITEMS = 10;

export default function StoryBookPage() {
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

  // Load story history from local storage on mount
  useEffect(() => {
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
  }, []);

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

  const handleSpeedChange = (speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <Card className="shadow-xl border-amber-200">
          <CardHeader className="bg-gradient-to-r from-amber-100 to-orange-100">
            <CardTitle className="text-3xl font-normal text-amber-900 flex items-center gap-3">
              Interactive Storybook Reader
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-8">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="text-input"
                  className="text-sm text-amber-700 font-medium"
                >
                  Enter your story text
                </label>
                {storyHistory.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHistory(!showHistory)}
                    className="text-amber-700 hover:text-amber-800"
                  >
                    <Clock className="mr-1 h-4 w-4" />
                    History ({storyHistory.length})
                    <ChevronDown
                      className={`ml-1 h-4 w-4 transition-transform ${
                        showHistory ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                )}
              </div>

              {showHistory && storyHistory.length > 0 && (
                <div className="mb-4 border border-amber-200 rounded-lg p-2 bg-amber-50 max-h-48 overflow-y-auto">
                  <div className="space-y-1">
                    {storyHistory.map((item, index) => (
                      <div
                        key={item.timestamp}
                        className="p-2 hover:bg-amber-100 rounded cursor-pointer text-sm group flex justify-between items-start"
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
                          className="opacity-0 group-hover:opacity-100 ml-2 text-amber-600 hover:text-amber-800"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Textarea
                id="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste your story here..."
                className="min-h-[140px] resize-none border-amber-200 focus:border-amber-400 text-base"
              />

              <div className="flex items-center space-x-2 mt-2">
                <Checkbox
                  id="generate-words"
                  checked={generateWords}
                  onCheckedChange={(checked) =>
                    setGenerateWords(checked as boolean)
                  }
                  className="border-amber-300 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                />
                <label
                  htmlFor="generate-words"
                  className="text-sm text-amber-700 cursor-pointer"
                >
                  Generate individual word audio (enables click-to-hear words)
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={generateAudio}
                disabled={isLoading || !text.trim()}
                className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Story...
                  </>
                ) : (
                  <>
                    <Volume2 className="mr-2 h-4 w-4" />
                    Generate Audio Story
                  </>
                )}
              </Button>

              {audioSrc && (
                <>
                  <Button
                    onClick={togglePlayPause}
                    variant="outline"
                    className="border-amber-300 hover:bg-amber-50"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="mr-2 h-4 w-4" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" /> Play
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={resetAudio}
                    variant="outline"
                    className="border-amber-300 hover:bg-amber-50"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>

                  <Select
                    value={playbackSpeed}
                    onValueChange={handleSpeedChange}
                  >
                    <SelectTrigger className="w-36 border-amber-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.60">Slow (0.75x)</SelectItem>
                      <SelectItem value="0.85">Normal (1.0x)</SelectItem>
                      <SelectItem value="1.1">Fast (1.25x)</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={downloadAudio}
                    variant="outline"
                    className="border-amber-300 hover:bg-amber-50"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </>
              )}

              {isLoadingWords && (
                <div className="text-sm text-amber-600 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading word audio...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {paragraphs.length > 0 && (
          <Card className="shadow-xl border-amber-200">
            <CardHeader className="bg-gradient-to-r from-orange-100 to-amber-100">
              <CardTitle className="text-2xl font-normal text-amber-900">
                Click any word to hear it!
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="bg-white rounded-xl p-8 shadow-inner border border-amber-100">
                <div className="space-y-6">
                  {paragraphs.map((paragraph, pIndex) => {
                    // Calculate the starting global index for this paragraph
                    let globalStartIndex = 0;
                    for (let i = 0; i < pIndex; i++) {
                      globalStartIndex += paragraphs[i].words.length;
                    }

                    return (
                      <div key={pIndex} className="flex gap-4 group">
                        {/* Paragraph play button */}
                        <button
                          onClick={() => playParagraph(pIndex)}
                          className="flex-shrink-0 mt-1 p-2 rounded-full bg-amber-100 hover:bg-amber-200 transition-colors opacity-60 hover:opacity-100 group-hover:opacity-100"
                          aria-label={`Play paragraph ${pIndex + 1}`}
                        >
                          <Play className="w-4 h-4 text-amber-700" />
                        </button>

                        {/* Paragraph text */}
                        <div className="flex-1 text-2xl leading-relaxed text-neutral-800">
                          {paragraph.words.map((word, wIndex) => {
                            const globalIndex = globalStartIndex + wIndex;
                            const globalWord = words[globalIndex];
                            const isWordLoading = globalWord?.isLoading;

                            return (
                              <span
                                key={wIndex}
                                onClick={
                                  generateWords
                                    ? () => playWordSegment(globalIndex)
                                    : undefined
                                }
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
                                  inline-block px-1 py-0.5 mx-0.5 rounded-md
                                  transition-all duration-200 select-none relative
                                  ${
                                    generateWords
                                      ? "cursor-pointer"
                                      : "cursor-default"
                                  }
                                  ${
                                    globalIndex === currentWordIndex
                                      ? "bg-yellow-300 shadow-md scale-105 font-medium"
                                      : globalIndex === hoveredWordIndex &&
                                        generateWords
                                      ? "bg-amber-100 shadow-sm scale-102"
                                      : generateWords
                                      ? "hover:bg-amber-50"
                                      : ""
                                  }
                                  ${isWordLoading ? "opacity-60" : ""}
                                `}
                                style={{
                                  fontFamily:
                                    "system-ui, -apple-system, sans-serif",
                                }}
                              >
                                {word.text}
                                {isWordLoading && (
                                  <span className="absolute inset-0 flex items-center justify-center">
                                    <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
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
              </div>
              <div className="mt-4 text-center text-sm text-amber-600">
                {generateWords
                  ? "Tip: Click on any word to hear how it sounds!"
                  : "Tip: Enable 'Generate individual word audio' to click on words"}
              </div>
            </CardContent>
          </Card>
        )}

        {audioSrc && <audio ref={audioRef} src={audioSrc} className="hidden" />}
      </div>
    </div>
  );
}
