import { memo, useEffect, useState } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { Screen, Stack, Grid } from '../../design-system/layout';
import { Card } from '../../design-system/components/Card';
import { Button } from '../../design-system/components/Button';
import { PhoneShowroom } from '../../components/showroom/PhoneShowroom';
import { AdSpot } from '../../components/ads/AdSpot';
import { InventoryService } from '../../services/inventory-service';
import type { InventoryRecord } from '../../services/inventory-service';

export const ShowroomScreen = memo(function ShowroomScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const [devices, setDevices] = useState<InventoryRecord[]>([]);

  useEffect(() => {
    setDevices(InventoryService.getExchangeableDevices());
  }, []);

  return (
    <Screen ariaLabel="Used phones showroom" bottomPad="6rem">
      <Stack gap="lg">
        <Card variant="glass" padding="lg" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.6rem', marginBottom: '0.5rem' }}>🏬</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
            {t('showroom.title')}
          </h1>
          <p style={{ fontSize: '0.82rem', margin: '0.3rem 0 0', opacity: 0.7 }}>
            {t('showroom.subtitle')}
          </p>
        </Card>

        <AdSpot placement="phone-details" />

        <Grid columns={1} gap="md">
          <PhoneShowroom
            devices={devices}
            emptyText={t('showroom.empty')}
          />
        </Grid>

        <Button variant="ghost" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} fullWidth>
          {t('showroom.back')}
        </Button>
      </Stack>
    </Screen>
  );
});
