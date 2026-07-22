// Shared order option constants — imported by both the checkout UI (client) and
// the order API (server) so the two validate against identical lists. Keep this
// module free of "use client" and server-only imports.

export const TIME_SLOTS = [
  "Morning · 9am–12pm",
  "Afternoon · 12pm–4pm",
  "Evening · 4pm–8pm",
] as const;

export type PaymentMethod = "WHISH_MONEY" | "CASH_ON_DELIVERY";
// TODO: add "CARD" once Stripe (or another card processor) is integrated.

export const PAYMENT_METHODS: {
  value: PaymentMethod;
  label: string;
  hint: string;
}[] = [
  {
    value: "WHISH_MONEY",
    label: "Whish Money",
    hint: "Send via Whish; we confirm your order once it lands.",
  },
  {
    value: "CASH_ON_DELIVERY",
    label: "Cash on Delivery",
    hint: "Pay the courier in cash when your bouquet arrives.",
  },
];

export const PAYMENT_METHOD_VALUES: PaymentMethod[] = PAYMENT_METHODS.map(
  (method) => method.value,
);
