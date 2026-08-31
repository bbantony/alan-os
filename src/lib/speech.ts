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

  let finalText = "";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const chunk = result[0]?.transcript ?? "";
      if (result.isFinal) finalText += chunk;
      else interim += chunk;
    }
    const combined = (finalText + interim).trim();
    opts.onText(combined, interim === "");
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
