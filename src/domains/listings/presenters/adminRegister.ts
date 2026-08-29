/**
 * Presenters registration (P8.4 + P8.7/D2).
 *
 * Registers ALL three categories idempotently: car, property (P8.4) and
 * phone (P8.7). Registering the phone presenter changes NOTHING in the
 * legacy phone flow — no production consumer requests it yet (the P8.6
 * deep-link guard stays; PhoneCard/ProductDetailsScreen keep reading
 * InventoryRecord directly). It only makes the phone RENDERABLE through
 * the neutral contract for future surfaces and parity tests.
 */

import { hasListingPresenter, registerListingPresenter } from './registry';
import { carListingPresenter } from './car';
import { propertyListingPresenter } from './property';
import { phoneListingPresenter } from './phone';
import { produceListingPresenter } from './produce';

let registered = false;

/**
 * Idempotent registration for UI shells (registry itself rejects duplicates).
 * Reset-aware: after `resetListingPresentersForTests()` clears the registry,
 * the fast-path flag alone would skip re-registration — so every category
 * missing from the live registry is re-registered here.
 */
export function ensureAdminListingPresenters(): void {
  if (
    registered &&
    hasListingPresenter('phone') &&
    hasListingPresenter('car') &&
    hasListingPresenter('property') &&
    hasListingPresenter('produce')
  ) {
    return;
  }
  if (!hasListingPresenter('phone')) registerListingPresenter(phoneListingPresenter);
  if (!hasListingPresenter('car')) registerListingPresenter(carListingPresenter);
  if (!hasListingPresenter('property')) registerListingPresenter(propertyListingPresenter);
  if (!hasListingPresenter('produce')) registerListingPresenter(produceListingPresenter);
  registered = true;
}
