import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId = "21m00Tcm4TlvDq8ikWAM", mode = "full" } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // Handle individual word generation mode
    if (mode === "words") {
      // Split text into paragraphs first, then words
      const paragraphs = text.trim().split(/\n\n+/);
      const allWords: string[] = [];
      
      // Extract all unique words from all paragraphs
      paragraphs.forEach((paragraph: string) => {
        const words = paragraph.trim().split(/\s+/).map((word: string) => 
          word.replace(/[.,!?;:'"()\[\]{}]/g, "")
        ).filter((word: string) => word.length > 0);
        allWords.push(...words);
      });
      
      // Get unique words to avoid generating duplicate audio
      const uniqueWords = Array.from(new Set(allWords.map(w => w.toLowerCase())));
      const words = uniqueWords;

      // Process words in batches of 5 to maximize concurrency
      const BATCH_SIZE = 5;
      const wordAudios: Array<{word: string; audioBase64: string | null; error?: string}> = [];
      
      for (let i = 0; i < words.length; i += BATCH_SIZE) {
        const batch = words.slice(i, i + BATCH_SIZE);
        
        // Generate audio for this batch in parallel
        const batchPromises = batch.map(async (word: string) => {
          try {
            const response = await elevenlabs.textToSpeech.convert(voiceId, {
              text: word,
              modelId: "eleven_v3",
            });

            // Convert the response stream to a buffer
            const chunks: Uint8Array[] = [];
            const reader = response.getReader();
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }
            
            // Combine all chunks into a single buffer
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const buffer = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              buffer.set(chunk, offset);
              offset += chunk.length;
            }
            
            const audioBase64 = Buffer.from(buffer).toString("base64");
            
            return {
              word,
              audioBase64: `data:audio/mpeg;base64,${audioBase64}`,
            };
          } catch (error) {
            console.error(`Failed to generate audio for word: ${word}`, error);
            return {
              word,
              audioBase64: null,
              error: `Failed to generate audio for: ${word}`
            };
          }
        });

        // Wait for this batch to complete before starting the next
        const batchResults = await Promise.all(batchPromises);
        wordAudios.push(...batchResults);
        
        // Add a small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < words.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      return NextResponse.json({
        words: wordAudios,
        mode: "words"
      });
    }

    // Handle full mode - generate audio for each paragraph separately
    // Split text into paragraphs
    const paragraphs = text.trim().split(/\n\n+/).filter((p: string) => p.trim().length > 0);
    
    if (paragraphs.length === 0) {
      return NextResponse.json({ error: "No text content found" }, { status: 400 });
    }
    
    // Process paragraphs in batches of 5 to maximize concurrency
    const PARAGRAPH_BATCH_SIZE = 5;
    const paragraphAudios: any[] = [];
    
    for (let i = 0; i < paragraphs.length; i += PARAGRAPH_BATCH_SIZE) {
      const batch = paragraphs.slice(i, i + PARAGRAPH_BATCH_SIZE);
      const batchStartIndex = i;
      
      const batchPromises = batch.map(async (paragraphText: string, batchIndex: number) => {
        const pIndex = batchStartIndex + batchIndex;
        try {
          const response = await elevenlabs.textToSpeech.convertWithTimestamps(
            voiceId,
            {
              text: paragraphText,
              modelId: "eleven_v3",
            }
          );

          if (!response.alignment) {
            throw new Error(`No alignment data for paragraph ${pIndex}`);
          }
          
          return {
            paragraphIndex: pIndex,
            text: paragraphText,
            audioBase64: response.audioBase64,
            alignment: response.alignment,
            normalizedAlignment: response.normalizedAlignment
          };
        } catch (error) {
          console.error(`Failed to generate audio for paragraph ${pIndex}:`, error);
          throw error;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      paragraphAudios.push(...batchResults);
    }
    
    // Sort paragraphs by index to maintain order
    paragraphAudios.sort((a, b) => a.paragraphIndex - b.paragraphIndex);

    // Process each paragraph's alignment data
    const processedParagraphs = paragraphAudios.map((paragraphAudio) => {
      const { characters, characterStartTimesSeconds, characterEndTimesSeconds } =
        paragraphAudio.normalizedAlignment!;

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

        if (char === " " || char === "\n" || char === "\t") {
          if (currentWord.text.trim() !== "") {
            currentWord.endTime = characterEndTimesSeconds[i - 1];
            words.push({ ...currentWord });
          }
          currentWord = {
            text: "",
            startTime: 0,
            endTime: 0,
            characterIndices: [],
          };
        } else {
          if (currentWord.text === "") {
            currentWord.startTime = characterStartTimesSeconds[i];
          }
          currentWord.characterIndices.push(i);
          currentWord.text += char;
        }
      }

      if (currentWord.text !== "") {
        currentWord.endTime = characterEndTimesSeconds[characters.length - 1];
        words.push(currentWord);
      }

      return {
        index: paragraphAudio.paragraphIndex,
        text: paragraphAudio.text,
        audioBase64: paragraphAudio.audioBase64,
        words: words.filter((word) => !/^\[.*\]$/.test(word.text)),
      };
    });

    // Generate combined audio for "Play All" functionality
    // Request full text audio in a single call for seamless playback
    let mainAudioBase64 = "";
    let mainWords: any[] = [];
    
    try {
      const fullResponse = await elevenlabs.textToSpeech.convertWithTimestamps(
        voiceId,
        {
          text: text, // Use the full original text
          modelId: "eleven_v3",
        }
      );
      
      if (fullResponse.audioBase64 && fullResponse.normalizedAlignment) {
        mainAudioBase64 = fullResponse.audioBase64;
        
        // Process the full text alignment for word timestamps
        const { characters, characterStartTimesSeconds, characterEndTimesSeconds } =
          fullResponse.normalizedAlignment;

        let currentWord = {
          text: "",
          startTime: 0,
          endTime: 0,
          characterIndices: [] as number[],
        };

        for (let i = 0; i < characters.length; i++) {
          const char = characters[i];

          if (char === " " || char === "\n" || char === "\t") {
            if (currentWord.text.trim() !== "") {
              currentWord.endTime = characterEndTimesSeconds[i - 1];
              mainWords.push({ ...currentWord });
            }
            currentWord = {
              text: "",
              startTime: 0,
              endTime: 0,
              characterIndices: [],
            };
          } else {
            if (currentWord.text === "") {
              currentWord.startTime = characterStartTimesSeconds[i];
            }
            currentWord.characterIndices.push(i);
            currentWord.text += char;
          }
        }

        if (currentWord.text !== "") {
          currentWord.endTime = characterEndTimesSeconds[characters.length - 1];
          mainWords.push(currentWord);
        }
        
        mainWords = mainWords.filter((word) => !/^\[.*\]$/.test(word.text));
      }
    } catch (error) {
      console.error("Failed to generate combined audio:", error);
      // Fallback to using first paragraph if combined generation fails
      mainAudioBase64 = processedParagraphs[0]?.audioBase64 || "";
    }

    return NextResponse.json({
      audioBase64: mainAudioBase64, // Full combined audio for "Play All"
      words: mainWords.length > 0 ? mainWords : processedParagraphs.flatMap(p => p.words),
      paragraphs: processedParagraphs,
      fullText: text,
    });
  } catch (error) {
    console.error("ElevenLabs API error:", error);
    return NextResponse.json(
      { error: "Failed to generate audio" },
      { status: 500 }
    );
  }
}
