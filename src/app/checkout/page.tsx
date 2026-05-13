import { CheckoutClient } from "@/app/checkout/CheckoutClient";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    embedded?: string;
    debug?: string;
    amount?: string;
    currency?: string;
    description?: string;
    order?: string;
    locationId?: string;
    contact?: string;
    transactionId?: string;
    paymentMethodId?: string;
    paymentToken?: string;
  }>;
}) {
  const params = await searchParams;
  const showDebugFields = params.debug === "1" || params.embedded !== "agencycrm";

  return (
    <CheckoutClient
      initialEmbedded={params.embedded === "agencycrm"}
      initialPaymentProps={{
        amount: Number(params.amount ?? "0"),
        currency: params.currency ?? "USD",
        description: params.description ?? "Swypit checkout",
        orderId: params.order ?? "",
        locationId: params.locationId ?? "",
        customerId: params.contact ?? "",
        transactionId: params.transactionId ?? undefined,
      }}
      initialPaymentMethodId={params.paymentMethodId}
      initialPaymentToken={params.paymentToken}
      showDebugFields={showDebugFields}
    />
  );
}
