import type { ModelRef } from "./types.js";

/**
 * Task -> [primary, fallback] models, output budget and timeout.
 *
 * Primary models match what each legacy function used (see prompts/README.md),
 * without the old gateway's vendor prefix. Fallbacks are on the other vendor so
 * one vendor outage never takes a feature down. Token budgets and timeouts are
 * starting values; AI-02 metering will show whether they need tuning.
 *
 * Image and video generation (lesson-images, slide-images, video-scene) are not
 * text calls; they get their own interface with AI-10, AI-12 and AI-17.
 *
 * Changing this file triggers the eval run in CI once AI-04 lands.
 */
export interface TaskRoute {
  primary: ModelRef;
  fallback: ModelRef;
  maxOutputTokens: number;
  /** Per attempt. A request that falls back can take up to twice this. */
  timeoutMs: number;
}

const GEMINI_FLASH: ModelRef = { provider: "gemini", model: "gemini-3-flash-preview" };
const GEMINI_FLASH_LITE: ModelRef = { provider: "gemini", model: "gemini-2.5-flash-lite" };
const GEMINI_FLASH_OCR: ModelRef = { provider: "gemini", model: "gemini-2.5-flash" };
const OPENAI_MAIN: ModelRef = { provider: "openai", model: "gpt-6-astra" };

export const AI_ROUTES = {
  "lesson-classroom": {
    primary: GEMINI_FLASH,
    fallback: OPENAI_MAIN,
    maxOutputTokens: 8192,
    timeoutMs: 90_000,
  },
  "lesson-online": {
    primary: GEMINI_FLASH,
    fallback: OPENAI_MAIN,
    maxOutputTokens: 8192,
    timeoutMs: 90_000,
  },
  quiz: {
    primary: GEMINI_FLASH_LITE,
    fallback: OPENAI_MAIN,
    maxOutputTokens: 2048,
    timeoutMs: 30_000,
  },
  "resource-worksheet": {
    primary: OPENAI_MAIN,
    fallback: GEMINI_FLASH,
    maxOutputTokens: 8192,
    timeoutMs: 120_000,
  },
  "resource-slides": {
    primary: OPENAI_MAIN,
    fallback: GEMINI_FLASH,
    maxOutputTokens: 8192,
    timeoutMs: 120_000,
  },
  "resource-rubric": {
    primary: OPENAI_MAIN,
    fallback: GEMINI_FLASH,
    maxOutputTokens: 4096,
    timeoutMs: 60_000,
  },
  "resource-video": {
    primary: OPENAI_MAIN,
    fallback: GEMINI_FLASH,
    maxOutputTokens: 4096,
    timeoutMs: 60_000,
  },
  "ocr-handwriting": {
    primary: GEMINI_FLASH_OCR,
    fallback: OPENAI_MAIN,
    maxOutputTokens: 4096,
    timeoutMs: 60_000,
  },
  "assess-script": {
    primary: GEMINI_FLASH,
    fallback: OPENAI_MAIN,
    maxOutputTokens: 4096,
    timeoutMs: 60_000,
  },
  "assess-writing": {
    primary: GEMINI_FLASH,
    fallback: OPENAI_MAIN,
    maxOutputTokens: 4096,
    timeoutMs: 60_000,
  },
  "assess-batch": {
    primary: GEMINI_FLASH,
    fallback: OPENAI_MAIN,
    maxOutputTokens: 4096,
    timeoutMs: 60_000,
  },
} as const satisfies Record<string, TaskRoute>;

export type AiTask = keyof typeof AI_ROUTES;

export type AiRoutes = Record<AiTask, TaskRoute>;
