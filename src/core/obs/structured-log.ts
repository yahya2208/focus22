export type LogStatus = 'ok' | 'error' | 'skipped';

export interface StructuredEvent {
  readonly requestId: string;
  readonly service: string;
  readonly action: string;
  readonly durationMs?: number;
  readonly status: LogStatus;
  readonly errorCode?: string;
  readonly caller?: string;
  readonly trigger?: string;
  readonly sessionId?: string;
  readonly detail?: string;
  readonly at: number;
}

const MAX_EVENTS = 50;
const recent: StructuredEvent[] = [];
let seq = 0;

export function nextRequestId(): string {
  seq += 1;
  return `req-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export function emitLog(input: {
  readonly service: string;
  readonly action: string;
  readonly durationMs?: number;
  readonly status?: LogStatus;
  readonly errorCode?: string;
  readonly caller?: string;
  readonly trigger?: string;
  readonly sessionId?: string;
  readonly detail?: string;
}): StructuredEvent {
  const event: StructuredEvent = {
    requestId: nextRequestId(),
    service: input.service,
    action: input.action,
    durationMs: input.durationMs,
    status: input.status ?? 'ok',
    errorCode: input.errorCode,
    caller: input.caller,
    trigger: input.trigger,
    sessionId: input.sessionId,
    detail: input.detail,
    at: performance.now(),
  };
  recent.push(event);
  if (recent.length > MAX_EVENTS) recent.shift();
  if (event.status === 'error') {
    console.error(`[obs] ${JSON.stringify(event)}`);
  } else {
    console.info(`[obs] ${JSON.stringify(event)}`);
  }
  return event;
}

export function recentEvents(): readonly StructuredEvent[] {
  return recent;
}

export function resetStructuredLog(): void {
  recent.length = 0;
  seq = 0;
}
