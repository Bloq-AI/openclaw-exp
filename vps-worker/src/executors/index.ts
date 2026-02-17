import { SupabaseClient } from "@supabase/supabase-js";
import { executeAnalyze } from "./analyze";
import { executeWriteContent } from "./write-content";
import { executePostTweet } from "./post-tweet";
import { executeScanGithub } from "./scan-github";
import { executeDraftLinkedinPost } from "./draft-linkedin-post";

type StepInput = { id: string; payload: Record<string, unknown> };
type ExecutorResult = { ok: boolean; output?: unknown; error?: string };
type ExecutorFn = (sb: SupabaseClient, step: StepInput) => Promise<ExecutorResult>;

export const executors: Record<string, ExecutorFn> = {
  analyze: executeAnalyze,
  write_content: executeWriteContent,
  post_tweet: executePostTweet,
  scan_github: executeScanGithub,
  draft_linkedin_post: executeDraftLinkedinPost,
};
