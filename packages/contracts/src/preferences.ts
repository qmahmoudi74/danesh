import { z } from './schema.ts';

// Shell-only UI preferences. Main reads them synchronously before the first window exists, so they live in a small
// JSON file next to the database rather than in it (Main never opens the database).
export const ThemePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;
const coordinate = z.number().int().min(-100_000).max(100_000);
const extent = z.number().int().min(100).max(20_000);
export const WindowBoundsSchema = z.strictObject({ x: coordinate, y: coordinate, width: extent, height: extent, maximized: z.boolean() });
export type WindowBounds = z.infer<typeof WindowBoundsSchema>;
// theme is absent until the user chooses one: a fresh install follows the operating system and writes no preference.
export const UiPreferencesSchema = z.strictObject({ version: z.literal(1), theme: ThemePreferenceSchema.optional(), window: WindowBoundsSchema.optional() });
export type UiPreferences = z.infer<typeof UiPreferencesSchema>;
export const MAX_PREFERENCES_BYTES = 4096;
export const defaultUiPreferences = (): UiPreferences => ({ version: 1 });
export const effectiveTheme = (preferences: UiPreferences): ThemePreference => preferences.theme ?? 'system';

/** Never throws: a corrupt, oversized or partly invalid file keeps whatever fields are still valid. */
export function parseUiPreferences(text: string | undefined): UiPreferences {
  const fallback = defaultUiPreferences();
  if (!text || new TextEncoder().encode(text).byteLength > MAX_PREFERENCES_BYTES) return fallback;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return fallback; }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  const theme = ThemePreferenceSchema.safeParse(record.theme);
  const window = WindowBoundsSchema.safeParse(record.window);
  return { version: 1, ...(theme.success ? { theme: theme.data } : {}), ...(window.success ? { window: window.data } : {}) };
}
