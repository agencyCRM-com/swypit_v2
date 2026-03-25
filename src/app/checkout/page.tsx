import { CheckoutClient } from "@/app/checkout/CheckoutClient";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    embedded?: string;
    amount?: string;
    currency?: string;
    description?: string;
    order?: string;
    locationId?: string;
    contact?: string;
    transactionId?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <CheckoutClient
      initialEmbedded={params.embedded === "ghl"}
      initialPaymentProps={{
        amount: Number(params.amount ?? "0"),
        currency: params.currency ?? "USD",
        description: params.description ?? "Swypit checkout",
        orderId: params.order ?? "",
        locationId: params.locationId ?? "",
        customerId: params.contact ?? "",
        transactionId: params.transactionId ?? undefined,
      }}
    />
  );
}
