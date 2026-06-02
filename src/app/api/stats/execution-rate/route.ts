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

    // Query profiles for execution rate stats
    const { data, error } = await insforgeAdmin.database
      .from("profiles")
      .select("executions_per_hour, last_calculated_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Database query error in execution-rate endpoint:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data && data.last_calculated_at) {
      return NextResponse.json({
        executions_per_hour: parseFloat(Number(data.executions_per_hour).toFixed(2)) || 0.0,
        last_calculated_at: data.last_calculated_at
      });
    }

    // If not calculated yet, run recalculate
    const calculated = await recalculateStats(userId);
    return NextResponse.json({
      executions_per_hour: calculated.executions_per_hour,
      last_calculated_at: calculated.last_calculated_at
    });
  } catch (err: any) {
    console.error("API error in execution-rate stats:", err);
    return NextResponse.json({ error: err.message || "Server Error" }, { status: 500 });
  }
}
