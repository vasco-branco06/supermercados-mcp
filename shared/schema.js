import { z } from 'zod';

export const STORES = ['continente', 'pingo-doce', 'auchan'];
export const UNITS = ['kg', 'l', 'un'];

const money = z.number().finite().positive();

// Common product shape returned by the three supermarket servers.
// Unknown values are null, never guessed.
export const ProductSchema = z
  .object({
    store: z.enum(STORES),
    product_id: z.string().min(1),
    name: z.string().min(3),
    brand: z.string().min(1).nullable(),
    price: money,
    currency: z.literal('EUR'),
    size: z.string().min(1).nullable(),
    unit_price: money.nullable(),
    unit: z.enum(UNITS).nullable(),
    promo: z.object({ label: z.string().min(1), original_price: money.nullable() }).strict().nullable(),
    minimum: z.string().min(1).nullable(),
    available: z.boolean().nullable(),
    url: z.url(),
    fetched_at: z.iso.datetime(),
  })
  .strict()
  .refine((p) => (p.unit_price === null) === (p.unit === null), {
    message: 'unit_price and unit must both be set or both be null',
    path: ['unit'],
  });

export const ProductListSchema = z.array(ProductSchema);
