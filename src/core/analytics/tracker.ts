import { getGlobalTelemetry } from '../telemetry';
import { EventTypes } from './events';

export function trackRoundStarted(round: number, totalRounds: number, campaignId?: string): void {
  getGlobalTelemetry().track(EventTypes.ROUND_STARTED, { round, totalRounds, campaign_id: campaignId });
}

export function trackLampAppeared(round: number, delayMs: number): void {
  getGlobalTelemetry().track(EventTypes.LAMP_APPEARED, { round, delay_ms: delayMs });
}

export function trackLampClicked(round: number, reactionMs: number, valid: boolean): void {
  getGlobalTelemetry().track(EventTypes.LAMP_CLICKED, { round, reaction_ms: reactionMs, valid });
}

export function trackMissClick(round: number, reason: 'early' | 'wrong_area' | 'timeout'): void {
  getGlobalTelemetry().track(EventTypes.MISS_CLICK, { round, reason });
}

export function trackGamePaused(round: number, elapsedMs: number): void {
  getGlobalTelemetry().track(EventTypes.GAME_PAUSED, { round, elapsed_ms: elapsedMs });
}

export function trackGameResumed(round: number, pausedDurationMs: number): void {
  getGlobalTelemetry().track(EventTypes.GAME_RESUMED, { round, paused_duration_ms: pausedDurationMs });
}

export function trackPhoneServiceOpened(source: string): void {
  getGlobalTelemetry().track(EventTypes.PHONE_SERVICE_OPENED, { source });
}

export function trackDeviceSelected(deviceType: string, brand?: string, model?: string): void {
  getGlobalTelemetry().track(EventTypes.DEVICE_SELECTED, { device_type: deviceType, brand, model });
}

export function trackTradeOfferViewed(deviceBrand: string, deviceModel: string): void {
  getGlobalTelemetry().track(EventTypes.TRADE_OFFER_VIEWED, { device_brand: deviceBrand, device_model: deviceModel });
}

export function trackTradeRequested(yourDevice: string, desiredDevice: string, priceDiff: number): void {
  getGlobalTelemetry().track(EventTypes.TRADE_REQUESTED, { your_device: yourDevice, desired_device: desiredDevice, price_diff: priceDiff });
}

export function trackWhatsAppClicked(shareType: string, campaignId?: string): void {
  getGlobalTelemetry().track(EventTypes.WHATSAPP_CLICKED, { share_type: shareType, campaign_id: campaignId });
}

export function trackBuyFlowStarted(deviceType: string): void {
  getGlobalTelemetry().track(EventTypes.BUY_FLOW_STARTED, { device_type: deviceType });
}

export function trackSellFlowStarted(deviceType: string): void {
  getGlobalTelemetry().track(EventTypes.SELL_FLOW_STARTED, { device_type: deviceType });
}

export function trackExchangeFlowStarted(yourBrand?: string, wantBrand?: string): void {
  getGlobalTelemetry().track(EventTypes.EXCHANGE_FLOW_STARTED, { your_brand: yourBrand, want_brand: wantBrand });
}

export function trackLogin(method: 'email' | 'magic_link' | 'guest'): void {
  getGlobalTelemetry().track(EventTypes.LOGIN, { method });
}

export function trackCampaignOpened(campaignId: string, campaignName: string): void {
  getGlobalTelemetry().track(EventTypes.CAMPAIGN_OPENED, { campaign_id: campaignId, campaign_name: campaignName });
}

export function trackCalibrationStarted(): void {
  getGlobalTelemetry().track(EventTypes.CALIBRATION_STARTED);
}

export function trackCalibrationCompleted(confidence: number, refreshRate: number, displayLagMs: number, inputLagMs: number): void {
  getGlobalTelemetry().track(EventTypes.CALIBRATION_COMPLETED, { confidence, refresh_rate: refreshRate, display_lag_ms: displayLagMs, input_lag_ms: inputLagMs });
}