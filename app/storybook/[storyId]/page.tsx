import StoryBookClient from "../StoryBookClient";
import { use } from "react";

interface PageProps {
  params: Promise<{ storyId: string }>;
}

export default function StoryPage({ params }: PageProps) {
  const { storyId } = use(params);
  return <StoryBookClient storyId={storyId} />;
}