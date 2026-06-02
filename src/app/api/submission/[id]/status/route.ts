import { NextRequest, NextResponse } from "next/server";
import { insforgeAdmin } from "@/lib/insforge";
import { getStatusFromScore, getFeedbackFromStatus, triggerStreakUpdate } from "@/lib/validation";
import { recalculateStats } from "@/lib/stats";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Missing submission ID" }, { status: 400 });
    }

    // Fetch submission from the database
    const { data: submission, error: fetchError } = await insforgeAdmin.database
      .from("submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Check timeout safety
    // IF status is "pending", and 30 seconds have elapsed since created_at:
    if (submission.validation_status === "pending") {
      const createdAtTime = new Date(submission.created_at).getTime();
      const elapsedMs = Date.now() - createdAtTime;
      const timeoutMs = parseInt(process.env.VALIDATION_TIMEOUT_MS || "30000");

      if (elapsedMs >= timeoutMs) {
        console.warn(`AI validation timed out for submission ${id} after ${elapsedMs}ms. Falling back to rules.`);
        
        // Fallback to rules:
        const fallbackScore = submission.validation_score; // stores phase1_score
        const fallbackStatus = getStatusFromScore(fallbackScore);
        const fallbackFeedback = getFeedbackFromStatus(fallbackStatus) + " (AI validation timed out, fell back to rule-based verification)";

        // Update database with fallback details
        const { data: updatedSub, error: updateError } = await insforgeAdmin.database
          .from("submissions")
          .update({
            validation_status: fallbackStatus,
            validation_method: "rules_fallback",
            validated_at: new Date().toISOString(),
            validator_feedback: fallbackFeedback,
            verdict: fallbackStatus,
            score: fallbackScore,
            feedback: fallbackFeedback
          })
          .eq("id", id)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        // If fallback status is complete, trigger streak updates
        if (fallbackStatus === "complete") {
          await triggerStreakUpdate(
            submission.user_id,
            submission.challenge_title,
            submission.github_link
          );
        }
        
        // Recalculate stats
        await recalculateStats(submission.user_id);

        return NextResponse.json({
          status: updatedSub.validation_status,
          score: updatedSub.validation_score,
          feedback: updatedSub.validator_feedback,
          signals: updatedSub.validation_signals,
          validation_method: updatedSub.validation_method
        });
      }
    }

    // Return the current status (either processed or still pending/validating)
    return NextResponse.json({
      status: submission.validation_status,
      score: submission.validation_score,
      feedback: submission.validator_feedback,
      signals: submission.validation_signals,
      validation_method: submission.validation_method
    });
  } catch (err: any) {
    console.error("Error in submission status endpoint:", err);
    return NextResponse.json({ error: err.message || "Server Error" }, { status: 500 });
  }
}
