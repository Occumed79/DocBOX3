export function FolderIcon({ color }: { color: string }) {
  return (
    <svg aria-hidden="true" width="15" height="14" viewBox="0 0 20 16" fill="none">
      <path d="M2 3C2 1.9 2.9 1 4 1H7.586a1 1 0 0 1 .707.293L9.414 2.4A1 1 0 0 0 10.121 2.7H16C17.1 2.7 18 3.6 18 4.7V13C18 14.1 17.1 15 16 15H4C2.9 15 2 14.1 2 13V3Z" fill={color} fillOpacity="0.35" stroke={color} strokeWidth="1.25" strokeOpacity="0.95" />
    </svg>
  );
}

export function UploadIcon() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></svg>;
}

export function ArchiveIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M5 6v14h14V6" /><path d="M9 10h6" /><path d="M4 3h16v3H4z" /></svg>;
}

export function FilesIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h6l2 3h8v13H4z" /></svg>;
}

export function PlusIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}

export function CloseIcon() {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
