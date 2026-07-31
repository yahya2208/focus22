import { getAllRepairRequests, getAllQuotes, getAllTimelineEvents, getAllCourierJobs } from './repair-database';
import type { RepairBI } from './repair-types';

export async function getRepairBIData(): Promise<RepairBI> {
  const [requests, quotes, timeline, courierJobs] = await Promise.all([
    getAllRepairRequests(),
    getAllQuotes(),
    getAllTimelineEvents(),
    getAllCourierJobs(),
  ]);

  const total = requests.length;
  const completed = requests.filter(r => r.status === 'Delivered').length;
  const failed = requests.filter(r => r.status === 'Cancelled').length;
  const pending = requests.filter(r => r.status === 'Pending').length;

  const completedIds = new Set(requests.filter(r => r.status === 'Delivered').map(r => r.id));

  const repairTimes = completedIds.size > 0
    ? Array.from(completedIds).map(id => {
        const req = requests.find(r => r.id === id);
        if (!req) return 0;
        const reqTimeline = timeline.filter(e => e.repairId === id);
        const created = new Date(req.createdAt).getTime();
        const readyEvent = reqTimeline.find(e => e.status === 'Ready' || e.status === 'Delivered');
        const endTime = readyEvent ? new Date(readyEvent.createdAt).getTime() : Date.now();
        return (endTime - created) / 3600000;
      })
    : [];

  const averageRepairTimeHours = repairTimes.length > 0
    ? repairTimes.reduce((a, b) => a + b, 0) / repairTimes.length
    : 0;

  const successRate = total > 0
    ? (completed / (total - pending || 1)) * 100
    : 0;

  const issueCounts: Record<string, number> = {};
  requests.forEach(r => {
    issueCounts[r.issue] = (issueCounts[r.issue] || 0) + 1;
  });
  const topIssues = Object.entries(issueCounts)
    .map(([issue, count]) => ({ issue, count } as { issue: any; count: number }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const brandCounts: Record<string, number> = {};
  requests.forEach(r => {
    brandCounts[r.brandName] = (brandCounts[r.brandName] || 0) + 1;
  });
  const topBrands = Object.entries(brandCounts)
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const uniquePhones = new Set(requests.filter(r => r.customerPhone).map(r => r.customerPhone));
  const repeatCustomers = Array.from(uniquePhones)
    .filter(phone => requests.filter(r => r.customerPhone === phone).length > 1)
    .length;

  const courierById: Record<string, { courierName: string; totalJobs: number; completedJobs: number }> = {};
  courierJobs.forEach(job => {
    if (!courierById[job.courierId]) {
      courierById[job.courierId] = { courierName: job.courierName, totalJobs: 0, completedJobs: 0 };
    }
    const entry = courierById[job.courierId]!;
    entry.totalJobs++;
    if (job.status === 'Returned') entry.completedJobs++;
  });
  const courierPerformance = Object.entries(courierById).map(([courierId, data]) => ({
    courierId,
    courierName: data.courierName,
    totalJobs: data.totalJobs,
    completedJobs: data.completedJobs,
  }));

  const totalRevenue = quotes.filter(q => q.approvedAt !== null).reduce((sum, q) => sum + (q.estimatedPrice || 0), 0);
  const totalCost = 0;

  return {
    averageRepairTimeHours,
    repairSuccessRate: successRate,
    averageProfit: 0,
    topIssues,
    topBrands,
    repeatCustomers,
    courierPerformance,
    pendingQuotes: pending,
    failedRepairs: failed,
    totalRepairs: total,
    totalRevenue,
    totalCost,
  };
}
