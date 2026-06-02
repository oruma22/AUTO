import { NextRequest, NextResponse } from "next/server";
import { insforgeAdmin } from "@/lib/insforge";
import { recalculateStats } from "@/lib/stats";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json({ error: "Missing required parameter: user_id" }, { status: 400 });
    }

    // Query profiles for submission velocity stats
    const { data, error } = await insforgeAdmin.database
      .from("profiles")
      .select("velocity_this_week, velocity_last_week, velocity_change, velocity_trend, last_calculated_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Database query error in submission-velocity endpoint:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data && data.last_calculated_at) {
      return NextResponse.json({
        this_week: Number(data.velocity_this_week) || 0,
        last_week: Number(data.velocity_last_week) || 0,
        velocity_change: parseFloat(Number(data.velocity_change).toFixed(1)) || 0.0,
        trend: data.velocity_trend || "steady"
      });
    }

    // If not calculated yet, run recalculate
    const calculated = await recalculateStats(userId);
    return NextResponse.json({
      this_week: calculated.this_week,
      last_week: calculated.last_week,
      velocity_change: calculated.velocity_change,
      trend: calculated.trend
    });
  } catch (err: any) {
    console.error("API error in submission-velocity stats:", err);
    return NextResponse.json({ error: err.message || "Server Error" }, { status: 500 });
  }
}
