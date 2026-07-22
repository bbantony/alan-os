// App Router shows this instantly on any navigation within the app shell
// (bottom nav taps, "New workout", saving and returning to a feed, etc.)
// while the destination page's data is being fetched, and swaps it out the
// moment that page is ready — no extra JS, no router-event wiring, just the
// framework's built-in navigation Suspense boundary. This is what actually
// fixes "I can't tell if I clicked or not": every tap that triggers a page
// change now gets an immediate, visible response instead of a silent wait.
export default function Loading() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden" aria-hidden>
      <div className="route-progress-bar h-full w-1/3 rounded-full bg-primary" />
    </div>
  );
}
