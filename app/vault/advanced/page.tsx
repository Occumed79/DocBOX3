import AdvancedVisualLab from '@/components/data-studio/AdvancedVisualLab';

export default function AdvancedVisualLabPage() {
  return (
    <>
      <AdvancedVisualLab />
      <div className="av-mode-links">
        <a href="/vault/spatial">Spatial Lab</a>
        <a href="/vault/story">Storytelling Studio</a>
        <a href="/vault/advanced/cyber">Cyberwave preview</a>
      </div>
    </>
  );
}
