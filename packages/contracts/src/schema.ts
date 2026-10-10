import { z } from 'zod';

// Apply before any schema is constructed, regardless of entry-point import order.
// Zod's optional code-generation probe otherwise violates the renderer's CSP.
z.config({ jitless: true });

export { z };
