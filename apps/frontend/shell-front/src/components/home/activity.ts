export interface ActivityWeek {
  week: string;
  trainings: number;
  hours: number;
}

/** Calendar weeks in UTC match the server's aggregation. A missing count is zero only after a successful response. */
export function activityWeeks(rows: ActivityWeek[], now: Date): ActivityWeek[] {
  const monday = new Date(now);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - 49);
  return Array.from({ length: 8 }, (_, i) => {
    const week = new Date(monday.getTime() + i * 7 * 86400000).toISOString();
    return rows.find((row) => row.week === week) ?? { week, trainings: 0, hours: 0 };
  });
}
