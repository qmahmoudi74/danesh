import { useState } from 'react';
import { Button, Link, TooltipTrigger } from 'react-aria-components';
import type { Route } from '@danesh/contracts/shell.ts';
import { Icon, type IconName } from './Icons.tsx';
import { ChromeTooltip } from './Chrome.tsx';
import { useNarrowWindow } from '../lib/theme.ts';

const STORAGE_KEY = 'danesh.sidebar.collapsed';
// Sidebar collapse is a per-view convenience; storage can be unavailable, so it never blocks rendering.
function readCollapsed(): boolean { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; } }
function writeCollapsed(value: boolean): void { try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* per-view convenience only */ } }

export type Destination = { route: Route; label: string; icon: IconName };
export const destinations: Destination[] = [
  { route: '#/', label: 'خانه', icon: 'home' },
  { route: '#/system-check', label: 'بررسی سامانه', icon: 'activity' },
];
export const settingsDestination: Destination = { route: '#/settings', label: 'تنظیمات', icon: 'sliders' };

function NavItem({ destination, current, rail }: { destination: Destination; current: boolean; rail: boolean }) {
  const link = <Link className="nav-link" aria-current={current ? 'page' : undefined} onPress={() => { location.hash = destination.route.slice(1); }}>
    <span className="nav-icon"><Icon name={destination.icon} /></span><span className="nav-label">{destination.label}</span>
  </Link>;
  return rail ? <TooltipTrigger delay={300} closeDelay={0}>{link}<ChromeTooltip>{destination.label}</ChromeTooltip></TooltipTrigger> : link;
}

export function Sidebar({ route }: { route: Route }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const narrow = useNarrowWindow();
  const rail = collapsed || narrow;
  const toggleLabel = collapsed ? 'باز کردن نوار کناری' : 'جمع کردن نوار کناری';
  const toggle = <Button className="nav-link nav-toggle" aria-label={toggleLabel} aria-expanded={!collapsed} onPress={() => { setCollapsed(!collapsed); writeCollapsed(!collapsed); }}>
    <span className="nav-icon"><Icon name="sidebar" /></span><span className="nav-label">{collapsed ? 'باز کردن' : 'جمع کردن'}</span>
  </Button>;
  return <nav className="sidebar" aria-label="بخش‌های برنامه" data-rail={rail || undefined}>
    <div className="nav-group">{destinations.map((destination) => <NavItem key={destination.route} destination={destination} current={route === destination.route} rail={rail} />)}</div>
    <div className="nav-group nav-footer">
      <NavItem destination={settingsDestination} current={route === settingsDestination.route} rail={rail} />
      {!narrow && (rail ? <TooltipTrigger delay={300} closeDelay={0}>{toggle}<ChromeTooltip>{toggleLabel}</ChromeTooltip></TooltipTrigger> : toggle)}
    </div>
  </nav>;
}
