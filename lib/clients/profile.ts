import { z } from "zod";
export const ClientProfileInput = z.object({
  clientId: z.string().min(1).max(150), note: z.string().trim().max(4000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10)
    .transform(tags => [...new Map(tags.map(tag => [tag.toLocaleLowerCase("en-US"), tag])).values()]),
  version: z.number().int().min(0).max(2147483646),
});
