import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { saveCurrentRecipe, generateId, type Recipe } from "@/lib/storage";
import { useI18n, type Language } from "@/lib/i18n";

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

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

const SPEECH_LOCALES: Record<Language, string> = {
  en: "en-US",
  ru: "ru-RU",
  he: "he-IL",
};

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
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const speechSupported = typeof window !== "undefined" && 
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startDictation = () => {
    if (!speechSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = SPEECH_LOCALES[lang] || "en-US";

    let finalTranscript = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript + interim);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
      setVoiceStatus(finalTranscript.trim() ? "ready" : "idle");
    };

    recognition.onend = () => {
      setIsRecording(false);
      setVoiceStatus(finalTranscript.trim() ? "ready" : "idle");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setVoiceStatus("recording");
  };

  const stopDictation = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
    setVoiceStatus(transcript.trim() ? "ready" : "idle");
  };

  const clearTranscript = () => {
    setTranscript("");
    setVoiceStatus("idle");
  };

  const handleTranscribeAndFill = async () => {
    if (!transcript.trim()) return;

    setIsProcessing(true);
    setAiError(null);

    try {
      const parsed = await parseRecipeWithAI(transcript);

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
      setAiError(error.message || t("import.error"));
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

  const handleSave = () => {
    const parsedIngredients = ingredients
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    const parsedSteps = steps
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const recipe: Recipe = {
      id: generateId(),
      title: title.trim() || "Untitled Recipe",
      ingredients: parsedIngredients,
      steps: parsedSteps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (image) {
      recipe.image = image;
    }

    if (sourceUrl.trim() && isValidUrl(sourceUrl.trim())) {
      recipe.sourceUrl = sourceUrl.trim();
    }

    saveCurrentRecipe(recipe);
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("import.label")}</p>
        <h1 className="text-2xl font-medium text-foreground mb-2">{t("import.title")}</h1>
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
                  className="absolute -top-2 -right-2 w-6 h-6 bg-foreground text-background rounded-full flex items-center justify-center text-xs hover:bg-foreground/80"
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

            {!speechSupported ? (
              <p className="text-xs text-muted-foreground">{t("import.voiceNotSupported")}</p>
            ) : (
              <>
                <div className="flex gap-2 mb-3">
                  {!isRecording ? (
                    <button
                      onClick={startDictation}
                      disabled={isProcessing}
                      className="px-4 py-2 text-sm rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
                      data-testid="button-start-dictation"
                    >
                      {t("import.startDictation")}
                    </button>
                  ) : (
                    <button
                      onClick={stopDictation}
                      className="px-4 py-2 text-sm rounded-full bg-red-500 text-white hover:bg-red-600"
                      data-testid="button-stop-dictation"
                    >
                      {t("import.stopDictation")}
                    </button>
                  )}

                  {voiceStatus === "ready" && (
                    <button
                      onClick={handleTranscribeAndFill}
                      disabled={isProcessing}
                      className="px-4 py-2 text-sm rounded-full bg-[#7A9E7E] text-white hover:bg-[#6B8E6F] disabled:opacity-50"
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
                        className="text-xs text-muted-foreground hover:text-foreground"
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

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSave}
              className="px-6 py-2.5 text-sm rounded-full bg-foreground text-background hover:bg-foreground/90"
              data-testid="button-save"
            >
              {t("import.saveAndOpen")}
            </button>
            <button
              onClick={() => setLocation("/")}
              className="px-6 py-2.5 text-sm rounded-full border hairline text-muted-foreground hover:text-foreground"
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
      </div>
    </div>
  );
}
