import Link from "next/link";
import { getMoreLinks } from "@/components/nav/nav-items";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { NO_MODULES_ACCESS } from "@/lib/permissions";

export default async function MorePage() {
  const profile = await getCurrentProfile();
  const links = getMoreLinks(profile?.moduleAccess ?? NO_MODULES_ACCESS);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-semibold">More</h1>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted"
              >
                <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
