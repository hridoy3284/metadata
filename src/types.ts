export type Platform = 'adobe' | 'shutterstock' | 'freepik' | 'vecteezy';

export type AIProvider = 'gemini' | 'groq' | 'grok';

export interface AIConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

export interface StockMetadata {
  id: string;
  fileName: string;
  title: string;
  description: string;
  keywords: string[];
  thumbnail: string; // Base64 or Blob URL
  status: 'idle' | 'generating' | 'completed' | 'error';
  error?: string;
}

export interface GenerationSettings {
  keywordCount: number;
  titleWordCount: number;
  descriptionWordCount: number;
}

export interface StockProject {
  id: string;
  userId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  images: StockMetadata[];
  settings: GenerationSettings;
}
