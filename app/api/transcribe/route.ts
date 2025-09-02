import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    // Log the transcription request
    const timestamp = new Date().toISOString();
    const userAgent = request.headers.get("user-agent") || "unknown";
    const ip = request.headers.get("x-forwarded-for") || 
                request.headers.get("x-real-ip") || 
                "unknown";
    
    console.log(`[${timestamp}] Transcription Request:`, {
      ip,
      userAgent,
    });

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ API key is not configured" },
        { status: 500 }
      );
    }

    // Get the audio blob from the request
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;
    
    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    // Convert File to a format Groq can accept
    const audioBuffer = await audioFile.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: audioFile.type });
    
    // Create a File object with the proper name and type
    const file = new File([audioBlob], "recording.webm", { type: "audio/webm" });

    // Create transcription using Groq
    const transcription = await groqClient.audio.transcriptions.create({
      file: file,
      model: "whisper-large-v3-turbo",
      response_format: "json",
      language: "en",
      temperature: 0.0,
    });

    console.log(`[${timestamp}] Transcription Result:`, {
      text: transcription.text,
      length: transcription.text?.length,
    });

    return NextResponse.json({
      text: transcription.text,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}