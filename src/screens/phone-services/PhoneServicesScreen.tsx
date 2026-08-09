import { memo } from 'react';
import { CustomerPhoneFlow } from './CustomerPhoneFlow';
import { Container } from '../../design-system/components/Container';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';

export const PhoneServicesScreen = memo(function PhoneServicesScreen() {
  return (
    <Container maxWidth="600px" padding="1rem">
      <AdContactBanner placement="phones" />
      <CustomerPhoneFlow />
    </Container>
  );
});
