import UnifiedAdvancedLab from '@/components/data-studio/UnifiedAdvancedLab';

export default function AdvancedVisualLabPage() {
  return (
    <>
      <UnifiedAdvancedLab />
      <div className="av-mode-links">
        <a href="/vault/grid">Grid & Pivot Lab</a>
        <a href="/vault/spatial">Spatial Lab</a>
        <a href="/vault/story">Story Studio</a>
        <a href="/vault/advanced/cyber">Cyberwave preview</a>
      </div>
    </>
  );
}
