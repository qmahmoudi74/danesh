import { useState } from 'react';
import { Heading, Label, Radio, RadioGroup, Text } from 'react-aria-components';
import type { ThemePreference } from '@danesh/contracts/preferences.ts';
import { AppShell } from '../components/Layout.tsx';
import { chooseTheme, useThemePreference } from '../lib/theme.ts';

const options: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'system', label: 'هماهنگ با سیستم', description: 'با حالت روشن یا تیرهٔ سیستم‌عامل عوض می‌شود.' },
  { value: 'light', label: 'روشن', description: 'زمینهٔ روشن، مناسب محیط پرنور.' },
  { value: 'dark', label: 'تیره', description: 'زمینهٔ تیره، مناسب نور کم.' },
];

function ThemePreview({ value }: { value: ThemePreference }) {
  const mini = (tone: 'light' | 'dark') => <span className={`preview-window ${tone}`}><span className="preview-title" /><span className="preview-body"><span className="preview-side" /><span className="preview-page"><span className="preview-line wide" /><span className="preview-line" /><span className="preview-accent" /></span></span></span>;
  return <span className="theme-preview" aria-hidden="true">{value === 'system' ? <><span className="preview-half">{mini('light')}</span><span className="preview-half end">{mini('dark')}</span></> : mini(value)}</span>;
}

export function Settings() {
  const current = useThemePreference();
  const [pending, setPending] = useState<ThemePreference>();
  const [failed, setFailed] = useState(false);
  const selected = pending ?? current?.theme;
  const choose = (value: string) => {
    const theme = options.find((option) => option.value === value)?.value;
    if (!theme || theme === selected) return;
    setPending(theme); setFailed(false);
    void chooseTheme(theme).catch(() => setFailed(true)).finally(() => setPending(undefined));
  };
  return <AppShell>
    <Heading level={1} tabIndex={-1} className="heading">تنظیمات</Heading>
    <section className="settings-section" aria-labelledby="appearance-heading">
      <Heading level={2} id="appearance-heading" className="label section-title">ظاهر</Heading>
      <RadioGroup className="theme-group" value={selected ?? null} onChange={choose} isDisabled={!selected}>
        <Label className="label">پوسته</Label>
        <div className="theme-options">
          {options.map((option) => <Radio key={option.value} value={option.value} className="theme-option">
            <ThemePreview value={option.value} />
            <span className="theme-option-text"><span className="radio-mark" aria-hidden="true" /><span className="label">{option.label}</span></span>
            <span className="caption">{option.description}</span>
          </Radio>)}
        </div>
        {failed && <Text slot="errorMessage" className="caption field-error">پوسته تغییر نکرد. دوباره تلاش کنید.</Text>}
      </RadioGroup>
    </section>
  </AppShell>;
}
