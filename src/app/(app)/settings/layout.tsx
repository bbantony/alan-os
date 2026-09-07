import { getCurrentProfile } from "@/lib/supabase/profile";
import { getVisibleSettingsLinks } from "./settings-links";
import { SettingsNav } from "./settings-nav";

// Desktop gets a persistent sidebar (every settings sub-page benefits, not
// just the index) — mobile keeps exactly its existing full-page index as
// the only navigation, since there's no room for a permanent side rail.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  const { accountLinks, moduleLinks, adminLink } = getVisibleSettingsLinks(profile);

  // Below md, this wrapper carries no classes at all — every child page keeps
  // its own existing "mx-auto max-w-lg px-4 py-8" exactly as before, so mobile
  // is completely unchanged. At md+, it becomes the two-column shell; the
  // child's own inner padding just adds a little extra breathing room next
  // to the sidebar rather than needing every sub-page's markup touched.
  //
  // "AT md+" IS NO LONGER ENOUGH (7 Sep 2026). Since the assistant dock takes a
  // column off the right of a wide screen, a window past 768px no longer means
  // a page past 768px: on the Fold's unfolded inner display this area is about
  // 377px, and a 224px rail plus a 40px gap left EIGHTY-ONE PIXELS for the
  // settings page itself. So the two-column shell now needs both — a window
  // that is wide (`md:`, unchanged) AND an actual page that is wide (the
  // container query, measured on the wrapper below). Every width that exists
  // today satisfies both or neither, so nothing on a phone, a tablet or a
  // desktop moves; the only new answer is the new case, where the rail folds
  // away and settings goes back to its phone layout — index page, back link
  // and all — in the space it really has.
  //
  // 32rem: the narrowest this area has ever legitimately been is 544px (a
  // 768px window minus the app's side rail), and it must stay two-column
  // there.
  return (
    <div className="@container/settings">
      <div className="md:@lg/settings:mx-auto md:@lg/settings:flex md:@lg/settings:max-w-4xl md:@lg/settings:items-start md:@lg/settings:gap-10 md:@lg/settings:px-4 md:@lg/settings:pt-8">
        <SettingsNav
          accountLinks={accountLinks}
          moduleLinks={moduleLinks}
          adminLink={adminLink}
          className="hidden md:@lg/settings:sticky md:@lg/settings:top-8 md:@lg/settings:block md:@lg/settings:w-56 md:@lg/settings:shrink-0"
        />
        <div className="min-w-0 md:@lg/settings:flex-1">{children}</div>
      </div>
    </div>
  );
}
