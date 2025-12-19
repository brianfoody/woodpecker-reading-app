"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  RotateCcw,
  Loader2,
  Volume2,
  BookOpen,
  Clock,
  Download,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Word {
  text: string;
  startTime: number;
  endTime: number;
  characterIndices: number[];
}

type PlaybackSpeed = "0.75" | "1" | "1.5";

export default function StoryBookPage() {
  const [text, setText] = useState(
    "The little rabbit hopped through the garden. She found a bright red strawberry and nibbled it happily. The sun was shining and the birds were singing."
  );
  const [words, setWords] = useState<Word[]>([]);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [hoveredWordIndex, setHoveredWordIndex] = useState(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>("1");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isUserInteracting = useRef(false);
  const wordPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const continuousPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const generateAudio = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    setCurrentWordIndex(-1);

    try {
      const response = await fetch("/api/elevenlabs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate audio");
      }

      const data = await response.json();

      setWords(data.words);
      setAudioSrc(`data:audio/mpeg;base64,${data.audioBase64}`);
    } catch (error) {
      console.error("Error generating audio:", error);
      alert("Failed to generate audio. Please check your API key.");
    } finally {
      setIsLoading(false);
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
      
      // Start time update interval
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
      }
      timeUpdateIntervalRef.current = setInterval(() => {
        if (audio) {
          setCurrentTime(audio.currentTime);
        }
      }, 100); // Update time display every 100ms
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      
      // Clear the continuous play interval
      if (continuousPlayIntervalRef.current) {
        clearInterval(continuousPlayIntervalRef.current);
        continuousPlayIntervalRef.current = null;
      }
      
      // Clear time update interval
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
        timeUpdateIntervalRef.current = null;
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
      
      // Clear time update interval
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
        timeUpdateIntervalRef.current = null;
      }
    };
    
    const handleLoadedMetadata = () => {
      if (audio) {
        setDuration(audio.duration);
        setCurrentTime(0);
      }
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      
      // Clean up intervals on unmount
      if (continuousPlayIntervalRef.current) {
        clearInterval(continuousPlayIntervalRef.current);
      }
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
      }
    };
  }, [words]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;

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

  const playWordSegment = async (wordIndex: number) => {
    if (!audioRef.current || !words[wordIndex]) return;

    const word = words[wordIndex];
    const audio = audioRef.current;

    // Log word timing information
    console.log("=== WORD CLICK DEBUG ===");
    console.log(`Word clicked: "${word.text}" (index: ${wordIndex})`);
    console.log(
      `ElevenLabs timing - Start: ${word.startTime}s, End: ${word.endTime}s`
    );
    console.log(
      `Word duration: ${(word.endTime - word.startTime).toFixed(3)}s`
    );
    console.log(`Current playback speed: ${playbackSpeed}x`);

    // Clear any existing interval
    if (wordPlayIntervalRef.current) {
      clearInterval(wordPlayIntervalRef.current);
      wordPlayIntervalRef.current = null;
    }

    // Set interaction flag to prevent automatic highlighting
    isUserInteracting.current = true;

    // Pause if playing
    if (isPlaying) {
      audio.pause();
    }

    // Set the current time to the start of the word
    audio.currentTime = word.startTime;
    setCurrentWordIndex(wordIndex);

    console.log(`Audio position set to: ${audio.currentTime}s`);
    const playStartTime = performance.now();

    // Play the audio
    await audio.play();
    console.log("Audio playback started");

    // Create an interval to check if we've reached the end of the word
    let checkCount = 0;
    wordPlayIntervalRef.current = setInterval(() => {
      checkCount++;
      if (audio.currentTime >= word.endTime || !isUserInteracting.current) {
        const playEndTime = performance.now();
        const actualPlayDuration = (playEndTime - playStartTime) / 1000;

        console.log("=== WORD PLAYBACK ENDED ===");
        console.log(`Audio stopped at: ${audio.currentTime}s`);
        console.log(`Target end time was: ${word.endTime}s`);
        console.log(
          `Overshoot: ${(audio.currentTime - word.endTime).toFixed(3)}s`
        );
        console.log(`Actual play duration: ${actualPlayDuration.toFixed(3)}s`);
        console.log(`Checks performed: ${checkCount}`);
        console.log(
          `Stopped by: ${
            audio.currentTime >= word.endTime
              ? "reached end time"
              : "user interaction flag"
          }`
        );

        audio.pause();
        isUserInteracting.current = false;
        if (wordPlayIntervalRef.current) {
          clearInterval(wordPlayIntervalRef.current);
          wordPlayIntervalRef.current = null;
        }
        // Keep the word highlighted briefly after playing
        setTimeout(() => {
          if (!isPlaying) {
            setCurrentWordIndex(-1);
          }
        }, 200);
      }
    }, 1); // Check every 1ms for precise stopping

    // Add a maximum duration failsafe
    const maxDuration =
      ((word.endTime - word.startTime) * 1000) / parseFloat(playbackSpeed) +
      100;
    console.log(`Failsafe timeout set for: ${maxDuration}ms`);

    setTimeout(() => {
      if (isUserInteracting.current) {
        console.log("=== FAILSAFE TRIGGERED ===");
        console.log(`Audio position at failsafe: ${audio.currentTime}s`);

        audio.pause();
        isUserInteracting.current = false;
        if (wordPlayIntervalRef.current) {
          clearInterval(wordPlayIntervalRef.current);
          wordPlayIntervalRef.current = null;
        }
      }
    }, maxDuration);
  };

  // Set initial playback rate when audio loads
  useEffect(() => {
    if (audioRef.current && audioSrc) {
      audioRef.current.playbackRate = parseFloat(playbackSpeed);
    }
  }, [audioSrc, playbackSpeed]);
  
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  
  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      const newTime = value[0];
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      
      // Update highlighting immediately when seeking
      if (!isPlaying && !isUserInteracting.current) {
        const lookAheadTime = newTime + 0.1;
        let wordIndex = -1;
        for (let i = 0; i < words.length; i++) {
          if (words[i].startTime <= lookAheadTime) {
            wordIndex = i;
          } else {
            break;
          }
        }
        setCurrentWordIndex(wordIndex);
      }
    }
  };
  
  const downloadAudio = () => {
    if (!audioSrc) return;
    
    // Convert base64 to blob
    const base64Data = audioSrc.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'audio/mpeg' });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
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
              <BookOpen className="h-8 w-8" />
              Interactive Storybook Reader
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-8">
            <div className="space-y-2">
              <label
                htmlFor="text-input"
                className="text-sm text-amber-700 font-medium"
              >
                Enter your story text
              </label>
              <Textarea
                id="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste your story here..."
                className="min-h-[140px] resize-none border-amber-200 focus:border-amber-400 text-base"
              />
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
                      <SelectItem value="0.75">Slow (0.75x)</SelectItem>
                      <SelectItem value="1">Normal (1x)</SelectItem>
                      <SelectItem value="1.5">Fast (1.5x)</SelectItem>
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
            </div>
            
            {audioSrc && (
              <div className="space-y-3 border-t pt-4 border-amber-200">
                <div className="flex items-center gap-4">
                  <Button
                    onClick={togglePlayPause}
                    size="sm"
                    variant="outline"
                    className="border-amber-300 hover:bg-amber-50"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  
                  <div className="flex-1 flex items-center gap-3">
                    <span className="text-sm text-amber-700 min-w-[45px]">
                      {formatTime(currentTime)}
                    </span>
                    <Slider
                      value={[currentTime]}
                      onValueChange={handleSeek}
                      max={duration}
                      step={0.001}
                      className="flex-1"
                    />
                    <span className="text-sm text-amber-700 min-w-[45px]">
                      {formatTime(duration)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-amber-700">
                      {formatTime(duration - currentTime)} left
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {words.length > 0 && (
          <Card className="shadow-xl border-amber-200">
            <CardHeader className="bg-gradient-to-r from-orange-100 to-amber-100">
              <CardTitle className="text-2xl font-normal text-amber-900">
                Click any word to hear it!
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="bg-white rounded-xl p-8 shadow-inner border border-amber-100">
                <div className="text-2xl leading-relaxed text-neutral-800 space-y-2">
                  {words.map((word, index) => (
                    <span
                      key={index}
                      onClick={() => playWordSegment(index)}
                      onMouseEnter={() => setHoveredWordIndex(index)}
                      onMouseLeave={() => setHoveredWordIndex(-1)}
                      className={`
                        inline-block px-1 py-0.5 mx-0.5 rounded-md cursor-pointer
                        transition-all duration-200 select-none
                        ${
                          index === currentWordIndex
                            ? "bg-yellow-300 shadow-md scale-105 font-medium"
                            : index === hoveredWordIndex
                            ? "bg-amber-100 shadow-sm scale-102"
                            : "hover:bg-amber-50"
                        }
                      `}
                      style={{
                        fontFamily: "system-ui, -apple-system, sans-serif",
                      }}
                    >
                      {word.text}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 text-center text-sm text-amber-600">
                Tip: Click on any word to hear how it sounds!
              </div>
            </CardContent>
          </Card>
        )}

        {audioSrc && <audio ref={audioRef} src={audioSrc} className="hidden" />}
      </div>
    </div>
  );
}
