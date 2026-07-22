import confetti from "canvas-confetti";

// Shared PR celebration burst — used both for the person who just logged the PR
// (new-workout-form.tsx) and for crew members watching it arrive live in the feed
// (workout-feed.tsx), so the effect stays identical either way.
export function celebratePr() {
  confetti({
    particleCount: 120,
    spread: 70,
    origin: { y: 0.6 },
    colors: ["#004225", "#C97C2E", "#FAF7F2"],
  });
}
