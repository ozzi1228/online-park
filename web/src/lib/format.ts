/** 한국 시각 "YYYY-MM-DD HH:mm:ss" */
export const kst = (d: Date) => new Date(d.getTime() + 9 * 3_600_000).toISOString().replace("T", " ").slice(0, 19);
