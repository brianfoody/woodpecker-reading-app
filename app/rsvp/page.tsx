"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, RotateCcw, Settings } from "lucide-react";

// Calculate the Optimal Recognition Point (ORP) for a word
// This is typically around 35% into the word
function getORPIndex(word: string): number {
  const len = word.length;
  if (len <= 1) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return 4;
}

// Split word into parts: before ORP, ORP character, after ORP
function splitWordAtORP(word: string): { before: string; orp: string; after: string } {
  const orpIndex = getORPIndex(word);
  return {
    before: word.slice(0, orpIndex),
    orp: word[orpIndex] || "",
    after: word.slice(orpIndex + 1),
  };
}

export default function RSVPPage() {
  const [inputText, setInputText] = useState("");
  const [words, setWords] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(300);
  const [showSettings, setShowSettings] = useState(false);
  const [isReaderMode, setIsReaderMode] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate delay between words based on WPM
  const getDelay = useCallback(() => {
    return 60000 / wpm; // milliseconds per word
  }, [wpm]);

  // Start reading
  const startReading = useCallback(() => {
    if (words.length === 0) return;
    setIsPlaying(true);
  }, [words.length]);

  // Pause reading
  const pauseReading = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Reset to beginning
  const resetReading = useCallback(() => {
    pauseReading();
    setCurrentIndex(0);
  }, [pauseReading]);

  // Handle play/pause toggle
  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pauseReading();
    } else {
      startReading();
    }
  }, [isPlaying, pauseReading, startReading]);

  // Start the RSVP reader with the input text
  const beginReading = useCallback(() => {
    const cleanedWords = inputText
      .split(/\s+/)
      .filter((word) => word.trim().length > 0);

    if (cleanedWords.length === 0) return;

    setWords(cleanedWords);
    setCurrentIndex(0);
    setIsReaderMode(true);
    setIsPlaying(true);
  }, [inputText]);

  // Effect to handle word progression
  useEffect(() => {
    if (isPlaying && words.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= words.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, getDelay());
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, words.length, getDelay]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isReaderMode) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === "Escape") {
        setIsReaderMode(false);
        pauseReading();
      } else if (e.code === "ArrowLeft") {
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      } else if (e.code === "ArrowRight") {
        setCurrentIndex((prev) => Math.min(words.length - 1, prev + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isReaderMode, togglePlayPause, pauseReading, words.length]);

  const currentWord = words[currentIndex] || "";
  const { before, orp, after } = splitWordAtORP(currentWord);
  const progress = words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;

  // Reader mode - full screen black background with RSVP display
  if (isReaderMode) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "#000000",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          userSelect: "none",
        }}
      >
        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            color: "#666",
            background: "none",
            border: "none",
            cursor: "pointer",
            zIndex: 10,
          }}
        >
          <Settings className="w-6 h-6" />
        </button>

        {/* Exit button */}
        <button
          onClick={() => {
            setIsReaderMode(false);
            pauseReading();
          }}
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            color: "#666",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            zIndex: 10,
          }}
        >
          Exit (Esc)
        </button>

        {/* Settings panel */}
        {showSettings && (
          <div
            style={{
              position: "absolute",
              top: 56,
              right: 16,
              backgroundColor: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: 8,
              padding: 16,
              width: 256,
              zIndex: 20,
            }}
          >
            <label style={{ color: "#888", fontSize: 14, display: "block", marginBottom: 8 }}>
              Speed: {wpm} WPM
            </label>
            <Slider
              value={[wpm]}
              onValueChange={(value) => setWpm(value[0])}
              min={100}
              max={1000}
              step={25}
              className="w-full"
            />
          </div>
        )}


        {/* Word display with ORP alignment - using monospace font */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: "clamp(48px, 12vw, 80px)",
            fontWeight: 400,
          }}
        >
          {/* Before text - fixed width right-aligned */}
          <span
            style={{
              color: "#ffffff",
              textAlign: "right",
              width: "6ch",
              display: "inline-block",
            }}
          >
            {before}
          </span>
          {/* ORP character */}
          <span style={{ color: "#D35050" }}>{orp}</span>
          {/* After text - left aligned */}
          <span
            style={{
              color: "#ffffff",
              textAlign: "left",
              width: "12ch",
              display: "inline-block",
            }}
          >
            {after}
          </span>
        </div>

        {/* Controls */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          {/* Progress bar */}
          <div
            style={{
              width: 256,
              height: 4,
              backgroundColor: "#333",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                backgroundColor: "#666",
                width: `${progress}%`,
                transition: "width 100ms",
              }}
            />
          </div>

          {/* Control buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={resetReading}
              style={{
                color: "#888",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 8,
              }}
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={togglePlayPause}
              style={{
                color: "#888",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 12,
              }}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8" />
              )}
            </button>
          </div>

          {/* Word count */}
          <span style={{ color: "#666", fontSize: 14 }}>
            {currentIndex + 1} / {words.length}
          </span>
        </div>
      </div>
    );
  }

  // Input mode - text entry screen
  return (
    <div className="min-h-screen bg-neutral-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-medium text-neutral-800">RSVP Reader</h1>
          <p className="text-neutral-600 text-sm">
            Rapid Serial Visual Presentation for focused, fast reading.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">
              Enter text to read
            </label>
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste or type your text here..."
              className="min-h-[200px] resize-none border-neutral-200 focus:border-neutral-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">
              Reading speed: {wpm} WPM
            </label>
            <Slider
              value={[wpm]}
              onValueChange={(value) => setWpm(value[0])}
              min={100}
              max={1000}
              step={25}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-neutral-500">
              <span>100</span>
              <span>1000</span>
            </div>
          </div>

          <Button
            onClick={beginReading}
            disabled={inputText.trim().length === 0}
            className="w-full bg-neutral-800 hover:bg-neutral-700 text-white"
          >
            <Play className="w-4 h-4 mr-2" />
            Start Reading
          </Button>
        </div>

        <div className="text-xs text-neutral-500 space-y-1">
          <p>
            <strong>Keyboard shortcuts (in reader mode):</strong>
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Space - Play/Pause</li>
            <li>Esc - Exit reader</li>
            <li>← → - Previous/Next word</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
