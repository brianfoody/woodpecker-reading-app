"use client";

import type React from "react";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  createSentenceAudio,
  playAudioBlob,
  type WordAudio,
} from "@/lib/audio";
import {
  loadPreGeneratedAudio,
  initializeCacheWithPreGeneratedAudio,
} from "@/lib/preload-audio";
import { useVoiceRecording } from "@/lib/useVoiceRecording";

export default function ReadingApp() {
  const [sentence, setSentence] = useState("The silly monkey lost his banana");
  const [inputSentence, setInputSentence] = useState(
    "The silly monkey lost his banana"
  );
  const [isCreating, setIsCreating] = useState(false);
  const [wordAudios, setWordAudios] = useState<WordAudio[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const words = sentence.split(" ");

  const [activeWord, setActiveWord] = useState<number | null>(null);
  const [swipeWords, setSwipeWords] = useState<number[]>([]);
  const [isSwiping, setIsSwiping] = useState(false); // Controls if a swipe gesture is active (pointer down and moving)
  const [isAnimating, setIsAnimating] = useState(false); // Controls animation state for word sequences
  const [lastPlayedWord, setLastPlayedWord] = useState<{
    index: number;
    time: number;
  } | null>(null);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pointerStart, setPointerStart] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Voice recording hook
  const {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
    cleanup: cleanupRecording,
  } = useVoiceRecording({
    onTranscription: (text) => {
      setInputSentence(text);
      handleCreateSentence(text);
      setVoiceError(null);
    },
    onError: (error) => {
      setVoiceError(error);
      setTimeout(() => setVoiceError(null), 5000);
    },
  });

  // Detect mobile/tablet on mount and prevent gestures
  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      // Consider tablet and mobile (typically < 1024px)
      setIsMobileOrTablet(width < 1024);
    };

    // Prevent gesture-based context menus on iOS
    const preventGesture = (e: Event) => {
      e.preventDefault();
    };

    checkDevice();
    window.addEventListener("resize", checkDevice);
    document.addEventListener("gesturestart", preventGesture);
    
    return () => {
      window.removeEventListener("resize", checkDevice);
      document.removeEventListener("gesturestart", preventGesture);
      cleanupRecording();
    };
  }, [cleanupRecording]);

  // Load audio for initial sentence on mount
  useEffect(() => {
    const loadInitialAudio = async () => {
      setIsInitializing(true);
      try {
        // First try to load pregenerated audio
        const preGeneratedAudio = await loadPreGeneratedAudio();

        if (preGeneratedAudio && preGeneratedAudio.length > 0) {
          console.log("Using pregenerated audio files");
          setWordAudios(preGeneratedAudio);

          // Also initialize the cache with these files
          await initializeCacheWithPreGeneratedAudio();
        } else {
          // Fall back to generating audio via API
          console.log("Generating audio via API");
          const audios = await createSentenceAudio(sentence);
          setWordAudios(audios);
        }
      } catch (error) {
        console.error("Failed to load initial audio:", error);
      } finally {
        setIsInitializing(false);
      }
    };

    loadInitialAudio();
  }, []); // Only run once on mount

  // Handle sentence creation with actual audio generation
  const handleCreateSentence = useCallback(
    async (sentenceOverride?: string) => {
      const sentenceToUse = sentenceOverride || inputSentence;
      if (!sentenceToUse.trim() || isCreating) return;

      setIsCreating(true);
      // Clear any active interactions
      setActiveWord(null);
      setSwipeWords([]);
      setIsSwiping(false);

      try {
        // Generate audio for all words in the sentence
        const audios = await createSentenceAudio(sentenceToUse);
        setWordAudios(audios);

        // Update the sentence after generation
        setSentence(sentenceToUse);
      } catch (error) {
        console.error("Failed to generate audio:", error);
        // Still update the sentence even if audio generation fails
        setSentence(sentenceToUse);
        setWordAudios([]);
      } finally {
        setIsCreating(false);
      }
    },
    [inputSentence, isCreating]
  );

  // Unified pointer handlers for mouse and touch
  const getClientCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if ("touches" in e) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const animateWordSequence = useCallback(
    async (indices: number[]) => {
      setIsAnimating(true);
      const sortedIndices = [...indices].sort((a, b) => a - b);

      for (const index of sortedIndices) {
        // Check if animation was cancelled
        const shouldContinue = await new Promise<boolean>((resolve) => {
          setIsAnimating((current: boolean) => {
            if (!current) {
              resolve(false); // Animation was cancelled
              return current;
            }
            resolve(true);
            return current;
          });
        });

        if (!shouldContinue) break;

        setActiveWord(index);
        // Strip punctuation and find the audio for this word
        const cleanWord = words[index].replace(/[.,!?;:'"'()\[\]{}]/g, "");
        const wordAudio = wordAudios.find(
          (wa) => wa.word.toLowerCase() === cleanWord.toLowerCase()
        );
        if (wordAudio) {
          try {
            // Don't await, let audio play in background
            playAudioBlob(wordAudio.audio);
            // Wait for the audio duration plus a small pause
            await new Promise((resolve) =>
              setTimeout(resolve, wordAudio.duration - 100)
            );
          } catch (error) {
            console.error(`Failed to play word: ${words[index]}`, error);
            // Fallback delay if audio fails
            await new Promise((resolve) => setTimeout(resolve, 800));
          }
        } else {
          // Default delay if no audio found
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
        setActiveWord(null);
      }
      setIsAnimating(false);
    },
    [words, wordAudios]
  );

  // Removed handleWordTap - now handled in handlePointerEnd

  const handlePointerStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, index: number) => {
      e.preventDefault(); // Prevent browser scroll/selection
      e.stopPropagation(); // Stop event propagation to prevent any click events
      if (isCreating) return; // Only prevent during creation

      // Allow starting new swipe even if animation is playing
      const coords = getClientCoords(e);
      setPointerStart(coords);
      setSwipeWords([index]);
      setIsSwiping(true); // Indicate that a swipe gesture has started
      setIsAnimating(false); // Cancel any ongoing animation
    },
    [isCreating]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!pointerStart || !isSwiping) return; // Only process if a swipe is active

      e.preventDefault(); // Prevent browser scroll/selection

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

  const handlePointerEnd = useCallback(async () => {
    if (isSwiping) {
      const now = Date.now();

      // Only process if a swipe was active
      if (swipeWords.length > 1) {
        // Multiple words - play sequence
        animateWordSequence(swipeWords);
      } else if (swipeWords.length === 1) {
        // Single tap - play the word
        const index = swipeWords[0];

        // Prevent double-tap on the same word within 300ms
        if (
          lastPlayedWord &&
          lastPlayedWord.index === index &&
          now - lastPlayedWord.time < 300
        ) {
          // Reset state but don't play
          setPointerStart(null);
          setIsSwiping(false);
          setTimeout(() => setSwipeWords([]), 500);
          return;
        }

        const word = words[index];
        if (word) {
          setActiveWord(index);
          setLastPlayedWord({ index, time: now });

          // Strip punctuation from the word before finding audio
          const cleanWord = word.replace(/[.,!?;:'"'()\[\]{}]/g, "");

          const wordAudio = wordAudios.find(
            (wa) => wa.word.toLowerCase() === cleanWord.toLowerCase()
          );
          if (wordAudio) {
            try {
              playAudioBlob(wordAudio.audio).then(() => {
                setActiveWord((current) =>
                  current === index ? null : current
                );
              });
            } catch (error) {
              console.error("Error playing word audio:", error);
            }
          }
        }
      }
      setPointerStart(null);
      setIsSwiping(false); // End the swipe gesture
      setTimeout(() => setSwipeWords([]), 500); // Clear swiped words after a short delay
    }
  }, [
    swipeWords,
    isSwiping,
    animateWordSequence,
    words,
    wordAudios,
    lastPlayedWord,
  ]);

  return (
    <div className="min-h-screen bg-neutral-50 p-4 md:p-6 lg:p-8 flex items-center justify-center">
      <div className="max-w-7xl w-full">
        {/* Header */}
        <div className="mb-8 md:mb-12">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-medium text-neutral-800 mb-2">
            Reading Practice
          </h1>
          <p className="text-base md:text-lg lg:text-xl text-neutral-600">
            Listen to words individually or in groups
          </p>
        </div>

        {/* Sentence Input - Desktop only */}
        {!isMobileOrTablet && (
          <div className="mb-8 md:mb-10">
            <label
              htmlFor="sentence-input"
              className="block text-base md:text-lg font-medium text-neutral-700 mb-3"
            >
              Enter sentence
            </label>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                id="sentence-input"
                type="text"
                value={inputSentence}
                onChange={(e) => setInputSentence(e.target.value)}
                disabled={isCreating}
                className="flex-1 px-5 py-4 md:px-6 md:py-4 bg-white border border-neutral-200 rounded-lg text-lg md:text-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                placeholder="Type your sentence here"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCreating) {
                    handleCreateSentence();
                  }
                }}
              />
              <motion.button
                onClick={() => handleCreateSentence()}
                disabled={isCreating || !inputSentence.trim()}
                className={`
                  px-8 py-4 md:px-10 md:py-4 rounded-lg font-medium text-white text-lg md:text-xl
                  transition-all duration-200 shadow-sm
                  ${
                    isCreating
                      ? "bg-neutral-400 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-700 hover:shadow-md"
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
                whileHover={!isCreating ? { scale: 1.03 } : {}}
                whileTap={!isCreating ? { scale: 0.97 } : {}}
              >
                {isCreating ? "Preparing..." : "Generate Audio"}
              </motion.button>
            </div>
          </div>
        )}

        {/* Reading Area */}
        <div
          ref={containerRef}
          className="bg-white rounded-xl border border-neutral-200 p-6 md:p-8 lg:p-10 flex flex-col justify-center items-center overflow-hidden relative shadow-sm"
          style={{
            touchAction: "none", // Prevent browser scroll/zoom gestures
            minHeight: "400px",
            backgroundImage: `radial-gradient(circle at 20% 50%, rgba(16, 185, 129, 0.02) 0%, transparent 50%),
                             radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.02) 0%, transparent 50%)`,
          }}
          onTouchMove={handlePointerMove}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handlePointerEnd();
          }}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerEnd}
          onMouseLeave={handlePointerEnd} // End drag if mouse leaves container
        >
          {/* Loading animation overlay */}
          <AnimatePresence>
            {(isCreating || isInitializing) && (
              <motion.div
                className="absolute inset-0 bg-white z-50 flex flex-col items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Simple loading indicator */}
                <div className="flex flex-col items-center">
                  {/* Three dots loader */}
                  <div className="flex gap-2 mb-6">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-3 h-3 rounded-full bg-emerald-500"
                        animate={{
                          y: [0, -12, 0],
                        }}
                        transition={{
                          duration: 0.6,
                          repeat: Infinity,
                          delay: i * 0.15,
                          ease: "easeInOut",
                        }}
                      />
                    ))}
                  </div>

                  {/* Progress bar */}
                  <div className="w-56 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-emerald-500 rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 5, ease: "easeOut" }}
                    />
                  </div>

                  {/* Loading text */}
                  <p className="mt-4 text-sm text-neutral-600">
                    {isInitializing ? "Loading audio..." : "Preparing audio"}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content with fade transition */}
          <AnimatePresence mode="wait">
            {!isCreating && (
              <motion.div
                key={sentence} // Key ensures re-render on sentence change
                className="flex flex-col items-center w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Sentence */}
                <div className="flex flex-wrap justify-center gap-x-4 md:gap-x-6 gap-y-6 md:gap-y-8 mb-12 px-4">
                  {words.map((word, index) => (
                    <div key={index} className="flex flex-col items-center">
                      {/* Word */}
                      <motion.div
                        data-word-index={index}
                        className={`
                          text-3xl md:text-4xl font-medium cursor-pointer select-none 
                          px-3 md:px-4 py-2 md:py-3 rounded-lg
                          transition-all duration-200 relative
                          ${
                            activeWord === index
                              ? "text-white bg-emerald-600 shadow-lg"
                              : "text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50"
                          }
                          ${
                            swipeWords.includes(index) && isSwiping
                              ? "bg-amber-50 text-amber-900 ring-2 ring-amber-200"
                              : ""
                          }
                        `}
                        onTouchStart={(e) => handlePointerStart(e, index)}
                        onMouseDown={(e) => handlePointerStart(e, index)}
                        animate={{
                          scale: activeWord === index ? 1.1 : 1,
                          y: activeWord === index ? -4 : 0,
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                        }}
                      >
                        {word}
                      </motion.div>

                      {/* Dot indicator */}
                      <motion.div
                        className={`
                          w-3 h-3 md:w-4 md:h-4 rounded-full mt-3 md:mt-4 cursor-pointer transition-all duration-200
                          ${
                            activeWord === index
                              ? "bg-emerald-600"
                              : "bg-neutral-300 hover:bg-neutral-400"
                          }
                          ${
                            swipeWords.includes(index) && isSwiping
                              ? "bg-amber-400"
                              : ""
                          }
                        `}
                        animate={{
                          scale: activeWord === index ? 1.4 : 1,
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 15,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Microphone Button - Mobile/Tablet only */}
        {isMobileOrTablet && (
          <div className="mt-8 flex flex-col items-center">
            <button
              id="ptt-button"
              aria-label="Hold to talk"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                if (!isRecording && !isTranscribing && !isCreating) {
                  startRecording();
                }
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isRecording) {
                  stopRecording();
                }
              }}
              onPointerCancel={(e) => {
                e.preventDefault();
                if (isRecording) {
                  stopRecording();
                }
              }}
              onLostPointerCapture={(e) => {
                e.preventDefault();
                if (isRecording) {
                  stopRecording();
                }
              }}
              onContextMenu={(e) => e.preventDefault()}
              onMouseLeave={(e) => {
                e.preventDefault();
                if (isRecording) {
                  stopRecording();
                }
              }}
              disabled={isCreating || isTranscribing}
              className={`
                relative w-24 h-24 rounded-full flex items-center justify-center
                transition-all duration-200 shadow-lg
                ${
                  isRecording
                    ? "bg-red-500 scale-110"
                    : isTranscribing
                    ? "bg-amber-500"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
              style={{
                WebkitUserSelect: "none",
                userSelect: "none",
                WebkitTouchCallout: "none",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                caretColor: "transparent",
                cursor: "pointer",
              }}
            >
              {/* Microphone Icon */}
              <svg
                className="w-10 h-10 text-white select-none pointer-events-none"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  WebkitTouchCallout: "none",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                }}
              >
                <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
                <path d="M16 11a4 4 0 0 1-8 0H6a6 6 0 0 0 12 0h-2Z" />
                <path d="M12 18a6 6 0 0 0 6-6h-2a4 4 0 0 1-8 0H6a6 6 0 0 0 5 5.917V21h2v-3.083A5.998 5.998 0 0 0 12 18Z" />
              </svg>

              {/* Recording Indicator */}
              {isRecording && (
                <div className="absolute top-0 right-0 w-4 h-4 bg-white rounded-full animate-pulse" />
              )}

              {/* Pulse Animation */}
              {isRecording && (
                <div className="absolute inset-0 rounded-full bg-red-400 opacity-30 animate-ping" />
              )}
            </button>

            {/* Status Text */}
            <p className="mt-4 text-sm text-neutral-600 select-none" style={{ userSelect: "none" }}>
              {isRecording
                ? "Recording... Release to stop"
                : isTranscribing
                ? "Transcribing..."
                : "Hold to talk"}
            </p>

            {/* Error Message */}
            {voiceError && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-2 text-sm text-red-600"
              >
                {voiceError}
              </motion.p>
            )}

            {/* Transcribed Text Preview */}
            {/* {inputSentence && !isRecording && !isTranscribing && (
              <div className="mt-4 p-3 bg-neutral-100 rounded-lg max-w-full">
                <p className="text-sm text-neutral-600 mb-1">
                  Ready to generate:
                </p>
                <p className="text-base text-neutral-800 italic">
                  "{inputSentence}"
                </p>
              </div>
            )} */}
          </div>
        )}

        {/* Word count */}
        {/* <div className="mt-6 md:mt-8 text-center">
          <p className="text-base md:text-lg lg:text-xl text-neutral-600">
            {words.length} {words.length === 1 ? "word" : "words"}
          </p>
        </div> */}

        {/* Call to Action */}
        <div className="mt-12 md:mt-16 text-center">
          <div className="inline-block">
            <p className="text-lg md:text-lg text-neutral-700 mb-2">
              Want to create magical learning experiences for your child?
            </p>
            <a
              href="https://woodpeckeros.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xl md:text-xl text-emerald-600 hover:text-emerald-700 font-bold transition-all duration-300 hover:scale-105 group"
            >
              Join Woodpecker
              <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </a>
            <p className="text-sm md:text-base text-neutral-500 mt-2">
              Build personalized learning experiences that grow with them. 🌱
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
