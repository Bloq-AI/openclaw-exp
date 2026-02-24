import { SupabaseClient } from "@supabase/supabase-js";
import { executeAnalyze } from "./analyze";
import { executeWriteContent } from "./write-content";
import { executePostTweet } from "./post-tweet";
import { executeScanGithub } from "./scan-github";
import { executeDraftLinkedinPost } from "./draft-linkedin-post";
import { executeScanXCompetitors } from "./scan-x-competitors";
import { executeDraftXPost } from "./draft-x-post";
import { executeGenerateImage } from "./generate-image";
import { executeTrackTweetPerformance } from "./track-tweet-performance";
import { executeSelectTopPerformers } from "./select-top-performers";
import { executePromoteToLinkedIn } from "./promote-to-linkedin";
import { executePostLinkedIn } from "./post-linkedin";
import { executeAnalyzeContentPerformance } from "./analyze-content-performance";
import { executeJudgeContentQuality } from "./judge-content-quality";
import { executeSynthesizeImprovements } from "./synthesize-improvements";
import { executeEvolveImagePrompts } from "./evolve-image-prompts";

type StepInput = { id: string; payload: Record<string, unknown> };
type ExecutorResult = { ok: boolean; output?: unknown; error?: string };
type ExecutorFn = (sb: SupabaseClient, step: StepInput) => Promise<ExecutorResult>;

export const executors: Record<string, ExecutorFn> = {
  // ── Core ──────────────────────────────────────────────────────────
  analyze:              executeAnalyze,
  write_content:        executeWriteContent,

  // ── Twitter / X ───────────────────────────────────────────────────
  scan_x_competitors:        executeScanXCompetitors,
  draft_x_post:              executeDraftXPost,
  post_tweet:                executePostTweet,
  track_tweet_performance:   executeTrackTweetPerformance,

  // ── LinkedIn ──────────────────────────────────────────────────────
  scan_github:               executeScanGithub,
  draft_linkedin_post:       executeDraftLinkedinPost,
  post_linkedin:             executePostLinkedIn,

  // ── Cross-platform pipeline ───────────────────────────────────────
  generate_image:            executeGenerateImage,
  select_top_performers:     executeSelectTopPerformers,
  promote_to_linkedin:       executePromoteToLinkedIn,

  // ── Self-evolving pipeline ────────────────────────────────────────
  analyze_content_performance: executeAnalyzeContentPerformance,
  judge_content_quality:       executeJudgeContentQuality,
  synthesize_improvements:     executeSynthesizeImprovements,
  evolve_image_prompts:        executeEvolveImagePrompts,
};
