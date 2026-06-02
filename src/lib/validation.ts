import { insforgeAdmin } from "./insforge";

export interface ValidationSignal {
  name: string;
  passed: boolean;
  score: number;
  maxScore: number;
}

export interface ValidationResult {
  status: "complete" | "in_progress" | "insufficient";
  score: number;
  signals: ValidationSignal[];
  feedback: string;
}

export interface ChallengeMetadata {
  title: string;
  description: string;
  expected_deliverables: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export const CHALLENGE_METADATA: Record<string, ChallengeMetadata> = {
  "build an ai email summarizer workflow using n8n": {
    title: "Build an AI email summarizer workflow using n8n",
    description: "Design and implement an n8n workflow that fetches new emails, uses an AI node to summarize them, and sends a summary report via Discord, Telegram, or email.",
    expected_deliverables: [
      "Working email trigger (IMAP/Gmail)",
      "AI summarization node (OpenAI/Claude)",
      "Notification delivery channel"
    ],
    difficulty: "intermediate"
  },
  "create a telegram reminder automation": {
    title: "Create a Telegram reminder automation",
    description: "Design and implement a reminder automation that schedules messages and sends them to a Telegram chat or channel based on user input or a cron schedule.",
    expected_deliverables: [
      "Telegram bot integration",
      "Scheduler/Trigger node",
      "Configurable reminder message"
    ],
    difficulty: "beginner"
  },
  "build a webhook listener with next.js": {
    title: "Build a webhook listener with Next.js",
    description: "Create a custom API endpoint in Next.js that listens to incoming webhook payloads, processes the JSON data, and stores it in a database or logs it securely.",
    expected_deliverables: [
      "Next.js POST route handler",
      "Payload validation and parsing",
      "Database or storage persistence"
    ],
    difficulty: "intermediate"
  },
  "create a github commit tracker": {
    title: "Create a GitHub Commit Tracker",
    description: "Design and implement an automation workflow that tracks GitHub commits and sends notifications",
    expected_deliverables: [
      "Working GitHub integration",
      "Notification system",
      "Documentation"
    ],
    difficulty: "intermediate"
  },
  "build an ai caption generator": {
    title: "Build an AI caption generator",
    description: "Create an AI automation that accepts media files or post concepts and generates optimized social media captions using an LLM model.",
    expected_deliverables: [
      "Input interface or trigger",
      "AI agent prompting node",
      "Formatted text caption outputs"
    ],
    difficulty: "beginner"
  },
  "build an n8n webhook listener for github issues": {
    title: "Build an n8n webhook listener for GitHub issues",
    description: "Create a workflow that listens to GitHub issue events via webhooks, processes the event type, and triggers alerts or logs them in a tracking sheet.",
    expected_deliverables: [
      "GitHub webhook trigger in n8n",
      "JSON payload parsing",
      "Alerting or logging action"
    ],
    difficulty: "intermediate"
  }
};

export function getChallengeMetadata(title: string): ChallengeMetadata {
  const key = title.trim().toLowerCase();
  if (CHALLENGE_METADATA[key]) {
    return CHALLENGE_METADATA[key];
  }
  return {
    title: title,
    description: `Design and implement the automation workflow: "${title}".`,
    expected_deliverables: ["Working functionality", "Integration verification", "Documentation"],
    difficulty: "intermediate"
  };
}

export async function validateSubmission(submission: {
  github_url?: string | null;
  proof_text?: string | null;
  proof_file_url?: string | null;
}): Promise<ValidationResult> {
  // Always evaluate rule-based checks first (Phase 1).
  // The API routes use this result directly (rules mode) or as Phase 1 input for n8n/fast-rejection.
  return await runRuleBasedValidation(submission);
}

export async function triggerStreakUpdate(user_id: string, challenge_id: string, github_url: string | null) {
  const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = yesterdayObj.toISOString().split("T")[0];

  // Fetch profile to see previous completion
  const { data: profileData, error: profileFetchError } = await insforgeAdmin.database
    .from("profiles")
    .select("streak_count, last_completed_date")
    .eq("id", user_id)
    .maybeSingle();

  if (profileFetchError) throw profileFetchError;

  const lastCompleted = profileData?.last_completed_date;
  let nextStreak = profileData?.streak_count || 0;

  if (lastCompleted !== todayStr) {
    if (lastCompleted === yesterdayStr) {
      nextStreak += 1;
    } else {
      nextStreak = 1;
    }

    // Insert into completion_history
    const newCompletion = {
      user_id,
      completed_date: todayStr,
      challenge_id,
      github_url: github_url || null
    };
    
    const { error: insertHistoryError } = await insforgeAdmin.database
      .from("completion_history")
      .insert([newCompletion]);

    if (insertHistoryError && !insertHistoryError.message?.includes("duplicate key")) {
      throw insertHistoryError;
    }

    // Calculate consistency & health (last 7 days completions)
    const datesInRange: string[] = [];
    const todayDateObj = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(todayDateObj);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      datesInRange.push(`${y}-${m}-${day}`);
    }

    const { data: historyData } = await insforgeAdmin.database
      .from("completion_history")
      .select("completed_date")
      .eq("user_id", user_id)
      .in("completed_date", datesInRange);

    const completedDaysLast7 = historyData ? historyData.length : 0;
    const nextHealth = Math.floor((completedDaysLast7 / 7) * 100);
    const nextConsistency = nextHealth / 100;

    // Update profiles
    await insforgeAdmin.database
      .from("profiles")
      .update({
        streak_count: nextStreak,
        completed: true,
        streak_health: nextHealth,
        consistency: nextConsistency,
        last_completed_date: todayStr,
        updated_at: new Date().toISOString()
      })
      .eq("id", user_id);
  }
}

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const cleanUrl = url.trim().replace(/\/$/, "").replace(/\.git$/, "");
  const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

async function runRuleBasedValidation(submission: {
  github_url?: string | null;
  proof_text?: string | null;
  proof_file_url?: string | null;
}): Promise<ValidationResult> {
  const { github_url, proof_text, proof_file_url } = submission;

  if (github_url) {
    const parsed = parseGithubUrl(github_url);
    if (!parsed) {
      return {
        status: "insufficient",
        score: 0,
        signals: [{ name: "valid_github_url", passed: false, score: 0, maxScore: 100 }],
        feedback: "Invalid GitHub URL format. Please provide a valid public repository link."
      };
    }

    const { owner, repo } = parsed;
    const headers: HeadersInit = {
      "User-Agent": "Automation-Streak-App-Validator",
      ...(process.env.GITHUB_TOKEN ? { "Authorization": `token ${process.env.GITHUB_TOKEN}` } : {})
    };

    let hasReadme = false;
    let fileCount = 0;
    let hasCommits = false;
    let commitCount = 0;
    let lastCommitRecent = false;

    // 1. Fetch contents
    try {
      const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/`, { headers });
      if (contentsRes.ok) {
        const files: any[] = await contentsRes.json();
        if (Array.isArray(files)) {
          hasReadme = files.some(f => f.name.toLowerCase() === "readme.md");
          fileCount = files.filter(f => f.type === "file").length;
        }
      }
    } catch (e) {
      console.error("Error fetching contents from GitHub:", e);
    }

    // 2. Fetch commits
    try {
      const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits`, { headers });
      if (commitsRes.ok) {
        const commits: any[] = await commitsRes.json();
        if (Array.isArray(commits) && commits.length > 0) {
          hasCommits = true;
          commitCount = commits.length;
          const lastCommitDate = new Date(commits[0].commit.committer.date);
          const diffMs = new Date().getTime() - lastCommitDate.getTime();
          lastCommitRecent = diffMs <= 48 * 60 * 60 * 1000;
        }
      }
    } catch (e) {
      console.error("Error fetching commits from GitHub:", e);
    }

    const signals: ValidationSignal[] = [];
    let score = 0;

    // CHECK repo_has_commits          → +25 points
    const checkCommits = hasCommits;
    score += checkCommits ? 25 : 0;
    signals.push({ name: "repo_has_commits", passed: checkCommits, score: checkCommits ? 25 : 0, maxScore: 25 });

    // CHECK repo_has_readme           → +20 points
    const checkReadme = hasReadme;
    score += checkReadme ? 20 : 0;
    signals.push({ name: "repo_has_readme", passed: checkReadme, score: checkReadme ? 20 : 0, maxScore: 20 });

    // CHECK last_commit_within_48hrs  → +25 points
    const checkRecent = lastCommitRecent;
    score += checkRecent ? 25 : 0;
    signals.push({ name: "last_commit_within_48hrs", passed: checkRecent, score: checkRecent ? 25 : 0, maxScore: 25 });

    // CHECK file_count > 2            → +15 points
    const checkFiles = fileCount > 2;
    score += checkFiles ? 15 : 0;
    signals.push({ name: "file_count_gt_2", passed: checkFiles, score: checkFiles ? 15 : 0, maxScore: 15 });

    // CHECK commit_count > 1          → +15 points
    const checkCommitCount = commitCount > 1;
    score += checkCommitCount ? 15 : 0;
    signals.push({ name: "commit_count_gt_1", passed: checkCommitCount, score: checkCommitCount ? 15 : 0, maxScore: 15 });

    const status = getStatusFromScore(score);
    const feedback = getFeedbackFromStatus(status);

    return { status, score, signals, feedback };
  }

  if (proof_text) {
    const text = proof_text.trim();
    // Split by whitespace to count words
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const charCount = text.length;
    
    // URL matching regex
    const urlRegex = /https?:\/\/[^\s]+/;
    const hasUrl = urlRegex.test(text);

    const signals: ValidationSignal[] = [];
    let score = 0;

    // CHECK word_count > 50           → +40 points
    const checkWords = wordCount > 50;
    score += checkWords ? 40 : 0;
    signals.push({ name: "word_count_gt_50", passed: checkWords, score: checkWords ? 40 : 0, maxScore: 40 });

    // CHECK contains_url_or_link      → +30 points
    const checkUrl = hasUrl;
    score += checkUrl ? 30 : 0;
    signals.push({ name: "contains_url_or_link", passed: checkUrl, score: checkUrl ? 30 : 0, maxScore: 30 });

    // CHECK length > 200 chars        → +30 points
    const checkLength = charCount > 200;
    score += checkLength ? 30 : 0;
    signals.push({ name: "char_length_gt_200", passed: checkLength, score: checkLength ? 30 : 0, maxScore: 30 });

    const status = getStatusFromScore(score);
    const feedback = getFeedbackFromStatus(status);

    return { status, score, signals, feedback };
  }

  if (proof_file_url) {
    let fileNotEmpty = false;
    let fileTypeValid = false;

    try {
      const res = await fetch(proof_file_url, { method: "HEAD" });
      if (res.ok) {
        const contentLength = parseInt(res.headers.get("content-length") || "0");
        fileNotEmpty = contentLength > 0;
        
        const contentType = res.headers.get("content-type") || "";
        const validTypes = [
          "image/",
          "video/",
          "application/pdf",
          "application/zip",
          "application/x-zip-compressed",
          "text/plain",
          "application/json"
        ];
        fileTypeValid = validTypes.some(type => contentType.startsWith(type));
      }
    } catch (e) {
      console.error("Error checking file with HEAD request, trying path extension check:", e);
    }

    // Fallback or double check: check extension in URL path
    try {
      const urlPath = new URL(proof_file_url).pathname;
      const extension = urlPath.split(".").pop()?.toLowerCase();
      if (extension) {
        const validExtensions = ["png", "jpg", "jpeg", "gif", "mp4", "mov", "pdf", "zip", "txt", "json"];
        if (!fileNotEmpty) fileNotEmpty = true; // assume not empty if URL valid
        if (!fileTypeValid) fileTypeValid = validExtensions.includes(extension);
      }
    } catch (urlErr) {
      console.error("Error parsing file URL path:", urlErr);
    }

    const signals: ValidationSignal[] = [];
    let score = 0;

    // CHECK file_is_not_empty         → +50 points
    score += fileNotEmpty ? 50 : 0;
    signals.push({ name: "file_is_not_empty", passed: fileNotEmpty, score: fileNotEmpty ? 50 : 0, maxScore: 50 });

    // CHECK file_type is valid        → +50 points
    score += fileTypeValid ? 50 : 0;
    signals.push({ name: "file_type_valid", passed: fileTypeValid, score: fileTypeValid ? 50 : 0, maxScore: 50 });

    const status = getStatusFromScore(score);
    const feedback = getFeedbackFromStatus(status);

    return { status, score, signals, feedback };
  }

  return {
    status: "insufficient",
    score: 0,
    signals: [{ name: "no_proof_submitted", passed: false, score: 0, maxScore: 100 }],
    feedback: "We couldn't verify a completed project from this submission. Please submit a GitHub link, a detailed writeup, or a file showing your completed work."
  };
}

export function getStatusFromScore(score: number): "complete" | "in_progress" | "insufficient" {
  if (score >= 80) return "complete";
  if (score >= 40) return "in_progress";
  return "insufficient";
}

export function getFeedbackFromStatus(status: "complete" | "in_progress" | "insufficient"): string {
  switch (status) {
    case "complete":
      return "Great work! Your submission looks solid. Streak updated. ✅";
    case "in_progress":
      return "Your project looks like it's still in progress. Add a README, push more commits, or describe what you built to have this count toward your streak.";
    case "insufficient":
      return "We couldn't verify a completed project from this submission. Please submit a GitHub link, a detailed writeup, or a file showing your completed work.";
  }
}
