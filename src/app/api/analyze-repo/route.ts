import { NextRequest, NextResponse } from "next/server";
import { insforgeAdmin } from "@/lib/insforge";
import { recalculateStats } from "@/lib/stats";

const LOW_CODE_TOOLS = [
  "Zapier",
  "Make (Integromat)",
  "n8n",
  "Airtable",
  "Notion API",
  "GitHub Actions",
  "Webhooks"
];

const CUSTOM_CODE_TOOLS = [
  "Node.js",
  "Python",
  "Express",
  "FastAPI",
  "custom fetch/axios calls",
  "shell scripts",
  "cron jobs"
];

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  // Clean up url (strip trailing slashes, .git suffix)
  const cleanUrl = url.trim().replace(/\/$/, "").replace(/\.git$/, "");
  // Match github.com/owner/repo
  const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

async function fetchFileContent(downloadUrl: string): Promise<string> {
  try {
    const res = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Automation-Streak-App-Scanner",
        ...(process.env.GITHUB_TOKEN ? { "Authorization": `token ${process.env.GITHUB_TOKEN}` } : {})
      }
    });
    if (res.ok) {
      return await res.text();
    }
  } catch (e) {
    console.error("Error fetching file content from download_url:", e);
  }
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const { github_url, user_id, challenge_id } = await req.json();

    if (!user_id || !challenge_id) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, challenge_id" },
        { status: 400 }
      );
    }

    let detected_tools: string[] = [];
    let no_code_percentage = 0;
    let custom_code_percentage = 0;

    const parsedGithub = parseGithubUrl(github_url);

    if (parsedGithub) {
      const { owner, repo } = parsedGithub;
      const headers: HeadersInit = {
        "User-Agent": "Automation-Streak-App-Scanner",
        ...(process.env.GITHUB_TOKEN ? { "Authorization": `token ${process.env.GITHUB_TOKEN}` } : {})
      };

      // Fetch repo contents
      const contentsRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/`,
        { headers }
      );

      if (contentsRes.ok) {
        const files: any[] = await contentsRes.json();
        const toolsList: string[] = [];

        // Check root files existence
        const hasPackageJson = files.some(f => f.name.toLowerCase() === "package.json");
        const hasRequirementsTxt = files.some(f => f.name.toLowerCase() === "requirements.txt");
        const hasPipfile = files.some(f => f.name.toLowerCase() === "pipfile");
        const hasDockerCompose = files.some(f => f.name.toLowerCase() === "docker-compose.yml" || f.name.toLowerCase() === "docker-compose.yaml");
        const hasMakefile = files.some(f => f.name.toLowerCase() === "makefile");
        const hasEnvExample = files.some(f => f.name.toLowerCase() === ".env.example");
        const hasReadme = files.some(f => f.name.toLowerCase() === "readme.md");
        const hasShellScript = files.some(f => f.name.toLowerCase().endsWith(".sh"));

        // Fetch sub-workflows directory info to check GitHub Actions
        const githubDir = files.find(f => f.name.toLowerCase() === ".github" && f.type === "dir");
        if (githubDir) {
          const workflowsRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows`,
            { headers }
          );
          if (workflowsRes.ok) {
            const workflowsFiles = await workflowsRes.json();
            if (Array.isArray(workflowsFiles) && workflowsFiles.length > 0) {
              toolsList.push("GitHub Actions");
            }
          }
        }

        // Package.json analysis
        if (hasPackageJson) {
          toolsList.push("Node.js");
          const packageFile = files.find(f => f.name.toLowerCase() === "package.json");
          if (packageFile && packageFile.download_url) {
            const contentStr = await fetchFileContent(packageFile.download_url);
            try {
              const packageJson = JSON.parse(contentStr);
              const deps = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
              };
              const scripts = packageJson.scripts || {};

              if (deps["express"]) toolsList.push("Express");
              if (deps["fastapi"]) toolsList.push("FastAPI");
              if (deps["axios"] || deps["node-fetch"] || deps["got"]) toolsList.push("custom fetch/axios calls");
              if (deps["airtable"]) toolsList.push("Airtable");
              if (deps["@notionhq/client"] || deps["notion"]) toolsList.push("Notion API");
              if (deps["zapier-platform-core"] || deps["zapier"]) toolsList.push("Zapier");
              if (deps["n8n"]) toolsList.push("n8n");
              if (deps["cron"] || deps["node-cron"] || deps["node-schedule"] || deps["schedule"]) toolsList.push("cron jobs");

              // Also scan scripts values
              const scriptValues = Object.values(scripts).join(" ").toLowerCase();
              if (scriptValues.includes("cron") || scriptValues.includes("schedule")) {
                toolsList.push("cron jobs");
              }
              if (scriptValues.includes("fetch") || scriptValues.includes("axios")) {
                toolsList.push("custom fetch/axios calls");
              }
            } catch (err) {
              console.error("Failed to parse package.json:", err);
            }
          }
        }

        // Requirements.txt / Pipfile analysis
        if (hasRequirementsTxt || hasPipfile) {
          toolsList.push("Python");
          const fileToFetch = files.find(f => f.name.toLowerCase() === "requirements.txt" || f.name.toLowerCase() === "pipfile");
          if (fileToFetch && fileToFetch.download_url) {
            const contentStr = await fetchFileContent(fileToFetch.download_url);
            const lowerContent = contentStr.toLowerCase();

            if (lowerContent.includes("fastapi")) toolsList.push("FastAPI");
            if (lowerContent.includes("express")) toolsList.push("Express");
            if (lowerContent.includes("requests") || lowerContent.includes("httpx") || lowerContent.includes("urllib")) {
              toolsList.push("custom fetch/axios calls");
            }
            if (lowerContent.includes("airtable")) toolsList.push("Airtable");
            if (lowerContent.includes("notion")) toolsList.push("Notion API");
            if (lowerContent.includes("n8n")) toolsList.push("n8n");
            if (lowerContent.includes("celery") || lowerContent.includes("cron") || lowerContent.includes("schedule")) {
              toolsList.push("cron jobs");
            }
          }
        }

        // Docker compose analysis
        if (hasDockerCompose) {
          const composeFile = files.find(f => f.name.toLowerCase() === "docker-compose.yml" || f.name.toLowerCase() === "docker-compose.yaml");
          if (composeFile && composeFile.download_url) {
            const contentStr = await fetchFileContent(composeFile.download_url);
            const lowerContent = contentStr.toLowerCase();
            if (lowerContent.includes("n8n")) toolsList.push("n8n");
            if (lowerContent.includes("zapier")) toolsList.push("Zapier");
            if (lowerContent.includes("make.com") || lowerContent.includes("integromat")) toolsList.push("Make (Integromat)");
            if (lowerContent.includes("airtable")) toolsList.push("Airtable");
            if (lowerContent.includes("notion")) toolsList.push("Notion API");
            if (lowerContent.includes("cron") || lowerContent.includes("celery") || lowerContent.includes("schedule")) {
              toolsList.push("cron jobs");
            }
          }
        }

        // Makefile / Shell script
        if (hasMakefile || hasShellScript) {
          toolsList.push("shell scripts");
        }

        // .env.example analysis
        if (hasEnvExample) {
          const envFile = files.find(f => f.name.toLowerCase() === ".env.example");
          if (envFile && envFile.download_url) {
            const contentStr = await fetchFileContent(envFile.download_url);
            const lowerContent = contentStr.toLowerCase();
            if (lowerContent.includes("zapier")) toolsList.push("Zapier");
            if (lowerContent.includes("make_") || lowerContent.includes("integromat")) toolsList.push("Make (Integromat)");
            if (lowerContent.includes("n8n")) toolsList.push("n8n");
            if (lowerContent.includes("airtable")) toolsList.push("Airtable");
            if (lowerContent.includes("notion")) toolsList.push("Notion API");
            if (lowerContent.includes("webhook")) toolsList.push("Webhooks");
          }
        }

        // README.md analysis (additional fallback/verification source)
        if (hasReadme) {
          const readmeFile = files.find(f => f.name.toLowerCase() === "readme.md");
          if (readmeFile && readmeFile.download_url) {
            const contentStr = await fetchFileContent(readmeFile.download_url);
            const lowerContent = contentStr.toLowerCase();
            if (lowerContent.includes("zapier")) toolsList.push("Zapier");
            if (lowerContent.includes("make.com") || lowerContent.includes("integromat")) toolsList.push("Make (Integromat)");
            if (lowerContent.includes("n8n")) toolsList.push("n8n");
            if (lowerContent.includes("airtable")) toolsList.push("Airtable");
            if (lowerContent.includes("notion")) toolsList.push("Notion API");
            if (lowerContent.includes("webhook")) toolsList.push("Webhooks");
            if (lowerContent.includes("fetch") || lowerContent.includes("axios")) toolsList.push("custom fetch/axios calls");
            if (lowerContent.includes("cron") || lowerContent.includes("schedule")) toolsList.push("cron jobs");
            if (lowerContent.includes("shell") || lowerContent.includes(".sh ") || lowerContent.includes("bash ")) {
              toolsList.push("shell scripts");
            }
          }
        }

        // Deduplicate
        detected_tools = Array.from(new Set(toolsList));
      } else {
        console.warn(`Failed to fetch repo contents for ${owner}/${repo}: ${contentsRes.status}`);
      }
    }

    // Calculate percentage breakdown
    if (detected_tools.length > 0) {
      const lowCodeCount = detected_tools.filter(t => LOW_CODE_TOOLS.includes(t)).length;
      const customCodeCount = detected_tools.filter(t => CUSTOM_CODE_TOOLS.includes(t)).length;
      const totalCount = lowCodeCount + customCodeCount;

      if (totalCount > 0) {
        no_code_percentage = Math.round((lowCodeCount / totalCount) * 100);
        custom_code_percentage = 100 - no_code_percentage;
      }
    }

    // Update submissions table
    const breakdown = {
      no_code_percentage,
      custom_code_percentage,
      detected_tools,
      repo_url: github_url || "",
      analyzed_at: new Date().toISOString()
    };

    // Find the latest user submission for this challenge
    const { data: latestSubmission, error: subFetchError } = await insforgeAdmin.database
      .from("submissions")
      .select("id")
      .eq("user_id", user_id)
      .eq("challenge_title", challenge_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSubmission && !subFetchError) {
      await insforgeAdmin.database
        .from("submissions")
        .update({ workflow_breakdown: breakdown })
        .eq("id", latestSubmission.id);
    }

    // Update completion_history with github_url
    if (github_url) {
      const todayStr = new Date().toISOString().split("T")[0];
      await insforgeAdmin.database
        .from("completion_history")
        .update({ github_url })
        .eq("user_id", user_id)
        .eq("completed_date", todayStr);
    }

    // Recalculate stats (Executions/HR, Velocity)
    await recalculateStats(user_id);

    // Fetch active streak duration from profiles
    const { data: profileData } = await insforgeAdmin.database
      .from("profiles")
      .select("streak_count")
      .eq("id", user_id)
      .maybeSingle();

    const active_streak_duration = profileData?.streak_count || 0;

    return NextResponse.json({
      no_code_percentage,
      custom_code_percentage,
      detected_tools,
      active_streak_duration
    });
  } catch (err: any) {
    console.error("API error in analyze-repo:", err);
    return NextResponse.json({ error: err.message || "Server Error" }, { status: 500 });
  }
}
