import { NextResponse } from "next/server";

export async function GET() {
  const challenges = [
    "Build an AI email summarizer workflow using n8n",
    "Create a Telegram reminder automation",
    "Build a webhook listener with Next.js",
    "Create a GitHub commit tracker",
    "Build an AI caption generator"
  ];

  const random =
    challenges[Math.floor(Math.random() * challenges.length)];

  return NextResponse.json({
    challenge: random,
  });
}
