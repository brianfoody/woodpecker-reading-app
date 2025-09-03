import { useState, useRef, useCallback } from "react";
import { playStartSound, playStopSound, playErrorSound } from "./audioFeedback";

interface UseVoiceRecordingOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceRecording(options: UseVoiceRecordingOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<
    "granted" | "denied" | "prompt"
  >("prompt");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      // Reset chunks
      audioChunksRef.current = [];

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;
      setPermissionStatus("granted");

      // Create MediaRecorder with the stream
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
      });
      mediaRecorderRef.current = mediaRecorder;

      // Collect audio chunks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      playStartSound(); // Play feedback sound
    } catch (error) {
      console.error("Failed to start recording:", error);
      setPermissionStatus("denied");
      playErrorSound(); // Play error sound
      options.onError?.(
        "Microphone access denied. Please enable microphone permissions."
      );
    }
  }, [options]);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state !== "recording") return;

    return new Promise<void>((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        setIsTranscribing(true);
        playStopSound(); // Play feedback sound

        // Stop all tracks to release the microphone
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // Create blob from chunks
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });

        try {
          // Send to transcription API
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");

          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error("Transcription failed");
          }

          const data = await response.json();

          if (data.text) {
            options.onTranscription?.(data.text.trim());
          } else {
            playErrorSound();
            options.onError?.("No transcription received");
          }
        } catch (error) {
          console.error("Transcription error:", error);
          playErrorSound();
          options.onError?.("Failed to transcribe audio. Please try again.");
        } finally {
          setIsTranscribing(false);
          resolve();
        }
      };

      // Stop the media recorder
      mediaRecorder.stop();
      mediaRecorderRef.current = null;
    });
  }, [options]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  return {
    isRecording,
    isTranscribing,
    permissionStatus,
    startRecording,
    stopRecording,
    cleanup,
  };
}
