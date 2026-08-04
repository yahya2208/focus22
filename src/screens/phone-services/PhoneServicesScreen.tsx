import { memo } from 'react';
import { CustomerPhoneFlow } from './CustomerPhoneFlow';
import { Container } from '../../design-system/components/Container';
import { AdSpot } from '../../components/ads/AdSpot';

export const PhoneServicesScreen = memo(function PhoneServicesScreen() {
  return (
    <Container maxWidth="600px" padding="1rem">
      <AdSpot placement="phones" />
      <CustomerPhoneFlow />
    </Container>
  );
});
