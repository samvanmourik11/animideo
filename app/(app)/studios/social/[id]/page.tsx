import ContentKalender from "@/components/social/ContentKalender";

export const metadata = { title: "Contentkalender · Animideo" };

export default async function KalenderPagina({ params }: { params: Promise<{ id: string }> }) {
  return <ContentKalender id={(await params).id} />;
}
