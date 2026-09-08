import DataStudioPro from '@/components/data-studio/DataStudioPro';

export default function VaultPage() {
  return (
    <>
      <DataStudioPro />
      <div className="av-mode-links">
        <a href="/vault/grid">Grid & Pivot Lab</a>
        <a href="/vault/advanced">Advanced Visual Lab</a>
      </div>
    </>
  );
}
