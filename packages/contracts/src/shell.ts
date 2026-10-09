import { z } from './schema.ts';
import type { RpcMethod } from './rpc.ts';
import { ThemePreferenceSchema } from './preferences.ts';

export const ChooseExportOutputSchema = z.strictObject({ token: z.string().uuid().nullable() });
export const WindowActionSchema = z.enum(['minimize', 'toggleMaximize', 'close']);
export type WindowAction = z.infer<typeof WindowActionSchema>;
export const WindowStateSchema = z.strictObject({ maximized: z.boolean(), fullscreen: z.boolean(), focused: z.boolean() });
export type WindowState = z.infer<typeof WindowStateSchema>;
export const ThemeStateSchema = z.strictObject({ theme: ThemePreferenceSchema, dark: z.boolean() });
export type ThemeState = z.infer<typeof ThemeStateSchema>;
export const RouteSchema = z.enum(['#/', '#/system-check', '#/settings']);
export type Route = z.infer<typeof RouteSchema>;

export const shellMethods: Record<string, RpcMethod> = {
  'shell.chooseExportPath': { input: z.strictObject({}), output: ChooseExportOutputSchema, maxInputBytes: 128 },
  'shell.window': { input: z.strictObject({ action: WindowActionSchema }), output: z.strictObject({}), maxInputBytes: 128 },
  'shell.windowState': { input: z.strictObject({}), output: WindowStateSchema, maxInputBytes: 128 },
  'shell.getTheme': { input: z.strictObject({}), output: ThemeStateSchema, maxInputBytes: 128 },
  'shell.setTheme': { input: z.strictObject({ theme: ThemePreferenceSchema }), output: ThemeStateSchema, maxInputBytes: 128 },
  // Headless smoke mode only (--smoke-test): the renderer reports the overall result of the run Main asked for.
  'shell.smokeDone': { input: z.strictObject({ overall: z.enum(['pass', 'fail']) }), output: z.strictObject({}), maxInputBytes: 128 },
};
export const shellEventPayloads: Record<string, z.ZodType> = {
  'shell.navigate': z.strictObject({ route: RouteSchema }),
  'shell.coreState': z.strictObject({ state: z.enum(['starting', 'ready', 'unreachable']) }),
  'shell.windowState': WindowStateSchema,
  'shell.theme': ThemeStateSchema,
  'shell.smokeRun': z.strictObject({ token: z.string().uuid() }),
};
