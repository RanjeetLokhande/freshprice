import { Suspense } from 'react';
import { CalculateScreen } from '@/components/calc/calculate-screen';

export default function CalculatePage() {
  return (
    <Suspense>
      <CalculateScreen />
    </Suspense>
  );
}
