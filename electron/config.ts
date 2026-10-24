import { config } from 'dotenv';
import path from 'node:path';
export function loadGeminiConfig(packaged: boolean, executable: string, appRoot: string) {
  const directory = packaged
    ? process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(executable)
    : appRoot;
  config({ path: path.join(directory, '.env'), override: false, quiet: true });
  return {
    apiKey: process.env.GEMINI_API_KEY?.trim() || '',
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
  };
}
