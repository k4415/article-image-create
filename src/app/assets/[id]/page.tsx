import { AssetDetailClient } from "./AssetDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AssetDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <AssetDetailClient id={id} />;
}
