export type IconName = 'check-circle' | 'x-circle' | 'alert-triangle' | 'loader-arc' | 'circle-dashed' | 'info' | 'chevron-down' | 'arrow-back'
  | 'home' | 'activity' | 'sliders' | 'sidebar' | 'menu';
const paths: Record<IconName, React.ReactNode> = {
  'check-circle': <><circle cx="10" cy="10" r="8" /><path d="m6 10 3 3 5-6" /></>,
  'x-circle': <><circle cx="10" cy="10" r="8" /><path d="m7 7 6 6m0-6-6 6" /></>,
  'alert-triangle': <><path d="M10 2 19 18H1Z" /><path d="M10 7v5m0 3v.5" /></>,
  'loader-arc': <path d="M18 10a8 8 0 1 1-8-8" />,
  'circle-dashed': <circle cx="10" cy="10" r="8" strokeDasharray="2 3" />,
  info: <><circle cx="10" cy="10" r="8" /><path d="M10 9v6m0-10v.5" /></>,
  'chevron-down': <path d="m5 7 5 5 5-5" />,
  'arrow-back': <path d="m9 4-6 6 6 6M3 10h14" />,
  home: <><path d="M3 9.5 10 3.5l7 6" /><path d="M5 8.25V16.5h10V8.25" /><path d="M8.5 16.5v-4h3v4" /></>,
  activity: <path d="M2.5 10.5h3l2.25-5.5 4.5 10 2.25-4.5h3" />,
  sliders: <><path d="M3.5 6h7.25m4 0h1.75M3.5 14h1.75m4 0h7.25" /><circle cx="12.75" cy="6" r="2" /><circle cx="7.25" cy="14" r="2" /></>,
  sidebar: <><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12" /></>,
  menu: <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />,
};
// Directional glyphs mirror in RTL (UI-SPEC RTL rule 7); a vertically symmetric glyph mirrors by rotating 180deg.
const directional = new Set<IconName>(['arrow-back', 'sidebar']);
export function Icon({ name }: { name: IconName }) {
  return <svg className={`icon ${directional.has(name) ? 'rtl:rotate-180' : name === 'loader-arc' ? 'spinner' : name === 'chevron-down' ? 'chevron' : ''}`} width="20" height="20" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none" aria-hidden="true">{paths[name]}</svg>;
}

export type CaptionGlyph = 'minimize' | 'maximize' | 'restore' | 'close';
const captionPaths: Record<CaptionGlyph, React.ReactNode> = {
  minimize: <path d="M0 5.5h10" />,
  maximize: <rect x="0.5" y="0.5" width="9" height="9" rx="1" />,
  restore: <><rect x="0.5" y="2.5" width="7" height="7" rx="1" /><path d="M2.5 2.5v-1a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" /></>,
  close: <path d="m0.5 0.5 9 9m0-9-9 9" />,
};
/** Window-control glyphs: 10px on the pixel grid with a 1px stroke, the proportions of native caption buttons. */
export function CaptionIcon({ glyph }: { glyph: CaptionGlyph }) {
  return <svg className="caption-icon" width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1" fill="none" shapeRendering={glyph === 'close' ? 'geometricPrecision' : 'crispEdges'} aria-hidden="true">{captionPaths[glyph]}</svg>;
}

export function BrandMark() {
  return <svg className="brand-mark" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <rect width="20" height="20" rx="5" className="brand-mark-tile" />
    <path d="M10 6.75c-1.5-1.1-3.25-1.4-5.25-.9v8.4c2-.5 3.75-.2 5.25.9 1.5-1.1 3.25-1.4 5.25-.9v-8.4c-2-.5-3.75-.2-5.25.9Zm0 0v8.4" className="brand-mark-glyph" fill="none" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>;
}
