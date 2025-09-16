import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import escape from "lodash.escape"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely escapes HTML entities in user-generated content to prevent XSS attacks.
 * This function should be used whenever displaying user-provided text content.
 * 
 * @param text - The user-generated text to escape
 * @returns HTML-escaped string safe for display
 */
export function safeText(text: string | null | undefined): string {
  if (!text) return '';
  return escape(text);
}

/**
 * Validates and sanitizes URLs to prevent XSS attacks through href attributes.
 * Only allows http: and https: protocols to prevent javascript: and other dangerous schemes.
 * 
 * @param url - The URL to validate and sanitize
 * @returns Safe URL string or null if URL is invalid/unsafe
 */
export function urlSafeHref(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  
  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
