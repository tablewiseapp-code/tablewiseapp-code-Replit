import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { createRecipe } from "@/lib/storage";
import { useI18n, type Language } from "@/lib/i18n";
import { PageContainer } from "@/components/layout/page-container";

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

async function parseRecipeWithAI(text: string): Promise<{ title: string; ingredients: string[]; steps: string[]; cookTime?: number; servings?: string; tags?: string[] }> {
  const response = await fetch("/api/parse-recipe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: text }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to parse recipe");
  }

  return response.json();
}

const TRANSCRIPTION_LANG_CODES: Record<Language, string> = {
  en: "en",
  ru: "ru",
  he: "he",
};

const AUDIO_MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/wav",
] as const;

function getVoiceErrorMessage(error: string): string {
  if (error === "permission-denied" || error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone permission was denied. Please allow microphone access and try again.";
  }
  if (error === "audio-capture") {
    return "No microphone was found on this device/browser.";
  }
  if (error === "network") {
    return "Speech recognition failed due to a network error. Please try again.";
  }
  if (error === "no-speech") {
    return "No speech was detected. Try speaking louder or closer to the microphone.";
  }
  return "Unable to record voice in this browser.";
}

function getSupportedRecorderMimeType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }

  if (typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }

  for (const mimeType of AUDIO_MIME_TYPE_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read audio data"));
        return;
      }
      const data = reader.result.split(",")[1] || "";
      resolve(data);
    };
    reader.onerror = () => reject(new Error("Failed to read audio data"));
    reader.readAsDataURL(blob);
  });
}

async function transcribeAudio(blob: Blob, lang: Language): Promise<string> {
  const base64Audio = await blobToBase64(blob);
  const response = await fetch("/api/transcribe-audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: base64Audio,
      mimeType: blob.type,
      language: TRANSCRIPTION_LANG_CODES[lang],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Failed to transcribe audio");
  }

  const payload = await response.json();
  return (payload.transcript || "").trim();
}

function showErrorPopup(message: string): void {
  if (typeof window !== "undefined") {
    window.alert(message);
  }
}

export default function ImportRecipe() {
  const [, setLocation] = useLocation();
  const { t, lang } = useI18n();
  const [title, setTitle] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [steps, setSteps] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "recording" | "ready">("idle");
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const isSecureOrigin = typeof window !== "undefined" &&
    (window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const recorderMimeType = getSupportedRecorderMimeType();
  const voiceSupported = typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined" &&
    isSecureOrigin;

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const stopActiveStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startDictation = async () => {
    if (!voiceSupported) {
      const message = !isSecureOrigin
        ? "Voice transcription requires HTTPS (or localhost). Open the app using a secure URL."
        : t("import.voiceNotSupported");
      setVoiceError(message);
      showErrorPopup(message);
      return;
    }

    setVoiceError(null);
    setAiError(null);
    setTranscript("");
    setRecordedAudioBlob(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stopActiveStream();
      streamRef.current = stream;

      const recorderOptions = recorderMimeType ? { mimeType: recorderMimeType } : undefined;
      const recorder = recorderOptions ? new MediaRecorder(stream, recorderOptions) : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event: any) => {
        console.error("Audio recording error:", event);
        const message = getVoiceErrorMessage(event?.error?.name?.toLowerCase() ?? "network");
        setVoiceError(message);
        setIsRecording(false);
        setVoiceStatus("idle");
        showErrorPopup(message);
        stopActiveStream();
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || recorderMimeType || "audio/webm",
        });

        setRecordedAudioBlob(blob.size > 0 ? blob : null);
        setIsRecording(false);
        setVoiceStatus(blob.size > 0 ? "ready" : "idle");

        if (blob.size === 0) {
          const message = "No audio was captured. Please try again.";
          setVoiceError(message);
          showErrorPopup(message);
        }

        stopActiveStream();
      };

      recorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setVoiceStatus("recording");
    } catch (error: any) {
      console.error("Audio recording start failed:", error);
      const message = getVoiceErrorMessage(
        error?.name === "NotAllowedError" ? "not-allowed" : "audio-capture",
      );
      setVoiceError(message);
      setIsRecording(false);
      setVoiceStatus("idle");
      showErrorPopup(message);
      stopActiveStream();
    }
  };

  const stopDictation = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      return;
    }

    setIsRecording(false);
    setVoiceStatus(recordedAudioBlob ? "ready" : "idle");
    stopActiveStream();
  };

  const clearTranscript = () => {
    setTranscript("");
    setRecordedAudioBlob(null);
    setVoiceStatus("idle");
    setVoiceError(null);
  };

  const handleTranscribeAndFill = async () => {
    if (!recordedAudioBlob && !transcript.trim()) return;

    setIsProcessing(true);
    setAiError(null);
    setVoiceError(null);

    try {
      let transcriptToParse = transcript.trim();

      if (recordedAudioBlob) {
        transcriptToParse = await transcribeAudio(recordedAudioBlob, lang);
        setTranscript(transcriptToParse);
      }

      if (!transcriptToParse) {
        throw new Error("Couldn't transcribe your audio. Please try again.");
      }

      const parsed = await parseRecipeWithAI(transcriptToParse);

      const hasExisting = title.trim() || ingredients.trim() || steps.trim();
      if (hasExisting) {
        const replace = window.confirm(t("import.replaceConfirm"));
        if (!replace) {
          setIsProcessing(false);
          return;
        }
      }

      setTitle(parsed.title || "");
      setIngredients((parsed.ingredients || []).join("\n"));
      setSteps((parsed.steps || []).join("\n"));
    } catch (error: any) {
      console.error("AI parse error:", error);
      const message = error.message || t("import.error");
      setAiError(message);
      showErrorPopup(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const urlValid = !sourceUrl.trim() || isValidUrl(sourceUrl.trim());

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    const parsedIngredients = ingredients
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    const parsedSteps = steps
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    try {
      const saved = await createRecipe({
        title: title.trim() || "Untitled Recipe",
        ingredients: parsedIngredients,
        steps: parsedSteps,
        image: image || null,
        sourceUrl: sourceUrl.trim() && isValidUrl(sourceUrl.trim()) ? sourceUrl.trim() : null,
      });
      setLocation(`/recipe/${saved.id}`);
    } catch (error: any) {
      console.error("Failed to save recipe:", error);
      const message = error.message || "Failed to save recipe";
      showErrorPopup(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageContainer size="md" className="py-8 sm:py-10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("import.label")}</p>
        <h1 className="text-xl sm:text-2xl font-medium text-foreground mb-2">{t("import.title")}</h1>
        <p className="text-sm text-muted-foreground mb-8">
          {t("import.subtitle")}
        </p>

        <div className="space-y-6">
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t("import.photo")}
            </label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              capture="environment"
              className="hidden"
              data-testid="input-photo"
            />
            {image ? (
              <div className="relative inline-block">
                <img 
                  src={image} 
                  alt="Recipe preview" 
                  className="w-32 h-32 object-cover rounded-lg border hairline"
                  data-testid="img-preview"
                />
                <button
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 w-11 h-11 bg-foreground text-background rounded-full flex items-center justify-center text-xs hover:bg-foreground/80"
                  data-testid="button-remove-photo"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-8 border-2 border-dashed border-foreground/20 rounded-lg flex flex-col items-center gap-2 text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
                data-testid="button-add-photo"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="5" width="18" height="14" rx="2"/>
                  <circle cx="8.5" cy="10.5" r="1.5"/>
                  <path d="M4 17l4-4 3 3 5-5 4 4"/>
                </svg>
                <span className="text-sm">{t("import.takePhoto")}</span>
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t("import.sourceLink")}
            </label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder={t("import.sourcePlaceholder")}
              className={`w-full px-4 py-3 text-sm border rounded-lg bg-background focus-ring-quiet ${!urlValid ? "border-red-300" : "hairline"}`}
              data-testid="input-source-url"
            />
            {!urlValid && (
              <p className="text-xs text-red-500 mt-1">{t("import.invalidUrl")}</p>
            )}
          </div>

          <div className="p-5 bg-[#FAFAF8] rounded-xl">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t("import.voiceAi")}</p>
            <p className="text-sm font-medium text-foreground mb-1">{t("import.speakRecipe")}</p>
            <p className="text-xs text-muted-foreground mb-4">
              {t("import.voiceDesc")}
            </p>

            {!voiceSupported ? (
              <p className="text-xs text-muted-foreground">
                {!isSecureOrigin
                  ? "Voice transcription requires HTTPS (or localhost). Open the app using a secure URL."
                  : t("import.voiceNotSupported")}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {!isRecording ? (
                    <button
                      onClick={startDictation}
                      disabled={isProcessing}
                      className="px-4 py-2 min-h-11 text-sm rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
                      data-testid="button-start-dictation"
                    >
                      {t("import.startDictation")}
                    </button>
                  ) : (
                    <button
                      onClick={stopDictation}
                      className="px-4 py-2 min-h-11 text-sm rounded-full bg-red-500 text-white hover:bg-red-600"
                      data-testid="button-stop-dictation"
                    >
                      {t("import.stopDictation")}
                    </button>
                  )}

                  {voiceStatus === "ready" && (
                    <button
                      onClick={handleTranscribeAndFill}
                      disabled={isProcessing}
                      className="px-4 py-2 min-h-11 text-sm rounded-full bg-[#7A9E7E] text-white hover:bg-[#6B8E6F] disabled:opacity-50"
                      data-testid="button-transcribe"
                    >
                      {isProcessing ? t("import.aiThinking") : t("import.generateWithAi")}
                    </button>
                  )}
                </div>

                <p className="text-xs text-muted-foreground mb-2">
                  {voiceStatus === "idle" && t("import.tipDescribe")}
                  {voiceStatus === "recording" && t("import.listening")}
                  {voiceStatus === "ready" && !isProcessing && t("import.transcriptReady")}
                  {isProcessing && t("import.sendingToAi")}
                </p>

                {voiceError && (
                  <div className="mt-2 p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-red-600">{voiceError}</p>
                  </div>
                )}

                {aiError && (
                  <div className="mt-2 p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-red-600">{aiError}</p>
                  </div>
                )}

                {transcript && (
                  <div className="mt-3 p-3 bg-white rounded-lg border hairline">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-foreground flex-1">{transcript}</p>
                      <button
                        onClick={clearTranscript}
                        className="text-xs min-h-11 px-2 text-muted-foreground hover:text-foreground"
                        data-testid="button-clear-transcript"
                      >
                        {t("import.clear")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t("import.titleLabel")}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("import.titlePlaceholder")}
              className="w-full px-4 py-3 text-sm border hairline rounded-lg bg-background focus-ring-quiet"
              data-testid="input-title"
            />
            {!title.trim() && (
              <p className="text-xs text-muted-foreground mt-1">{t("import.titleHint")}</p>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t("import.ingredientsLabel")}
            </label>
            <textarea
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              placeholder="200g rice
500g chicken thighs
2 carrots, diced
1 large onion, sliced"
              rows={6}
              className="w-full px-4 py-3 text-sm border hairline rounded-lg bg-background focus-ring-quiet resize-none"
              data-testid="textarea-ingredients"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t("import.stepsLabel")}
            </label>
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder="Rinse the rice and soak for 30 minutes
Cut chicken into pieces and season
Sauté onions until golden brown"
              rows={8}
              className="w-full px-4 py-3 text-sm border hairline rounded-lg bg-background focus-ring-quiet resize-none"
              data-testid="textarea-steps"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 pt-4">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full sm:w-auto px-6 py-2.5 min-h-11 text-sm rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
              data-testid="button-save"
            >
              {isSaving ? t("import.saving") || "Saving..." : t("import.saveAndOpen")}
            </button>
            <button
              onClick={() => setLocation("/recipe-view")}
              className="w-full sm:w-auto px-6 py-2.5 min-h-11 text-sm rounded-full border hairline text-muted-foreground hover:text-foreground"
              data-testid="button-back"
            >
              {t("import.back")}
            </button>
          </div>
        </div>

        <div className="mt-12 p-5 bg-[#FAFAF8] rounded-xl">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">{t("import.howItWorks")}</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>{`• ${t("import.howIt1")}`}</li>
            <li>{`• ${t("import.howIt2")}`}</li>
            <li>{`• ${t("import.howIt3")}`}</li>
            <li>{`• ${t("import.howIt4")}`}</li>
          </ul>
        </div>
      </PageContainer>
    </div>
  );
}
