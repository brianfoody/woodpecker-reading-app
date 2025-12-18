"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Pause, RotateCcw, Loader2, Gauge } from "lucide-react";
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

type PlaybackSpeed = "0.5" | "1" | "2";

export default function AudioPage() {
  const [text, setText] = useState(
    "Welcome to the reading app. This text will be converted to speech and highlighted word by word as it plays."
  );
  const [words, setWords] = useState<Word[]>([]);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>("1");
  const audioRef = useRef<HTMLAudioElement>(null);

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

    const handleTimeUpdate = () => {
      const currentTime = audio.currentTime;
      
      // Add a small look-ahead offset (100ms) to highlight words slightly before they're spoken
      // This makes the highlighting feel more responsive and natural
      const lookAheadTime = currentTime + 0.1;

      // Find the word that should be highlighted based on current playback time
      let wordIndex = -1;
      for (let i = 0; i < words.length; i++) {
        if (words[i].startTime <= lookAheadTime) {
          wordIndex = i;
        } else {
          break; // Stop once we hit a word that hasn't started yet
        }
      }

      // Always set the index - React will handle if it's the same value
      setCurrentWordIndex(wordIndex);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentWordIndex(-1);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [words]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;

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

  // Set initial playback rate when audio loads
  useEffect(() => {
    if (audioRef.current && audioSrc) {
      audioRef.current.playbackRate = parseFloat(playbackSpeed);
    }
  }, [audioSrc, playbackSpeed]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-50 to-neutral-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-normal text-neutral-700">
              Text to Speech Reader
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="text-input" className="text-sm text-neutral-600">
                Enter text to convert to speech
              </label>
              <Textarea
                id="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste your text here..."
                className="min-h-[120px] resize-none border-neutral-200 focus:border-neutral-400"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={generateAudio}
                disabled={isLoading || !text.trim()}
                className="bg-neutral-800 hover:bg-neutral-700 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Audio"
                )}
              </Button>

              {audioSrc && (
                <>
                  <Button
                    onClick={togglePlayPause}
                    variant="outline"
                    className="border-neutral-300"
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
                    className="border-neutral-300"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>

                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-neutral-600" />
                    <Select
                      value={playbackSpeed}
                      onValueChange={handleSpeedChange}
                    >
                      <SelectTrigger className="w-32 border-neutral-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.75">Slow (0.75x)</SelectItem>
                        <SelectItem value="1">Normal (1x)</SelectItem>
                        <SelectItem value="1.5">Fast (1.5x)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {words.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-normal text-neutral-700">
                Reading Display
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg leading-relaxed text-neutral-700 p-6 bg-white rounded-lg">
                {words.map((word, index) => (
                  <span
                    key={index}
                    className={`transition-all duration-200 ${
                      index === currentWordIndex
                        ? "bg-yellow-200 px-1 rounded"
                        : ""
                    }`}
                  >
                    {word.text}
                    {index < words.length - 1 && " "}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {audioSrc && <audio ref={audioRef} src={audioSrc} className="hidden" />}
      </div>
    </div>
  );
}
