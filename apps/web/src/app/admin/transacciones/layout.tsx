import { SectionTabs } from './section-tabs';

export default function TransaccionesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <SectionTabs />
      {children}
    </div>
  );
}
