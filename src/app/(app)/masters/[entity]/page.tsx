import { MasterScreen } from '@/components/master/master-screen';

export default async function MasterPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <MasterScreen entity={entity} />;
}
