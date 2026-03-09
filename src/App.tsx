/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Upload, Image as ImageIcon, Wand2, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const GEMINI_MODEL = "gemini-2.5-flash-image";

export default function App() {
  const [playerImage, setPlayerImage] = useState<string | null>(null);
  const [jerseyImage, setJerseyImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setter(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const [hasApiKey, setHasApiKey] = useState(true); // Default to true to try with env key first

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        try {
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(selected);
        } catch (e) {
          console.error("Error checking API key:", e);
          setHasApiKey(true);
        }
      } else {
        // If not in AI Studio environment, we assume the key is in process.env
        setHasApiKey(true);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
      } catch (e) {
        console.error("Error opening key selector:", e);
        alert("Failed to open the API key selector. Please try refreshing the page.");
      }
    } else {
      alert("The API key selector is only available when viewing the app inside Google AI Studio. If you are on the shared link, please ensure you are logged in.");
    }
  };

  const [useHighQuality, setUseHighQuality] = useState(false);

  const generateSwappedKit = async () => {
    if (!playerImage || !jerseyImage) {
      setError("Please provide both a player image and a jersey image.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use the selected model
      const modelToUse = useHighQuality ? "gemini-3.1-flash-image-preview" : "gemini-2.5-flash-image";
      
      // Try to get the key from multiple possible sources
      // 1. process.env.API_KEY (injected by AI Studio key selection dialog)
      // 2. process.env.GEMINI_API_KEY (injected by AI Studio secrets)
      const apiKey = (process.env as any).API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "" || apiKey === "undefined") {
        setHasApiKey(false);
        throw new Error("API_KEY_MISSING");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const getMimeType = (dataUrl: string) => {
        const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
        return match ? match[1] : "image/png";
      };

      const playerMime = getMimeType(playerImage);
      const jerseyMime = getMimeType(jerseyImage);
      const playerBase64 = playerImage.split(',')[1];
      const jerseyBase64 = jerseyImage.split(',')[1];

      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: {
          parts: [
            {
              inlineData: {
                data: playerBase64,
                mimeType: playerMime,
              },
            },
            {
              inlineData: {
                data: jerseyBase64,
                mimeType: jerseyMime,
              },
            },
            {
              text: "Instruction: Generate a new image. Take the person from the first image and place them in the football jersey shown in the second image. The person should be in a realistic action pose on a football pitch. Ensure the person's face and the jersey's details (stripes, colors, logos) are clearly visible and accurately represented.",
            },
          ],
        },
        ...(useHighQuality ? {
          config: {
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "1K"
            }
          }
        } : {})
      });

      if (!response.candidates || response.candidates.length === 0) {
        throw new Error("The AI model did not return any results. Try using different images.");
      }

      const candidate = response.candidates[0];
      
      if (candidate.finishReason === "SAFETY") {
        throw new Error("The generation was blocked by safety filters. This often happens with real celebrities or public figures. Try using a more generic player photo.");
      }

      let foundImage = false;
      let aiTextResponse = "";

      for (const part of candidate.content?.parts || []) {
        if (part.inlineData) {
          setResultImage(`data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`);
          foundImage = true;
          break;
        } else if (part.text) {
          aiTextResponse += part.text;
        }
      }

      if (!foundImage) {
        throw new Error(aiTextResponse || "No image was generated. The AI might be having trouble with these specific images. Try using clearer photos.");
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      
      if (err.message === "API_KEY_MISSING") {
        setHasApiKey(false);
        setError("No valid API key found. Please click the 'Select API Key' button below to configure your key.");
      } else if (err.message?.includes("400") && err.message?.includes("API key not valid")) {
        setHasApiKey(false);
        setError("The current API key is invalid. Please click 'Select API Key' to provide a valid one.");
      } else if (err.message?.includes("403") || err.message?.includes("permission")) {
        setError("Permission Denied (403). This model may require a paid API key. Try switching to 'Standard' mode or selecting a valid paid key.");
      } else if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("API Key issue. Please re-select your API key.");
      } else {
        setError(err.message || "An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <header className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-4 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
              KIT SWAPPER AI
            </h1>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Transform any player with any jersey. Upload your images and let Gemini 2.5 Flash Image do the magic.
            </p>
          </motion.div>
        </header>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Controls Section */}
          <section className="space-y-8">
            <div className="grid grid-cols-2 gap-4">
              {/* Player Upload */}
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Player Image</label>
                <div className="relative aspect-[3/4] rounded-2xl border border-white/10 bg-white/5 overflow-hidden group">
                  {playerImage ? (
                    <img src={playerImage} alt="Player" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                      <ImageIcon className="w-8 h-8 text-zinc-600 mb-2" />
                      <span className="text-xs text-zinc-500">Upload Player</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, setPlayerImage)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <Upload className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Jersey Upload */}
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Jersey Image</label>
                <div className="relative aspect-[3/4] rounded-2xl border border-white/10 bg-white/5 overflow-hidden group">
                  {jerseyImage ? (
                    <img src={jerseyImage} alt="Jersey" className="w-full h-full object-contain p-4" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                      <ImageIcon className="w-8 h-8 text-zinc-600 mb-2" />
                      <span className="text-xs text-zinc-500">Upload Jersey</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, setJerseyImage)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <Upload className="w-6 h-6" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="space-y-1">
                <p className="text-sm font-semibold">High Quality Mode</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Requires Paid API Key</p>
              </div>
              <button
                onClick={() => setUseHighQuality(!useHighQuality)}
                className={`w-12 h-6 rounded-full transition-colors relative ${useHighQuality ? 'bg-emerald-500' : 'bg-zinc-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${useHighQuality ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            {!hasApiKey && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm space-y-3">
                <p className="font-semibold">API Key Configuration Required</p>
                <p className="text-xs opacity-80">To use this app, you must select your own Gemini API key. Click the button below to open the selector.</p>
                <button
                  onClick={handleSelectKey}
                  className="w-full py-2 rounded-xl bg-amber-500 text-black font-bold hover:bg-amber-400 transition-colors"
                >
                  Select API Key
                </button>
              </div>
            )}

            <button
              onClick={generateSwappedKit}
              disabled={isLoading || !playerImage || !jerseyImage}
              className="w-full py-4 rounded-2xl bg-white text-black font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  GENERATING...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  GENERATE SWAP
                </>
              )}
            </button>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-400 text-sm text-center bg-red-400/10 py-3 rounded-xl border border-red-400/20"
              >
                {error}
              </motion.p>
            )}
          </section>

          {/* Result Section */}
          <section className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Result</label>
            <div className="relative aspect-square rounded-3xl border border-white/10 bg-white/5 overflow-hidden shadow-2xl">
              <AnimatePresence mode="wait">
                {resultImage ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    className="w-full h-full relative"
                  >
                    <img src={resultImage} alt="Generated result" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button
                      onClick={() => setResultImage(null)}
                      className="absolute top-4 right-4 p-2 rounded-full bg-black/50 backdrop-blur-md border border-white/10 hover:bg-black/70 transition-colors"
                    >
                      <RefreshCw className="w-5 h-5" />
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 p-12 text-center"
                  >
                    {isLoading ? (
                      <div className="space-y-4 flex flex-col items-center">
                        <div className="w-12 h-12 border-4 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" />
                        <p className="text-sm font-medium animate-pulse">Processing pixels...</p>
                      </div>
                    ) : (
                      <>
                        <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-sm max-w-[200px]">Upload images and click generate to see the result here.</p>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-white/5 text-center">
        <p className="text-zinc-600 text-xs tracking-widest uppercase">Powered by Gemini 2.5 Flash Image</p>
      </footer>
    </div>
  );
}
