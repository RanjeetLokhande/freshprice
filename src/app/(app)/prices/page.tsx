import { Suspense } from 'react';
import { PricesScreen } from '@/components/prices/prices-screen';

export default function PricesPage() {
  return (
    <Suspense>
      <PricesScreen />
    </Suspense>
  );
}
