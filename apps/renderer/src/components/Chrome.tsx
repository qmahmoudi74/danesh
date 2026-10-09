import type { WindowAction, WindowState } from '@danesh/contracts/shell.ts';
import { useRef } from 'react';
import { Button, Tooltip, TooltipTrigger } from 'react-aria-components';
import { platform } from '../lib/theme.ts';
import { BrandMark, type CaptionGlyph, CaptionIcon, Icon } from './Icons.tsx';

const act = (action: WindowAction) => {
  void window.danesh.call('shell.window', { action }).catch(() => undefined);
};

/** Title-bar tooltips open below their control; sidebar tooltips open toward the content (inline-end). */
export function ChromeTooltip({
  children,
  placement = 'bottom',
}: {
  children: string;
  placement?: 'bottom' | 'end';
}) {
  return (
    <Tooltip className="tooltip" placement={placement} offset={8}>
      {children}
    </Tooltip>
  );
}

function CaptionButton({
  label,
  glyph,
  action,
  close = false,
}: {
  label: string;
  glyph: CaptionGlyph;
  action: WindowAction;
  close?: boolean;
}) {
  return (
    <TooltipTrigger delay={500} closeDelay={0}>
      <Button
        className={`caption-button ${close ? 'close' : ''}`}
        aria-label={label}
        excludeFromTabOrder
        onPress={() => act(action)}
      >
        <CaptionIcon glyph={glyph} />
      </Button>
      <ChromeTooltip>{label}</ChromeTooltip>
    </TooltipTrigger>
  );
}

/** The native application menu, popped up under the button (Windows/Linux have no menu bar in a frameless window). */
function MenuButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const open = () => {
    const rect = ref.current?.getBoundingClientRect();
    const bar = ref.current?.closest('header')?.getBoundingClientRect();
    if (!rect || !bar) return;
    // Opens flush with the title bar's lower edge, aligned to the button.
    void window.danesh
      .call('shell.showAppMenu', {
        x: Math.max(0, Math.round(rect.left)),
        y: Math.round(bar.bottom),
      })
      .catch(() => undefined);
  };
  return (
    <TooltipTrigger delay={500} closeDelay={0}>
      <Button ref={ref} className="chrome-button" aria-label="منو" onPress={open}>
        <Icon name="menu" />
      </Button>
      <ChromeTooltip>منو</ChromeTooltip>
    </TooltipTrigger>
  );
}

export function TitleBar({ screen, state }: { screen: string; state: WindowState | undefined }) {
  const maximized = state?.maximized ?? false;
  return (
    <header className="title-bar" data-platform={platform}>
      <div className="title-brand">
        <span className="title-mark">
          <BrandMark />
        </span>
        <span className="label">دانش</span>
        <span className="title-divider" aria-hidden="true" />
        <span className="caption title-screen">{screen}</span>
      </div>
      <div className="title-drag" />
      {platform === 'mac' ? (
        <div className="traffic-lights" aria-hidden="true" />
      ) : (
        <div className="title-actions">
          <MenuButton />
          <div className="window-controls">
            <CaptionButton label="کوچک کردن" glyph="minimize" action="minimize" />
            <CaptionButton
              label={maximized ? 'بازگرداندن' : 'بزرگ کردن'}
              glyph={maximized ? 'restore' : 'maximize'}
              action="toggleMaximize"
            />
            <CaptionButton label="بستن" glyph="close" action="close" close />
          </div>
        </div>
      )}
    </header>
  );
}
