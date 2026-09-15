/**
 * Dictation, using the browser's own speech recognition.
 *
 * WHY THIS EXISTS. Alan asked to "talk/write to it directly", and asked
 * whether the Gemini app on his Android phone could be connected to Alan OS.
 * It cannot — Google's assistant reaches its own services and a handful of
 * commercial partners, and there is no way to register a personal web app with
 * it. But the thing he was actually asking for is dictation into the assistant
 * that is already here, and every Chromium browser has that built in.
 *
 * NO DEPENDENCY, and no audio leaves the device via this app: recognition is
 * the browser's own, handled by the platform. On Android Chrome — which is
 * what he uses — it works well. On iOS Safari it is absent, so the button
 * simply does not render rather than appearing and failing.
 */

// The API is still vendor-prefixed and is not in the DOM typings, so the
// minimum shape used here is declared rather than pulling in a global dts.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function ctor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** False on iOS Safari and anywhere else without it. Check before rendering. */
export function speechSupported(): boolean {
  return ctor() !== null;
}

export interface Dictation {
  stop: () => void;
}

/**
 * Turns the browser's result list into one transcript, rebuilt from scratch
 * on every event. Pure, so it can be tested without a microphone.
 *
 * WHY IT REBUILDS INSTEAD OF APPENDING. The first version kept a running
 * `finalText` across events and, on each event, appended every final result
 * from `event.resultIndex` onwards. That relies on `resultIndex` pointing at
 * the first result not seen before. When it doesn't — reported for Android
 * Chrome with `continuous` on, where it can stay at 0 — results already added
 * are added again, which fits what Alan reported: "it repeats each word twice."
 * Every event carries the whole list, so reading it from index 0 each time and
 * keeping nothing between events means a re-delivered result is only ever
 * counted once.
 *
 * It deliberately does NOT try to merge results that look alike. A draft of
 * this fix did ("buy milk" followed by "buy milk and eggs" became one phrase),
 * and that silently threw away words someone had really said twice. If Android
 * turns out to send some other duplicated shape, capture a real event list from
 * the phone before adding a rule for it.
 *
 * Pieces are trimmed and joined with one space, so a result that arrives with
 * or without a leading space reads the same.
 */
export function buildTranscript(results: SpeechRecognitionEventLike["results"]): {
  text: string;
  isFinal: boolean;
} {
  const parts: string[] = [];
  let isFinal = true;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result.isFinal) isFinal = false;
    const chunk = (result[0]?.transcript ?? "").replace(/\s+/g, " ").trim();
    if (chunk) parts.push(chunk);
  }
  return { text: parts.join(" "), isFinal };
}

/**
 * Starts listening. `onText` receives the transcript so far — interim results
 * included, so the words appear as they are said rather than in one lump at
 * the end, which is the difference between feeling responsive and feeling
 * broken. `onDone` fires when the browser stops, for any reason.
 */
export function startDictation(opts: {
  lang?: string;
  onText: (text: string, isFinal: boolean) => void;
  onDone: (error?: string) => void;
}): Dictation | null {
  const Ctor = ctor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = opts.lang ?? "en-CA";
  // Continuous, because a sentence like "log bench press 135 for 8, three
  // sets" has natural pauses in it that would otherwise end the session early.
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    const { text, isFinal } = buildTranscript(event.results);
    opts.onText(text, isFinal);
  };

  recognition.onerror = (event) => {
    // "aborted" and "no-speech" are ordinary endings, not failures worth
    // showing anyone.
    const code = event.error;
    opts.onDone(code === "aborted" || code === "no-speech" ? undefined : code);
  };

  recognition.onend = () => opts.onDone();

  try {
    recognition.start();
  } catch {
    // Already running, or the page isn't allowed to. Either way, no dictation.
    return null;
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
    },
  };
}
