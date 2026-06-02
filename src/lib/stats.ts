import { insforgeAdmin } from "./insforge";

export interface RecalculatedStats {
  executions_per_hour: number;
  last_calculated_at: string;
  this_week: number;
  last_week: number;
  velocity_change: number;
  trend: "accelerating" | "slowing" | "steady";
}

/**
 * Helper function to calculate local date string "YYYY-MM-DD"
 */
function getPastDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function recalculateStats(userId: string): Promise<RecalculatedStats> {
  const now = new Date();
  const nowStr = now.toISOString();

  // Fetch all completion history for the user, ordered by created_at (ascending)
  const { data: history, error: fetchError } = await insforgeAdmin.database
    .from("completion_history")
    .select("completed_date, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (fetchError) {
    console.error("Error fetching completion history for stats recalculation:", fetchError);
    throw fetchError;
  }

  const totalCompletions = history ? history.length : 0;

  let executionsPerHour = 0.0;
  let completionsLast24Hrs = 0;

  if (totalCompletions > 0 && history) {
    // 1. Calculate completions in the last 24 hours
    const oneDayAgoTime = now.getTime() - 24 * 60 * 60 * 1000;
    completionsLast24Hrs = history.filter(h => {
      const hTime = new Date(h.created_at || nowStr).getTime();
      return hTime >= oneDayAgoTime;
    }).length;

    // 2. Calculate hours since first submission
    const firstCompletionTime = new Date(history[0].created_at || nowStr);
    const hoursSinceFirst = (now.getTime() - firstCompletionTime.getTime()) / (1000 * 60 * 60);
    const hours = Math.max(hoursSinceFirst, 1.0); // Clamp to at least 1 hour

    if (hours < 24.0) {
      executionsPerHour = totalCompletions / hours;
    } else {
      executionsPerHour = completionsLast24Hrs / 24;
    }
  }

  executionsPerHour = parseFloat(executionsPerHour.toFixed(2));

  // 3. Calculate submission velocity (Completions this week vs last week)
  const today = getPastDateString(0);
  const thisWeekStart = getPastDateString(6);
  const lastWeekStart = getPastDateString(13);
  const lastWeekEnd = getPastDateString(7);

  let thisWeekCount = 0;
  let lastWeekCount = 0;

  if (history) {
    history.forEach(h => {
      const dateStr = h.completed_date;
      if (dateStr >= thisWeekStart && dateStr <= today) {
        thisWeekCount++;
      } else if (dateStr >= lastWeekStart && dateStr <= lastWeekEnd) {
        lastWeekCount++;
      }
    });
  }

  const velocityChange = parseFloat(
    (((thisWeekCount - lastWeekCount) / Math.max(lastWeekCount, 1)) * 100).toFixed(1)
  );

  let trend: "accelerating" | "slowing" | "steady" = "steady";
  if (velocityChange > 0) {
    trend = "accelerating";
  } else if (velocityChange < 0) {
    trend = "slowing";
  }

  // 4. Persist to DB profiles table
  const { error: updateError } = await insforgeAdmin.database
    .from("profiles")
    .update({
      executions_per_hour: executionsPerHour,
      last_calculated_at: nowStr,
      velocity_change: velocityChange,
      velocity_this_week: thisWeekCount,
      velocity_last_week: lastWeekCount,
      velocity_trend: trend,
      updated_at: nowStr
    })
    .eq("id", userId);

  if (updateError) {
    console.error("Error updating user stats in profiles:", updateError);
    throw updateError;
  }

  return {
    executions_per_hour: executionsPerHour,
    last_calculated_at: nowStr,
    this_week: thisWeekCount,
    last_week: lastWeekCount,
    velocity_change: velocityChange,
    trend
  };
}
