import { memo, useState } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { HomeMenu } from '../../components/navigation/HomeMenu';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { BrandFooter } from '../../components/brand/BrandFooter';
import { Screen, Stack } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import {
  WHATSAPP_PHONE,
  buildWhatsAppUrl,
  getWhatsAppPhone,
} from '../../services/whatsapp-service';

// ============================================================================
// FOCUS Home (H1) — a calm, premium two-choice landing.
//
//   FOCUS hero (brand + one short line of intent)
//   🥬 Vegetables  →  pilot-storefront?category=produce  (family produce flow)
//   📱 Phones      →  showroom                          (phone gallery)
//   📞 Call  +  💬 WhatsApp  →  business line (contact row)
//
// Deliberately NOT here: score/stats/devices/services dashboards. Every older
// feature stays reachable via the ☰ HomeMenu or its existing route. Nothing
// was deleted — Home is an entry point again, not a dashboard.
// ============================================================================

export const HomeScreen = memo(function HomeScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [menuOpen, setMenuOpen] = useState(false);

  const openVegetables = () => {
    dispatch({
      type: 'NAVIGATE',
      screen: 'pilot-storefront',
      params: { category: 'produce' },
    });
  };

  const openPhones = () => {
    dispatch({ type: 'NAVIGATE', screen: 'showroom' });
  };

  const whatsappPhone = getWhatsAppPhone();
  const whatsappHref = whatsappPhone ? buildWhatsAppUrl(whatsappPhone, '') : '';
  const callHref = `tel:${WHATSAPP_PHONE}`;

  // Portal cards are brand surfaces: an opaque dark base in EVERY theme
  // (so the page background never shows through as white), with the
  // domain tint + glow layered on top. Card text is fixed light for
  // contrast on the dark base, independent of the active theme.
  const DARK_CARD_BASE = 'linear-gradient(150deg, #15152b 0%, #0a0a12 100%)';
  const CARD_TITLE = '#f0f0f6';
  const CARD_SUBTITLE = '#a8a8c0';

  const portalCard = (
    borderColor: string,
    glowColor: string,
    tint: string,
  ): React.CSSProperties => ({
    overflow: 'hidden',
    borderRadius: '22px',
    border: `1px solid ${borderColor}`,
    background: `${tint}, ${DARK_CARD_BASE}`,
    boxShadow: `0 8px 28px rgba(0,0,0,0.28), 0 0 34px ${glowColor}`,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '216px',
    padding: '1.5rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'center',
    transition: 'transform 0.18s cubic-bezier(0.22,1,0.36,1)',
  });

  const cardTitle: React.CSSProperties = {
    margin: 0,
    color: CARD_TITLE,
    fontSize: '1.15rem',
    fontWeight: 800,
  };

  const cardSubtitle: React.CSSProperties = {
    margin: '0.35rem 0 0',
    color: CARD_SUBTITLE,
    fontSize: '0.8rem',
    lineHeight: 1.5,
  };

  const arrowBadge = (background: string): React.CSSProperties => ({
    flexShrink: 0,
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background,
    color: '#0a0a12',
    fontWeight: 800,
    fontSize: '1.15rem',
  });

  return (
    <Screen ariaLabel="Main navigation" maxWidth="560px" bottomPad="6rem">
      <Stack gap="lg">
        {/* Top bar — brand + menu */}
        <Flex justify="space-between" align="center">
          <BrandLogo size={40} showSubtitle subtitle={t('app.subtitle')} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={t('home.menu')}
            aria-expanded={menuOpen}
          >
            ☰
          </Button>
        </Flex>

        <HomeMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

        {/* Hero — brand + one short line of intent */}
        <div style={{ textAlign: 'center', padding: '1.75rem 0 0.5rem' }}>
          <p
            style={{
              margin: 0,
              color: colors.text,
              fontSize: '2.5rem',
              fontWeight: 800,
              letterSpacing: '0.14em',
              lineHeight: 1,
              textShadow: `0 0 42px ${colors.accentGlow}`,
            }}
          >
            FOCUS
          </p>
          <p
            style={{
              margin: '0.85rem 0 0',
              color: colors.textSecondary,
              fontSize: '1rem',
              fontWeight: 600,
            }}
          >
            {t('home.whatToday')}
          </p>
        </div>

        {/* The only choice: vegetables or phones */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            width: '100%',
          }}
        >
          {/* Vegetables — green identity */}
          <button
            type="button"
            onClick={openVegetables}
            aria-label={t('home.vegetables')}
            style={{
              ...portalCard(
                colors.success,
                `${colors.successText}44`,
                `linear-gradient(150deg, ${colors.success}1f 0%, ${colors.successBg} 100%)`,
              ),
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '3.5rem', lineHeight: 1, paddingTop: '0.5rem' }}>
              🥬
            </span>
            <p style={{ ...cardTitle, marginTop: '0.75rem' }}>{t('home.vegetables')}</p>
            <p style={cardSubtitle}>{t('home.vegetablesSubtitle')}</p>
            <span
              aria-hidden="true"
              style={{ ...arrowBadge(colors.success), margin: '1.1rem auto 0' }}
            >
              ←
            </span>
          </button>

          {/* Phones — blue identity */}
          <button
            type="button"
            onClick={openPhones}
            aria-label={t('home.phones')}
            style={{
              ...portalCard(
                colors.info,
                `${colors.infoText}44`,
                `linear-gradient(150deg, ${colors.info}1f 0%, ${colors.infoBg} 100%)`,
              ),
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '3.5rem', lineHeight: 1, paddingTop: '0.5rem' }}>
              📱
            </span>
            <p style={{ ...cardTitle, marginTop: '0.75rem' }}>{t('home.phones')}</p>
            <p style={cardSubtitle}>{t('home.phonesSubtitle')}</p>
            <span
              aria-hidden="true"
              style={{ ...arrowBadge(colors.info), margin: '1.1rem auto 0' }}
            >
              ←
            </span>
          </button>
        </div>

        {/* Contact row — small vs the two cards, glowing, touch-friendly */}
        {whatsappHref ? (
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              width: '100%',
              flexWrap: 'wrap',
            }}
          >
            <a
              href={callHref}
              aria-label={t('home.callUs')}
              style={{
                flex: '1 1 200px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                minHeight: '52px',
                padding: '0.7rem 1rem',
                borderRadius: '9999px',
                border: `1px solid ${colors.success}`,
                background: `linear-gradient(135deg, ${colors.success}26 0%, ${colors.successBg} 100%)`,
                boxShadow: `0 8px 28px rgba(0,0,0,0.28), 0 0 24px ${colors.successText}44`,
                color: colors.text,
                fontSize: '0.85rem',
                fontWeight: 700,
                textDecoration: 'none',
                fontFamily: 'inherit',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '1.05rem' }}>
                📞
              </span>
              {t('home.callUs')}
            </a>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener"
              aria-label={t('home.whatsapp')}
              style={{
                flex: '1 1 200px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                minHeight: '52px',
                padding: '0.7rem 1rem',
                borderRadius: '9999px',
                border: `1px solid ${colors.info}`,
                background: `linear-gradient(135deg, ${colors.info}26 0%, ${colors.infoBg} 100%)`,
                boxShadow: `0 8px 28px rgba(0,0,0,0.28), 0 0 24px ${colors.infoText}44`,
                color: colors.text,
                fontSize: '0.85rem',
                fontWeight: 700,
                textDecoration: 'none',
                fontFamily: 'inherit',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '1.05rem' }}>
                💬
              </span>
              {t('home.whatsapp')}
            </a>
          </div>
        ) : null}

        <BrandFooter />
      </Stack>
    </Screen>
  );
});
