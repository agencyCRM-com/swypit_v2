import { z } from "zod";

export const ghlOauthInstallSchema = z.object({
  locationId: z.string().min(1),
});

export const tilledConfigSchema = z.object({
  locationId: z.string().min(1),
  tilled_test_secret_key: z.string().min(1),
  tilled_live_secret_key: z.string().min(1),
  tilled_merchant_account_id: z.string().min(1),
  tilled_publishable_key: z.string().optional().default(""),
  tilled_webhook_secret: z.string().optional().default(""),
  mode: z.enum(["test", "live"]),
  verify: z.boolean().optional().default(false),
});

export const paymentMethodSchema = z.object({
  id: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  type: z.string().default("card"),
});

export const chargeRequestSchema = z.object({
  locationId: z.string().min(1),
  orderId: z.string().min(1),
  transactionId: z.string().min(1).optional(),
  action: z.enum(["capture", "authorize"]).default("capture"),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  description: z.string().min(1),
  customerId: z.string().min(1),
  paymentMethod: paymentMethodSchema.optional(),
  paymentToken: z.string().min(1).optional(),
});

export const refundRequestSchema = z.object({
  locationId: z.string().min(1),
  orderId: z.string().min(1).optional(),
  transactionId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
});

export const verifyRequestSchema = z.object({
  locationId: z.string().min(1),
  providerId: z.string().optional(),
  action: z.literal("verify").optional(),
});

export const ghlQuerySchema = z.object({
  type: z.string().optional(),
  action: z.string().optional(),
  locationId: z.string().optional(),
  transactionId: z.string().optional(),
  orderId: z.string().optional(),
  apiKey: z.string().optional(),
  paymentMethodId: z.string().optional(),
  chargeId: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  chargeDescription: z.string().optional(),
  contactId: z.string().optional(),
  subscriptionId: z.string().optional(),
});

export type TilledConfigInput = z.infer<typeof tilledConfigSchema>;
export type ChargeRequest = z.infer<typeof chargeRequestSchema>;
export type RefundRequest = z.infer<typeof refundRequestSchema>;
