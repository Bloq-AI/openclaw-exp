/**
 * Dynamic persona loader.
 *
 * At runtime, checks `persona_versions` for the latest active evolved
 * versions of each persona field. Falls back to the hardcoded config
 * in bloq.ts if nothing is in DB yet.
 *
 * This is what makes the system self-evolving: as the pipeline writes
 * new versions to the table, all future content generation automatically
 * picks them up — no deployment needed.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { PersonaConfig, BLOQ_TWITTER, BLOQ_LINKEDIN } from "./bloq";

type PersonaField = "system_prompt" | "content_rules" | "image_style_prompt";

interface PersonaVersionRow {
  field: string;
  value: string;
}

const FIELDS: PersonaField[] = ["system_prompt", "content_rules", "image_style_prompt"];

/**
 * Load the latest active persona config for a brand+platform from DB,
 * merging evolved fields over the hardcoded baseline.
 */
export async function loadPersona(
  sb: SupabaseClient,
  brand: string,
  platform: string
): Promise<PersonaConfig> {
  const baseline: PersonaConfig = platform === "linkedin" ? BLOQ_LINKEDIN : BLOQ_TWITTER;

  try {
    // For each field, get the latest active version
    const { data: rows } = await sb
      .from("persona_versions")
      .select("field, value")
      .eq("brand", brand)
      .in("platform", [platform, "both"])
      .eq("is_active", true)
      .in("field", FIELDS)
      .order("created_at", { ascending: false });

    if (!rows || rows.length === 0) return baseline;

    // Take the first (latest) for each field
    const evolved: Partial<PersonaConfig> = {};
    const seen = new Set<string>();

    for (const row of rows as PersonaVersionRow[]) {
      if (seen.has(row.field)) continue;
      seen.add(row.field);

      if (row.field === "system_prompt") evolved.system_prompt = row.value;
      else if (row.field === "content_rules") evolved.content_rules = row.value;
      else if (row.field === "image_style_prompt") evolved.image_style_prompt = row.value;
    }

    return { ...baseline, ...evolved };
  } catch (err) {
    // Never fail content generation due to DB lookup errors
    console.warn("[persona/loader] DB lookup failed, using baseline:", err);
    return baseline;
  }
}

/**
 * Save a new persona version to DB, deactivating the previous one.
 */
export async function savePersonaVersion(
  sb: SupabaseClient,
  opts: {
    brand: string;
    platform: string;
    field: PersonaField;
    value: string;
    reason: string;
    createdBy?: string;
    judgeInput?: unknown;
  }
): Promise<string> {
  // Find the current active version to set as parent
  const { data: current } = await sb
    .from("persona_versions")
    .select("id")
    .eq("brand", opts.brand)
    .in("platform", [opts.platform, "both"])
    .eq("field", opts.field)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Deactivate current version
  if (current?.id) {
    await sb
      .from("persona_versions")
      .update({ is_active: false })
      .eq("id", current.id);
  }

  // Insert new version
  const { data: inserted } = await sb
    .from("persona_versions")
    .insert({
      brand: opts.brand,
      platform: opts.platform,
      field: opts.field,
      value: opts.value,
      parent_id: current?.id ?? null,
      reason: opts.reason,
      created_by: opts.createdBy ?? "system",
      is_active: true,
      judge_input: opts.judgeInput ?? null,
    })
    .select("id")
    .single();

  return inserted?.id ?? "";
}
