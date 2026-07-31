import { generateId } from '../business-intelligence/data-source';

const STORAGE_SESSIONS = 'customer_memory_sessions';
const STORAGE_EVENTS = 'customer_memory_events';
const MAX_EVENTS = 1000;

export interface CustomerSession {
  id: string;
  customerId: string;
  customerName?: string;
  lastBrand?: string;
  lastModel?: string;
  lastVariant?: string;
  lastAction?: 'buy' | 'sell' | 'exchange' | 'inquiry' | 'stock_check' | 'price_check';
  lastCampaign?: string;
  visitCount: number;
  firstVisit: string;
  lastVisit: string;
  totalPurchases: number;
  totalValue: number;
  notes?: string;
}

export interface CustomerEvent {
  id: string;
  customerId: string;
  type: 'visit' | 'search' | 'select_device' | 'send_whatsapp' | 'purchase' | 'exchange' | 'inquiry';
  brand?: string;
  model?: string;
  variant?: string;
  value?: number;
  campaign?: string;
  createdAt: string;
}

function loadSessions(): Record<string, CustomerSession> {
  try {
    const raw = localStorage.getItem(STORAGE_SESSIONS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSessions(sessions: Record<string, CustomerSession>): void {
  localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(sessions));
}

function loadEvents(): CustomerEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_EVENTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEvents(events: CustomerEvent[]): void {
  if (events.length > MAX_EVENTS) {
    events = events.slice(events.length - MAX_EVENTS);
  }
  localStorage.setItem(STORAGE_EVENTS, JSON.stringify(events));
}

export const CustomerMemoryService = {
  track(customerId: string, event: Omit<CustomerEvent, 'id' | 'createdAt' | 'customerId'>): void {
    const sessions = loadSessions();
    const now = new Date().toISOString();

    const existing = sessions[customerId];
    if (existing) {
      existing.lastVisit = now;
      existing.visitCount += 1;
      if (event.brand) existing.lastBrand = event.brand;
      if (event.model) existing.lastModel = event.model;
      if (event.variant) existing.lastVariant = event.variant;
      if (event.campaign) existing.lastCampaign = event.campaign;
      if (event.type === 'purchase') {
        existing.totalPurchases += 1;
        if (event.value) existing.totalValue += event.value;
      }
      switch (event.type) {
        case 'purchase':
          existing.lastAction = 'buy';
          break;
        case 'exchange':
          existing.lastAction = 'exchange';
          break;
        case 'inquiry':
          existing.lastAction = 'inquiry';
          break;
        case 'search':
          existing.lastAction = 'stock_check';
          break;
      }
    } else {
      const session: CustomerSession = {
        id: generateId(),
        customerId,
        lastBrand: event.brand,
        lastModel: event.model,
        lastVariant: event.variant,
        lastCampaign: event.campaign ?? undefined,
        visitCount: 1,
        firstVisit: now,
        lastVisit: now,
        totalPurchases: event.type === 'purchase' ? 1 : 0,
        totalValue: event.type === 'purchase' && event.value ? event.value : 0,
      };
      switch (event.type) {
        case 'purchase':
          session.lastAction = 'buy';
          break;
        case 'exchange':
          session.lastAction = 'exchange';
          break;
        case 'inquiry':
          session.lastAction = 'inquiry';
          break;
        case 'search':
          session.lastAction = 'stock_check';
          break;
      }
      sessions[customerId] = session;
    }

    const fullEvent: CustomerEvent = {
      id: generateId(),
      customerId,
      ...event,
      createdAt: now,
    };

    const events = loadEvents();
    events.push(fullEvent);
    saveEvents(events);
    saveSessions(sessions);
  },

  getCustomer(customerId: string): CustomerSession | null {
    const sessions = loadSessions();
    return sessions[customerId] ?? null;
  },

  searchCustomers(query: string): CustomerSession[] {
    const sessions = loadSessions();
    const q = query.toLowerCase();
    return Object.values(sessions).filter(
      (s) =>
        s.customerId.toLowerCase().includes(q) ||
        (s.customerName && s.customerName.toLowerCase().includes(q))
    );
  },

  getRecentCustomers(limit: number = 10): CustomerSession[] {
    const sessions = loadSessions();
    return Object.values(sessions)
      .sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime())
      .slice(0, limit);
  },

  getCustomerEvents(customerId: string, limit: number = 20): CustomerEvent[] {
    const events = loadEvents();
    return events
      .filter((e) => e.customerId === customerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },

  getSuggestedDevice(customerId: string): { brand: string; model: string } | null {
    const events = loadEvents();
    const lastSelect = events
      .filter((e) => e.customerId === customerId && e.type === 'select_device')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (lastSelect && lastSelect.brand && lastSelect.model) {
      return { brand: lastSelect.brand, model: lastSelect.model };
    }
    return null;
  },

  updateNotes(customerId: string, notes: string): void {
    const sessions = loadSessions();
    if (sessions[customerId]) {
      sessions[customerId].notes = notes;
      saveSessions(sessions);
    }
  },

  getCustomerCount(): number {
    const sessions = loadSessions();
    return Object.keys(sessions).length;
  },

  getReturnRate(): number {
    const sessions = loadSessions();
    const values = Object.values(sessions);
    if (values.length === 0) return 0;
    const returning = values.filter((s) => s.visitCount > 1).length;
    return returning / values.length;
  },
};
