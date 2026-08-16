import { getMoreLinks } from "@/components/nav/nav-items";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { NO_MODULES_ACCESS } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelRow } from "@/components/ui/panel";
import { Micro } from "@/components/ui/tag";

// Phone-only overflow menu — the desktop rail lists these directly, so nobody
// on a wide screen ever lands here.
export default async function MorePage() {
  const profile = await getCurrentProfile();
  const links = getMoreLinks(profile?.moduleAccess ?? NO_MODULES_ACCESS);

  return (
    <div>
      <PageHeader eyebrow="Alan OS" title="More" />

      <div className="mx-auto max-w-2xl px-4 py-4 md:px-6 md:py-6">
        <Panel>
          {links.map((item, i) => {
            const Icon = item.icon;
            return (
              <PanelRow key={item.href} href={item.href} last={i === links.length - 1}>
                <span className="flex items-center gap-3">
                  <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                  <span className="text-sm font-semibold">{item.label}</span>
                </span>
              </PanelRow>
            );
          })}
        </Panel>

        <p className="mt-4 px-1">
          <Micro>Journal &amp; vinyl arrive in phase 6</Micro>
        </p>
      </div>
    </div>
  );
}
