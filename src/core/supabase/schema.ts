export interface DatabaseUser {
  readonly id: string;
  readonly email: string | null;
  readonly display_name: string | null;
  readonly role: 'guest' | 'user' | 'researcher' | 'admin' | 'super_admin';
  readonly avatar_url: string | null;
  readonly is_anonymous: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_login_at: string | null;
}

export interface DatabaseSession {
  readonly id: string;
  readonly user_id: string;
  readonly device_id: string;
  readonly calibration_id: string;
  readonly plugin_id: string;
  readonly status: 'draft' | 'running' | 'paused' | 'completed' | 'archived' | 'synced' | 'failed';
  readonly measurements: SessionMeasurementsRow | null;
  readonly scientific_results: SessionScientificResultsRow | null;
  readonly metadata: SessionMetadataRow;
  readonly created_at: string;
  readonly updated_at: string;
  readonly finished_at: string | null;
  readonly version: string;
}

export interface SessionMeasurementsRow {
  readonly raw_rts: readonly number[];
  readonly corrected_rts: readonly number[];
  readonly total_rounds: number;
  readonly valid_rounds: number;
  readonly outlier_count: number;
}

export interface SessionScientificResultsRow {
  readonly mean_corrected_ms: number;
  readonly median_corrected_ms: number;
  readonly consistency_score: number;
  readonly consistency_rating: string;
  readonly fatigue_index: number;
  readonly fatigue_score: number;
  readonly focus_score: number;
  readonly grade: string;
}

export interface SessionMetadataRow {
  readonly version: string;
  readonly plugin_version: string;
  readonly build_number: number;
}

export interface DatabaseDevice {
  readonly id: string;
  readonly user_id: string;
  readonly browser: string;
  readonly browser_version: string;
  readonly os: string;
  readonly os_version: string;
  readonly platform: string;
  readonly screen_width: number;
  readonly screen_height: number;
  readonly pixel_ratio: number;
  readonly refresh_rate: number;
  readonly touch_support: boolean;
  readonly pointer_type: string;
  readonly cpu_cores: number;
  readonly memory_gb: number | null;
  readonly language: string;
  readonly timezone: string;
  readonly user_agent: string;
  readonly collected_at: string;
}

export interface DatabaseCalibration {
  readonly id: string;
  readonly user_id: string;
  readonly device_id: string;
  readonly refresh_rate: number;
  readonly display_lag_ms: number;
  readonly input_lag_ms: number;
  readonly confidence: number;
  readonly platform: string;
  readonly browser_name: string;
  readonly created_at: string;
  readonly expires_at: string;
}

export interface DatabaseSurvey {
  readonly id: string;
  readonly user_id: string;
  readonly age_range: string | null;
  readonly gender: string | null;
  readonly country: string | null;
  readonly state: string | null;
  readonly education: string | null;
  readonly occupation: string | null;
  readonly sleep_hours: number | null;
  readonly coffee_per_day: number | null;
  readonly exercise_frequency: string | null;
  readonly dominant_hand: string | null;
  readonly gaming_frequency: string | null;
  readonly created_at: string;
}

export interface DatabaseRepairRequestRow {
  readonly id: string;
  readonly repair_code: string;
  readonly customer_name: string;
  readonly customer_phone: string;
  readonly brand_name: string;
  readonly model_name: string;
  readonly condition: string;
  readonly issue: string;
  readonly description: string;
  readonly device_working: string | null;
  readonly lock_screen: string | null;
  readonly previously_repaired: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly location_accuracy: number | null;
  readonly google_maps_link: string | null;
  readonly photo_paths: unknown;
  readonly status: string;
  readonly admin_notes: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly customer_id: string | null;
  readonly assigned_courier_id: string | null;
  readonly assigned_technician_id: string | null;
}

export interface DatabaseRepairQuoteRow {
  readonly id: string;
  readonly repair_id: string;
  readonly estimated_price: number | null;
  readonly estimated_days: number | null;
  readonly admin_notes: string;
  readonly recommended_action: string | null;
  readonly recommendation_reason: string | null;
  readonly sent_at: string | null;
  readonly approved_at: string | null;
  readonly rejected_at: string | null;
  readonly created_at: string;
}

export interface DatabaseRepairTimelineRow {
  readonly id: string;
  readonly repair_id: string;
  readonly status: string;
  readonly note: string;
  readonly created_at: string;
  readonly actor: string;
}

export interface DatabaseRepairCourierJobRow {
  readonly id: string;
  readonly repair_id: string;
  readonly courier_id: string;
  readonly courier_name: string;
  readonly customer_name: string;
  readonly customer_phone: string;
  readonly customer_address: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly google_maps_link: string | null;
  readonly distance: number | null;
  readonly status: string;
  readonly notes: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface DatabaseRepairNotificationRow {
  readonly id: string;
  readonly repair_id: string;
  readonly type: string;
  readonly recipient: string;
  readonly title: string;
  readonly message: string;
  readonly sent_at: string;
  readonly read_at: string | null;
}

export interface DatabaseRepairPhotoRow {
  readonly id: string;
  readonly repair_id: string;
  readonly path: string;
  readonly uploaded_at: string;
}

export interface DatabaseRepairStatusHistoryRow {
  readonly id: string;
  readonly repair_id: string;
  readonly from_status: string | null;
  readonly to_status: string;
  readonly changed_by: string;
  readonly changed_by_id: string | null;
  readonly note: string;
  readonly ip_address: string | null;
  readonly device_info: string | null;
  readonly created_at: string;
}

export interface DatabaseRepairAuditLogRow {
  readonly id: string;
  readonly repair_id: string | null;
  readonly action: string;
  readonly details: string;
  readonly performed_by: string;
  readonly performed_by_id: string | null;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
  readonly created_at: string;
}

export interface Database {
  readonly users: {
    readonly Row: DatabaseUser;
    readonly Insert: Omit<DatabaseUser, 'id' | 'created_at' | 'updated_at'>;
    readonly Update: Partial<Omit<DatabaseUser, 'id' | 'created_at'>>;
  };
  readonly sessions: {
    readonly Row: DatabaseSession;
    readonly Insert: Omit<DatabaseSession, 'id' | 'created_at' | 'updated_at'>;
    readonly Update: Partial<Omit<DatabaseSession, 'id' | 'created_at'>>;
  };
  readonly devices: {
    readonly Row: DatabaseDevice;
    readonly Insert: Omit<DatabaseDevice, 'id'>;
    readonly Update: Partial<Omit<DatabaseDevice, 'id'>>;
  };
  readonly calibrations: {
    readonly Row: DatabaseCalibration;
    readonly Insert: Omit<DatabaseCalibration, 'id' | 'created_at'>;
    readonly Update: Partial<Omit<DatabaseCalibration, 'id' | 'created_at'>>;
  };
  readonly surveys: {
    readonly Row: DatabaseSurvey;
    readonly Insert: Omit<DatabaseSurvey, 'id' | 'created_at'>;
    readonly Update: Partial<Omit<DatabaseSurvey, 'id' | 'created_at'>>;
  };
  readonly repair_requests: {
    readonly Row: DatabaseRepairRequestRow;
  };
  readonly repair_quotes: {
    readonly Row: DatabaseRepairQuoteRow;
  };
  readonly repair_timeline: {
    readonly Row: DatabaseRepairTimelineRow;
  };
  readonly repair_courier_jobs: {
    readonly Row: DatabaseRepairCourierJobRow;
  };
  readonly repair_notifications: {
    readonly Row: DatabaseRepairNotificationRow;
  };
  readonly repair_photos: {
    readonly Row: DatabaseRepairPhotoRow;
  };
  readonly repair_status_history: {
    readonly Row: DatabaseRepairStatusHistoryRow;
  };
  readonly repair_audit_log: {
    readonly Row: DatabaseRepairAuditLogRow;
  };
}
