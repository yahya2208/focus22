export {
  createPermissionGuard,
  type ResearchRole, type RolePermission, type PermissionGuard,
} from './permissions';

export {
  createEmptyFilters, hasActiveFilters, getActiveFilterCount,
  resetFilter, resetAllFilters, updateFilter, serializeFilters, deserializeFilters,
  createFilterStore,
  type ResearchFilters, type FilterKey, type FilterChange, type FilterListener, type FilterStore,
} from './filters';

export {
  computeBarChartLayout, computeLineChartPath, computeHistogram,
  computePieChart, computeScatterLayout, computeHeatmapLayout,
  computePercentiles, computeStatistics,
  type ChartDataPoint, type TimeSeriesPoint, type ScatterPoint, type HeatmapCell, type ChartDimensions,
} from './charts';

export {
  createCohortBuilder, createCohortStore,
  type CohortBuilder, type CohortCondition, type CohortDefinition,
  type CohortOperator, type SavedCohort, type CohortStore,
} from './cohort';

export {
  exportToCsv, exportToJson, exportScientificDataset, exportAggregatedDataset,
  exportAnonymousDataset, createExportService,
  type ExportFormat, type ExportOptions, type ExportResult, type ExportService,
} from './export';

export {
  createResearchAPI,
  type ResearchAPI, type OverviewStats, type ScientificMetrics,
  type UserAnalytics, type SessionAnalytics, type DeviceAnalytics,
  type SurveyAnalytics, type CampaignAnalytics, type LiveEvent, type SystemHealth,
} from './api';
