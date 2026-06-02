import { NextRequest, NextResponse } from "next/server";
import { insforgeAdmin } from "@/lib/insforge";
import { validateSubmission, triggerStreakUpdate, getChallengeMetadata } from "@/lib/validation";
import { recalculateStats } from "@/lib/stats";

export async function POST(req: NextRequest) {
  try {
    const { user_id, challenge_id, github_url, proof_text, proof_file_url } = await req.json();

    if (!user_id || !challenge_id) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, challenge_id" },
        { status: 400 }
      );
    }

    // 1. Run rule-based validation engine
    const validation = await validateSubmission({
      github_url,
      proof_text,
      proof_file_url
    });

    const now = new Date().toISOString();
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    const AI_VALIDATION_ENABLED = process.env.AI_VALIDATION_ENABLED === "true";

    // 2. Handle AI Validation logic if enabled
    if (AI_VALIDATION_ENABLED) {
      // FAST REJECTION CHECK: If Phase 1 score is 0, reject immediately without calling n8n
      if (validation.score === 0) {
        const newSubmission = {
          user_id,
          date: dateStr,
          note: proof_text || (github_url ? `GitHub repo: ${github_url}` : `Uploaded file: ${proof_file_url}`),
          github_link: github_url || null,
          loom_link: proof_file_url || null,
          challenge_title: challenge_id,
          validation_status: "insufficient",
          validation_score: 0,
          validation_signals: validation.signals,
          validation_method: "rules",
          validated_at: now,
          validator_feedback: validation.feedback,
          verdict: "insufficient",
          score: 0,
          feedback: validation.feedback,
          missing_elements: validation.signals.filter(s => !s.passed).map(s => s.name)
        };

        const { data: savedSubmission, error: subError } = await insforgeAdmin.database
          .from("submissions")
          .insert([newSubmission])
          .select()
          .single();

        if (subError) throw subError;

        // Recalculate stats
        await recalculateStats(user_id);

        return NextResponse.json({
          status: "insufficient",
          score: 0,
          signals: validation.signals,
          feedback: validation.feedback,
          submission_id: savedSubmission.id
        });
      }

      // If Phase 1 score > 0, save submission as "pending" and dispatch to n8n asynchronously
      const newSubmission = {
        user_id,
        date: dateStr,
        note: proof_text || (github_url ? `GitHub repo: ${github_url}` : `Uploaded file: ${proof_file_url}`),
        github_link: github_url || null,
        loom_link: proof_file_url || null,
        challenge_title: challenge_id,
        validation_status: "pending",
        validation_score: validation.score, // initial phase 1 score
        validation_signals: validation.signals, // initial phase 1 signals
        validation_method: "ai",
        validated_at: now,
        validator_feedback: "Reviewing your submission...",
        verdict: "pending",
        score: validation.score,
        feedback: "Reviewing your submission..."
      };

      const { data: savedSubmission, error: subError } = await insforgeAdmin.database
        .from("submissions")
        .insert([newSubmission])
        .select()
        .single();

      if (subError) throw subError;

      // Construct callback URL dynamically, allowing an override for local tunnel testing
      let callback_url = process.env.CALLBACK_URL_OVERRIDE;
      if (!callback_url) {
        const host = req.headers.get("host") || "localhost:3000";
        const protocol = req.headers.get("x-forwarded-proto") || "http";
        callback_url = `${protocol}://${host}/api/validation-callback`;
      } else {
        if (!callback_url.endsWith("/api/validation-callback")) {
          callback_url = callback_url.replace(/\/$/, "") + "/api/validation-callback";
        }
      }

      const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
      if (n8nWebhookUrl) {
        const challengeMeta = getChallengeMetadata(challenge_id);
        const payload = {
          submission_id: savedSubmission.id,
          user_id,
          challenge: {
            title: challengeMeta.title,
            description: challengeMeta.description,
            expected_deliverables: challengeMeta.expected_deliverables,
            difficulty: challengeMeta.difficulty
          },
          submission: {
            github_url: github_url || null,
            proof_text: proof_text || null,
            proof_file_url: proof_file_url || null,
            submitted_at: now
          },
          phase1_score: validation.score,
          phase1_signals: validation.signals.map(s => `${s.name}: ${s.passed}`),
          callback_url: callback_url
        };

        // Fire and forget: trigger the n8n webhook asynchronously
        fetch(n8nWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }).catch(err => {
          console.error("Failed to trigger n8n webhook asynchronously:", err);
        });
      } else {
        console.warn("N8N_WEBHOOK_URL is not configured. Submission remains pending and will fallback via polling.");
      }

      return NextResponse.json({
        status: "validating",
        message: "Reviewing your submission...",
        submission_id: savedSubmission.id
      });
    }

    // 3. Fallback / Standard Rules Mode (AI_VALIDATION_ENABLED=false)
    const newSubmission = {
      user_id,
      date: dateStr,
      note: proof_text || (github_url ? `GitHub repo: ${github_url}` : `Uploaded file: ${proof_file_url}`),
      github_link: github_url || null,
      loom_link: proof_file_url || null,
      challenge_title: challenge_id,
      validation_status: validation.status,
      validation_score: validation.score,
      validation_signals: validation.signals,
      validation_method: "rules",
      validated_at: now,
      validator_feedback: validation.feedback,
      verdict: validation.status,
      score: validation.score,
      feedback: validation.feedback,
      missing_elements: validation.signals.filter(s => !s.passed).map(s => s.name)
    };

    const { data: savedSubmission, error: subError } = await insforgeAdmin.database
      .from("submissions")
      .insert([newSubmission])
      .select()
      .single();

    if (subError) throw subError;

    // Run the legacy rule streak engine if complete
    if (validation.status === "complete") {
      await triggerStreakUpdate(user_id, challenge_id, github_url || null);
    }

    // Always recalculate stats
    await recalculateStats(user_id);

    return NextResponse.json({
      status: validation.status,
      score: validation.score,
      signals: validation.signals,
      feedback: validation.feedback,
      submission_id: savedSubmission.id
    });
  } catch (err: any) {
    console.error("Validation API error:", err);
    return NextResponse.json({ error: err.message || "Server Error" }, { status: 500 });
  }
}
