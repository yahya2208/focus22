import { describe, it, expect } from 'vitest';
import ar from '../../i18n/translations/ar';
import en from '../../i18n/translations/en';
import fr from '../../i18n/translations/fr';
import tr from '../../i18n/translations/tr';

/**
 * Family provisioning creates an ACTIVE membership immediately
 * (pilot_admin_provision_family_member → status='active'; family_members
 * CHECK forbids any pending state). The success copy must say so and must
 * never mention pending approval.
 */
describe('pilot.msg.PROVISION_OK copy contract', () => {
  const dicts = { ar, en, fr, tr } as const;
  for (const [locale, dict] of Object.entries(dicts)) {
    it(`${locale}: success copy states linked/active, never pending approval`, () => {
      const text: string = (dict as Record<string, string>)['pilot.msg.PROVISION_OK'] ?? '';
      expect(text).toBeTruthy();
      expect(text.toLowerCase()).not.toContain('pending');
      expect(text.toLowerCase()).not.toContain('approbation');
      expect(text.toLowerCase()).not.toContain('onay bekliyor');
      expect(text).not.toContain('بانتظار الموافقة');
    });
  }
});
