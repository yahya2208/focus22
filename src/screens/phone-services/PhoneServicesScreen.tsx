import { memo } from 'react';
import { CustomerPhoneFlow } from './CustomerPhoneFlow';
import { Container } from '../../design-system/components/Container';

export const PhoneServicesScreen = memo(function PhoneServicesScreen() {
  return (
    <Container maxWidth="600px" padding="1rem">
      <CustomerPhoneFlow />
    </Container>
  );
});
