import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId = "21m00Tcm4TlvDq8ikWAM" } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const response = await elevenlabs.textToSpeech.convertWithTimestamps(
      voiceId,
      {
        text: text,
        modelId: "eleven_multilingual_v2",
      }
    );

    if (!response.alignment) {
      return NextResponse.json(
        { error: "No alignment data received" },
        { status: 500 }
      );
    }

    const { characters, characterStartTimesSeconds, characterEndTimesSeconds } =
      response.alignment;

    const words: Array<{
      text: string;
      startTime: number;
      endTime: number;
      characterIndices: number[];
    }> = [];

    let currentWord = {
      text: "",
      startTime: 0,
      endTime: 0,
      characterIndices: [] as number[],
    };

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];

      if (currentWord.text === "") {
        currentWord.startTime = characterStartTimesSeconds[i];
        currentWord.characterIndices.push(i);
        currentWord.text += char;
      } else if (char === " " || char === "\n" || char === "\t") {
        currentWord.endTime = characterEndTimesSeconds[i - 1];
        if (currentWord.text.trim() !== "") {
          words.push({ ...currentWord });
        }
        currentWord = {
          text: "",
          startTime: 0,
          endTime: 0,
          characterIndices: [],
        };
      } else {
        currentWord.characterIndices.push(i);
        currentWord.text += char;
      }
    }

    if (currentWord.text !== "") {
      currentWord.endTime = characterEndTimesSeconds[characters.length - 1];
      words.push(currentWord);
    }

    return NextResponse.json({
      audioBase64: response.audioBase64,
      words,
      fullText: characters.join(""),
    });
  } catch (error) {
    console.error("ElevenLabs API error:", error);
    return NextResponse.json(
      { error: "Failed to generate audio" },
      { status: 500 }
    );
  }
}
