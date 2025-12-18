import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenlabs = new ElevenLabsClient({});

async function createWordHighlightedAudio() {
  const voiceId = "YOUR_VOICE_ID";
  const text =
    "This is a sample text that will be highlighted word by word as it plays.";

  // Generate speech with timestamps
  const response = await elevenlabs.textToSpeech.convertWithTimestamps(
    voiceId,
    {
      text: "Hello there my friend",
      modelId: "eleven_multilingual_v2",
    }
  );

  // Extract character data
  const { characters, characterStartTimesSeconds, characterEndTimesSeconds } =
    response.alignment!;

  // Group characters into words
  const words: string[] = [];
  let currentWord = {
    text: "",
    startTime: 0,
    endTime: 0,
    characterIndices: [] as number[],
  };

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];

    // If this is the first character of the word
    if (currentWord.text === "") {
      currentWord.startTime = characterStartTimesSeconds[i];
      currentWord.characterIndices.push(i);
      currentWord.text += char;
    }
    // If this is a space, end the current word and start a new one
    else if (char === " " || char === "\n" || char === "\t") {
      currentWord.endTime = characterEndTimesSeconds[i - 1]; // End time of previous character
      words.push({ ...currentWord });
      currentWord = {
        text: "",
        startTime: 0,
        endTime: 0,
        characterIndices: [],
      };
    }
    // Continue building the current word
    else {
      currentWord.characterIndices.push(i);
      currentWord.text += char;
    }
  }

  // Add the last word if it exists
  if (currentWord.text !== "") {
    currentWord.endTime = characterEndTimesSeconds[characters.length - 1];
    words.push(currentWord as any);
  }

  // Create audio element
  const audioElement = document.createElement("audio");
  audioElement.src = `data:audio/mpeg;base64,${response.audioBase64}`;
  audioElement.controls = true;
  document.body.appendChild(audioElement);

  // Create text display container
  const textContainer = document.createElement("div");
  textContainer.style.lineHeight = "1.5";
  textContainer.style.fontSize = "18px";
  document.body.appendChild(textContainer);

  // Create spans for each word
  words.forEach((word, index) => {
    const wordSpan = document.createElement("span");
    wordSpan.textContent = word.text + (index < words.length - 1 ? " " : "");
    wordSpan.id = `word-${index}`;
    textContainer.appendChild(wordSpan);
  });

  // Update highlighting during playback
  audioElement.addEventListener("timeupdate", () => {
    const currentTime = audioElement.currentTime;

    // Reset all highlights
    words.forEach((word, index) => {
      document.getElementById(`word-${index}`).style.backgroundColor =
        "transparent";
    });

    // Find the current word based on timestamp
    for (let i = 0; i < words.length; i++) {
      if (
        words[i].startTime <= currentTime &&
        currentTime <= words[i].endTime
      ) {
        document.getElementById(`word-${i}`).style.backgroundColor = "yellow";
        break;
      }
    }
  });

  return {
    audioElement,
    words,
    text: characters.join(""),
  };
}
