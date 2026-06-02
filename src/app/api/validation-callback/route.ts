import { NextRequest, NextResponse } from "next/server";
import { insforgeAdmin } from "@/lib/insforge";
import { getStatusFromScore, getFeedbackFromStatus, triggerStreakUpdate } from "@/lib/validation";
import { recalculateStats } from "@/lib/stats";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      submission_id,
      verdict,
      confidence,
      score,
      criteria_scores,
      feedback,
      missing_elements
    } = body;

    if (!submission_id || !verdict) {
      return NextResponse.json({ error: "Missing required callback fields: submission_id, verdict" }, { status: 400 });
    }

    // 1. Fetch submission from database
    const { data: submission, error: fetchError } = await insforgeAdmin.database
      .from("submissions")
      .select("*")
      .eq("id", submission_id)
      .maybeSingle();

    if (fetchError || !submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // If the submission is already processed (e.g. timeout fallback already ran), ignore and return 200 to prevent retries
    if (submission.validation_status !== "pending") {
      console.log(`Submission ${submission_id} is already processed (status: ${submission.validation_status}). Ignoring callback.`);
      return NextResponse.json({ message: "Submission already processed" }, { status: 200 });
    }

    // 2. Merge Phase 1 and Phase 2 scores
    const phase1_score = submission.validation_score;
    const ai_score = score;
    const ai_confidence = confidence;
    const ai_verdict = verdict;
    const rule_based_status = getStatusFromScore(phase1_score);

    // Merge score calculation
    let final_score = Math.round((phase1_score * 0.3) + (ai_score * 0.7));
    if (ai_confidence < 50) {
      final_score = Math.round((phase1_score * 0.6) + (ai_score * 0.4));
    }

    // Final status verdict override
    let final_status = ai_verdict;
    if (ai_confidence < 40) {
      final_status = rule_based_status;
    }

    // 3. Helper to extract repo name from URL
    const getRepoName = (githubUrl: string | null): string => {
      if (!githubUrl) return "submission";
      const cleanUrl = githubUrl.trim().replace(/\/$/, "").replace(/\.git$/, "");
      const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      return match ? match[2] : "submission";
    };

    // 4. Construct validator feedback
    let final_feedback = "";
    if (ai_confidence < 40) {
      final_feedback = `${getFeedbackFromStatus(rule_based_status)} (AI validation was unsure with confidence ${ai_confidence}%, fell back to automated rules)`;
    } else if (final_status === "complete") {
      const repo_name = getRepoName(submission.github_link);
      if (ai_confidence > 70) {
        final_feedback = `Strong submission. Your ${repo_name} covers the key deliverables for this challenge. Streak awarded. ✅`;
      } else {
        final_feedback = `Your submission meets the requirements. Consider adding more documentation next time. Streak awarded. ✅`;
      }
    }
    let parsedMissingElements: string[] = [];
    if (missing_elements) {
      if (typeof missing_elements === "string") {
        try {
          parsedMissingElements = JSON.parse(missing_elements);
        } catch (e) {
          parsedMissingElements = [missing_elements];
        }
      } else if (Array.isArray(missing_elements)) {
        parsedMissingElements = missing_elements;
      }
    }

    if (final_status === "in_progress") {
      const missing = parsedMissingElements.length > 0
        ? parsedMissingElements.join(", ")
        : "None specified";
      final_feedback = `Your project shows good progress but isn't quite there yet. ${feedback} Missing: ${missing}. Finish these and resubmit to earn your streak.`;
    } else {
      // insufficient
      final_feedback = `We couldn't verify a completed project. ${feedback} Your streak has not been updated.`;
    }

    // 5. Update submission in the database
    // Store detailed metadata in validation_signals JSON format for debugging
    const updatedSignals = [
      ...(submission.validation_signals || []),
      { name: "ai_verdict", passed: final_status === "complete", score: ai_score, maxScore: 100 },
      { name: "ai_confidence", passed: ai_confidence >= 50, score: ai_confidence, maxScore: 100 }
    ];

    const { error: updateError } = await insforgeAdmin.database
      .from("submissions")
      .update({
        validation_status: final_status,
        validation_score: final_score,
        validation_signals: updatedSignals,
        validation_method: "ai",
        validated_at: new Date().toISOString(),
        validator_feedback: final_feedback,
        verdict: final_status,
        score: final_score,
        feedback: final_feedback,
        missing_elements: parsedMissingElements
      })
      .eq("id", submission_id);

    if (updateError) {
      throw updateError;
    }

    // 6. Trigger streak engine if completed
    if (final_status === "complete") {
      await triggerStreakUpdate(
        submission.user_id,
        submission.challenge_title,
        submission.github_link
      );
    }

    // Always recalculate stats
    await recalculateStats(submission.user_id);

    console.log(`AI Callback successfully processed for submission ${submission_id}. Status: ${final_status}, Score: ${final_score}`);

    return NextResponse.json({ message: "Callback processed successfully", status: final_status, score: final_score });
  } catch (err: any) {
    console.error("Error processing AI validation callback:", err);
    return NextResponse.json({ error: err.message || "Server Error" }, { status: 500 });
  }
}
