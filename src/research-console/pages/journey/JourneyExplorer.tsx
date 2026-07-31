import { useState, useCallback } from 'react';
import { getDataService, type AnalyticsEvent } from '../../../core/supabase/data-service';
import { Card } from '../../../components/shared/Card';
import { DashboardHeader } from '../../../research-console/layout/ResearchLayout';

const EVENT_LABELS: Record<string, string> = {
  app_opened: 'App Opened', landing_loaded: 'Landing Loaded', campaign_detected: 'Campaign Detected',
  game_intro_shown: 'Intro Shown', consent_granted: 'Consent Granted', consent_withdrawn: 'Consent Withdrawn',
  calibration_started: 'Calibration Started', calibration_completed: 'Calibration Completed',
  round_started: 'Round Started', lamp_appeared: 'Lamp Appeared', lamp_clicked: 'Lamp Clicked',
  miss_click: 'Miss Click', game_started: 'Game Started', game_completed: 'Game Completed',
  game_abandoned: 'Game Abandoned', game_paused: 'Game Paused', game_resumed: 'Game Resumed',
  results_viewed: 'Results Viewed', share_clicked: 'Share Clicked',
  auth_guest_created: 'Guest Created', auth_registered: 'Registered', auth_converted: 'Auth Converted',
  login: 'Login', registration_prompt: 'Registration Prompt', registration_completed: 'Registration Completed',
  guest_converted: 'Guest Converted', qr_scanned: 'QR Scanned', qr_generated: 'QR Generated',
  campaign_opened: 'Campaign Opened', referral_clicked: 'Referral Clicked',
  phone_service_opened: 'Phone Services', device_selected: 'Device Selected',
  trade_offer_viewed: 'Trade Offer Viewed', trade_requested: 'Trade Requested',
  whatsapp_clicked: 'WhatsApp Clicked',
  buy_flow_started: 'Buy Started', sell_flow_started: 'Sell Started', exchange_flow_started: 'Exchange Started',
  session_saved: 'Session Saved', session_synced: 'Session Synced',
  settings_changed: 'Settings Changed', error_occurred: 'Error',
};

const EVENT_COLORS: Record<string, string> = {
  app_opened: '#6366f1', landing_loaded: '#6366f1', campaign_detected: '#6366f1', game_intro_shown: '#6366f1',
  consent_granted: '#f59e0b', consent_withdrawn: '#ef4444',
  calibration_started: '#8b5cf6', calibration_completed: '#8b5cf6',
  round_started: '#22c55e', lamp_appeared: '#22c55e', lamp_clicked: '#22c55e',
  miss_click: '#ef4444', game_started: '#22c55e', game_completed: '#22c55e',
  game_abandoned: '#ef4444', game_paused: '#f59e0b', game_resumed: '#22c55e',
  results_viewed: '#14b8a6', share_clicked: '#14b8a6',
  auth_guest_created: '#f97316', auth_registered: '#f97316', auth_converted: '#f97316',
  login: '#f97316', registration_completed: '#f97316', guest_converted: '#f97316',
  qr_scanned: '#6366f1', qr_generated: '#6366f1',
  phone_service_opened: '#ec4899', device_selected: '#ec4899',
  trade_offer_viewed: '#ec4899', trade_requested: '#ec4899', whatsapp_clicked: '#ec4899',
  buy_flow_started: '#ec4899', sell_flow_started: '#ec4899', exchange_flow_started: '#ec4899',
  error_occurred: '#ef4444', settings_changed: '#888',
};

function getEventColor(eventType: string, defaultColor = '#6366f1'): string {
  return EVENT_COLORS[eventType] ?? defaultColor;
}

function getEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getRelativeTime(prev: string, curr: string): string {
  const diff = new Date(curr).getTime() - new Date(prev).getTime();
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function groupBySession(events: AnalyticsEvent[]): Map<string, AnalyticsEvent[]> {
  const groups = new Map<string, AnalyticsEvent[]>();
  for (const ev of events) {
    const key = ev.session_id ?? 'no-session';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }
  return groups;
}

export function JourneyExplorer() {
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    try {
      const ds = getDataService();
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      const results: AnalyticsEvent[] = [];
      if (isUUID) {
        const [byUser, bySession, byDevice] = await Promise.all([
          ds.getJourney({ user_id: q }),
          ds.getJourney({ session_id: q }),
          ds.getJourney({ device_id: q }),
        ]);
        results.push(...byUser, ...bySession, ...byDevice);
      } else {
        const byUser = await ds.getJourney({ user_id: q });
        results.push(...byUser);
      }
      const seen = new Set<string>();
      const deduped = results.filter((e) => {
        const key = `${e.id ?? e.created_at}_${e.event_type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      deduped.sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());
      setEvents(deduped);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const toggleExpand = (key: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groups = groupBySession(events);
  const sessionIds = Array.from(groups.keys());
  const firstEvent = events[0];
  const lastEvent = events.length > 1 ? events[events.length - 1] : null;

  return (
    <div>
      <DashboardHeader
        title="Journey Explorer"
        subtitle="Trace a user's complete event journey — search by user ID, session ID, or device ID"
      />

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder="Enter user ID, session ID, or device ID..."
          style={{
            flex: 1, padding: '0.6rem 1rem', borderRadius: '8px',
            border: '1px solid #333', background: '#1e1e2e', color: '#f0f0f0',
            fontSize: '0.9rem', outline: 'none',
          }}
        />
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          style={{
            padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none',
            background: loading ? '#444' : '#6366f1', color: '#fff',
            cursor: loading ? 'wait' : 'pointer', fontSize: '0.9rem', fontWeight: 600,
          }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {!searched && (
        <Card>
          <p style={{ color: '#888', textAlign: 'center', padding: '3rem 1rem' }}>
            Enter a user ID, session ID, or device ID to trace a complete player journey.
          </p>
        </Card>
      )}

      {searched && !loading && events.length === 0 && (
        <Card>
          <p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem 1rem' }}>
            No events found for <strong style={{ color: '#f0f0f0' }}>{query}</strong>
          </p>
        </Card>
      )}

      {events.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <Card padding="0.75rem">
              <p style={{ color: '#888', fontSize: '0.75rem' }}>Total Events</p>
              <p style={{ color: '#f0f0f0', fontSize: '1.25rem', fontWeight: 'bold' }}>{events.length}</p>
            </Card>
            <Card padding="0.75rem">
              <p style={{ color: '#888', fontSize: '0.75rem' }}>Sessions</p>
              <p style={{ color: '#f0f0f0', fontSize: '1.25rem', fontWeight: 'bold' }}>{sessionIds.length}</p>
            </Card>
            <Card padding="0.75rem">
              <p style={{ color: '#888', fontSize: '0.75rem' }}>Event Types</p>
              <p style={{ color: '#f0f0f0', fontSize: '1.25rem', fontWeight: 'bold' }}>{new Set(events.map((e) => e.event_type)).size}</p>
            </Card>
            <Card padding="0.75rem">
              <p style={{ color: '#888', fontSize: '0.75rem' }}>Time Span</p>
              <p style={{ color: '#f0f0f0', fontSize: '1.25rem', fontWeight: 'bold' }}>
                {firstEvent && lastEvent
                  ? getRelativeTime(firstEvent.created_at!, lastEvent.created_at!)
                  : '—'}
              </p>
            </Card>
          </div>

          {sessionIds.map((sid) => {
            const sessionEvents = groups.get(sid)!;
            const firstEv = sessionEvents[0];
            if (!firstEv) return null;
            return (
              <Card key={sid} style={{ marginBottom: '1rem' }} padding="0">
                <div style={{
                  padding: '0.75rem 1rem', borderBottom: '1px solid #1e1e2e',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ color: '#6366f1', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                    {sid === 'no-session' ? 'No Session' : `Session: ${sid.slice(0, 8)}…${sid.slice(-4)}`}
                  </span>
                  <span style={{ color: '#888', fontSize: '0.8rem' }}>
                    {sessionEvents.length} events · {formatDate(firstEv.created_at!)}
                  </span>
                </div>
                <div style={{ padding: '1rem' }}>
                  {sessionEvents.map((ev, idx) => {
                    const eventKey = `${sid}_${idx}`;
                    const prevEv = idx > 0 ? sessionEvents[idx - 1] : null;
                    const isExpanded = expandedEvents.has(eventKey);
                    return (
                      <div
                        key={eventKey}
                        onClick={() => toggleExpand(eventKey)}
                        style={{
                          display: 'flex', gap: '0.75rem', padding: '0.25rem 0',
                          cursor: 'pointer', alignItems: 'flex-start',
                          transition: 'opacity 0.1s',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '14px', flexShrink: 0 }}>
                          <div style={{
                            width: '12px', height: '12px', borderRadius: '50%',
                            background: getEventColor(ev.event_type),
                            border: '2px solid #0a0a0f', flexShrink: 0,
                          }} />
                          {idx < sessionEvents.length - 1 && (
                            <div style={{ width: '2px', flex: 1, minHeight: '20px', background: '#333' }} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: '#f0f0f0', fontSize: '0.85rem', fontWeight: 500 }}>
                              {getEventLabel(ev.event_type)}
                            </span>
                            <span style={{ color: '#888', fontSize: '0.75rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                              {formatTimestamp(ev.created_at!)}
                            </span>
                          </div>
                          {prevEv && (
                            <span style={{ color: '#555', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                              +{getRelativeTime(prevEv.created_at!, ev.created_at!)}
                            </span>
                          )}
                          {isExpanded && ev.event_data && Object.keys(ev.event_data).length > 0 && (
                            <pre style={{
                              marginTop: '0.5rem', padding: '0.5rem', borderRadius: '6px',
                              background: '#12121a', color: '#aaa', fontSize: '0.75rem',
                              overflow: 'auto', maxHeight: '200px', fontFamily: 'monospace',
                              border: '1px solid #1e1e2e',
                            }}>
                              {JSON.stringify(ev.event_data, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
