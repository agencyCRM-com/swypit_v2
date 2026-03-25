import { TilledConfigForm } from "@/app/ghl/config/tilled/TilledConfigForm";

export default async function TilledConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const params = await searchParams;

  return <TilledConfigForm initialLocationId={params.locationId ?? ""} />;
}
