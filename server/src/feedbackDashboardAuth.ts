/** Same rules as GET /api/feedback for listing stored feedback. */
export function feedbackDashboardKeyAllowsRead(key: string | undefined): boolean {
    const expected = process.env.FEEDBACK_DASHBOARD_KEY;
    const prod = process.env.NODE_ENV === "production";
    if (prod) {
        return !!expected && key === expected;
    }
    if (expected) {
        return key === expected;
    }
    return true;
}
