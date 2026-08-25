import { z } from "zod";

export const RegistryEventIdSchema = z.string().regex(/^evt_[0-9a-f]{32}$/);
export type RegistryEventId = z.infer<typeof RegistryEventIdSchema>;
