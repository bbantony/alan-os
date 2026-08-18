import { redirect } from "next/navigation";

// Tasks merged into Plan. Kept as a redirect rather than deleted: this URL is
// in Alan's history, likely bookmarked, and is the target of `?new=1` links in
// any page still cached on a device by the service worker.
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: isNew } = await searchParams;
  redirect(isNew === "1" ? "/plan?new=1" : "/plan");
}
