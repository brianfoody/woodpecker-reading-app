/**
 * Generate a random user ID
 */
export function generateUserId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 11);
  return `user_${timestamp}_${randomPart}`;
}

/**
 * Generate a random story ID
 */
export function generateStoryId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${timestamp}${randomPart}`;
}

/**
 * Get or create user ID from localStorage
 */
export function getOrCreateUserId(): string {
  const USER_ID_KEY = "woodpecker_user_id";
  
  // Check if userId already exists in localStorage
  const existingUserId = localStorage.getItem(USER_ID_KEY);
  if (existingUserId) {
    return existingUserId;
  }
  
  // Generate new userId and store it
  const newUserId = generateUserId();
  localStorage.setItem(USER_ID_KEY, newUserId);
  return newUserId;
}

/**
 * Story data structure
 */
export interface StoryData {
  id: string;
  userId: string;
  text: string;
  createdAt: number;
  audioGenerated?: boolean;
}

/**
 * Save story data to localStorage
 */
export function saveStoryData(story: StoryData): void {
  const STORIES_KEY = "woodpecker_stories";
  
  // Get existing stories
  const existingStoriesJson = localStorage.getItem(STORIES_KEY);
  const existingStories: Record<string, StoryData> = existingStoriesJson 
    ? JSON.parse(existingStoriesJson) 
    : {};
  
  // Add or update story
  existingStories[story.id] = story;
  
  // Save back to localStorage
  localStorage.setItem(STORIES_KEY, JSON.stringify(existingStories));
}

/**
 * Get story data by ID
 */
export function getStoryData(storyId: string): StoryData | null {
  const STORIES_KEY = "woodpecker_stories";
  
  const storiesJson = localStorage.getItem(STORIES_KEY);
  if (!storiesJson) return null;
  
  const stories: Record<string, StoryData> = JSON.parse(storiesJson);
  return stories[storyId] || null;
}