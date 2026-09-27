import { Card, PageTitle } from './ui';

/** Placeholder for screens scheduled in later build phases. */
export function ComingSoon({ title, phase, children }: { title: string; phase: number; children?: React.ReactNode }) {
  return (
    <>
      <PageTitle title={title} />
      <Card>
        <p className="text-sm text-muted">This screen arrives in build phase {phase}.</p>
        {children}
      </Card>
    </>
  );
}
