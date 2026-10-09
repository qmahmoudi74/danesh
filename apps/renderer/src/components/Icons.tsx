export type IconName = 'check-circle' | 'x-circle' | 'alert-triangle' | 'loader-arc' | 'circle-dashed' | 'info' | 'chevron-down' | 'arrow-back';
const paths: Record<IconName, React.ReactNode> = {
  'check-circle': <><circle cx="10" cy="10" r="8" /><path d="m6 10 3 3 5-6" /></>,
  'x-circle': <><circle cx="10" cy="10" r="8" /><path d="m7 7 6 6m0-6-6 6" /></>,
  'alert-triangle': <><path d="M10 2 19 18H1Z" /><path d="M10 7v5m0 3v.5" /></>,
  'loader-arc': <path d="M18 10a8 8 0 1 1-8-8" />,
  'circle-dashed': <circle cx="10" cy="10" r="8" strokeDasharray="2 3" />,
  info: <><circle cx="10" cy="10" r="8" /><path d="M10 9v6m0-10v.5" /></>,
  'chevron-down': <path d="m5 7 5 5 5-5" />,
  'arrow-back': <path d="m9 4-6 6 6 6M3 10h14" />,
};
export function Icon({ name }: { name: IconName }) {
  return <svg className={`icon ${name === 'arrow-back' ? 'rtl:rotate-180' : name === 'loader-arc' ? 'spinner' : name === 'chevron-down' ? 'chevron' : ''}`} width="20" height="20" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none" aria-hidden="true">{paths[name]}</svg>;
}
