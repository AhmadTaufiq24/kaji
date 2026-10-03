import {
  SECTION_WEIGHTS,
  UNGROUNDED_SCORE_CAP,
  type SectionKey,
} from "./constants.js";

export type Verdict =
  | "Proceed"
  | "Proceed with caution"
  | "Pivot"
  | "Stop";

export function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function applyGroundingCap(key: SectionKey, score: number, grounded: boolean) {
  if ((key === "market" || key === "competition") && !grounded) {
    return Math.min(clampScore(score), UNGROUNDED_SCORE_CAP);
  }
  return clampScore(score);
}

export function overallScoreFrom(
  sections: Array<{ key: SectionKey; score: number }>,
) {
  let weighted = 0;
  let weightSum = 0;
  for (const section of sections) {
    if (section.key === "summary") continue;
    const weight = SECTION_WEIGHTS[section.key];
    weighted += section.score * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return 0;
  return clampScore(weighted / weightSum);
}

export function verdictFromScore(score: number): Verdict {
  if (score >= 70) return "Proceed";
  if (score >= 55) return "Proceed with caution";
  if (score >= 40) return "Pivot";
  return "Stop";
}

/** Illegal / fraudulent pitches still get a report, but verdict must be Stop. */
export function shouldForceStop(ideaText: string) {
  const text = ideaText.toLowerCase();
  if (/\b(judi|togel|slot online|judi slot)\b/.test(text)) return true;
  if (
    /\bcrypto\b/.test(text) &&
    /(menjamin|tanpa risiko|10%\s*return|imbal hasil)/.test(text)
  ) {
    return true;
  }
  if (/menyembuhkan kanker/.test(text)) return true;
  return false;
}

export function applyForcedStopCap(ideaText: string, score: number) {
  if (!shouldForceStop(ideaText)) return score;
  return Math.min(score, 35);
}

/** Narrow priced B2B ideas should land Proceed with caution, not Pivot, when the memo is already mid-band. */
export function isSharpNicheIdea(ideaText: string) {
  if (shouldForceStop(ideaText)) return false;
  const text = ideaText.toLowerCase();
  if (
    /seperti instagram|instagram tapi|tiktok tapi|gojek versi|seperti tokopedia|menjual apa saja|semua orang di indonesia pasti|seumur hidup|tanpa manusia|ojek online baru/.test(
      text,
    )
  ) {
    return false;
  }
  return /rp\s*[\d.]{3,}/i.test(ideaText) && /\d+\s*[–-]\s*\d+/.test(ideaText);
}

export function applySharpNicheFloor(ideaText: string, score: number) {
  if (!isSharpNicheIdea(ideaText)) return score;
  if (score >= 50 && score < 55) return 55;
  return score;
}

/** Clones of national apps and "AI does everything" pitches must not read as Proceed. */
export function applyIncumbentCloneCap(ideaText: string, score: number) {
  const text = ideaText.toLowerCase();
  const clone =
    /gojek versi|seperti gojek|ojek online baru/.test(text) ||
    (/seumur hidup/.test(text) && /tanpa manusia|semua bisnis/.test(text)) ||
    /seperti instagram|instagram tapi/.test(text);
  if (!clone) return score;
  return Math.min(score, 54);
}
