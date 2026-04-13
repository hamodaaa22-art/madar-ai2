
// Imported React to resolve the 'Cannot find namespace React' error when using React.FC.
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, X, Languages } from 'lucide-react';

interface Props {
  apiKey: string;
  contextText: string | null;
  mode: 'assistant' | 'translator';
  onClose: () => void;
}

// Helper functions for audio encoding/decoding as per guidelines
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioDataManual(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    // The supported audio MIME type is 'audio/pcm'.
    mimeType: 'audio/pcm;rate=16000',
  };
}

const VoiceAssistant: React.FC<Props> = ({ apiKey, contextText, mode, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const stopSession = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (processorRef.current) processorRef.current.disconnect();
    if (inputSourceRef.current) inputSourceRef.current.disconnect();
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    
    audioSourcesRef.current.forEach(source => { try { source.stop(); } catch (e) {} });
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close().catch(() => {});
      inputContextRef.current = null;
    }
    
    setIsActive(false);
    setIsConnecting(false);
  };

  const startSession = async () => {
    if (isConnecting || isActive) return;
    
    if (!apiKey) {
      setError("مفتاح API مفقود. يرجى إعداده في الإعدادات.");
      return;
    }

    setIsConnecting(true);
    setError(null);
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      // Output Context
      const audioCtx = new AudioContextClass({ sampleRate: 24000 });
      await audioCtx.resume();
      audioContextRef.current = audioCtx;

      // Input Context
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      await inputCtx.resume();
      inputContextRef.current = inputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000, 
          channelCount: 1, 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey });
      
      const systemPrompt = mode === 'translator' 
        ? "You are a professional real-time voice translator. Listen to Arabic speech and translate it into English. Respond ONLY with the English translation in audio format. Do not add any conversational text, explanations, or filler words. Your output must be purely the translated English speech. If you hear English, translate it to Arabic."
        : `أنت رفيق سفر ذكي ومرح اسمك مَـدار. معلومات الموقع الحالي: ${contextText?.substring(0, 500)}. تحدث بالعربية بلهجة ودودة وواضحة. ساعد المسافر في استكشاف المنطقة وتقديم نصائح مفيدة.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: mode === 'translator' ? 'Puck' : 'Fenrir' } },
          },
          systemInstruction: systemPrompt,
        },
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            const analyser = inputCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            const updateVolume = () => {
              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              analyser.getByteFrequencyData(dataArray);
              const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
              setVolume(average);
              animationFrameRef.current = requestAnimationFrame(updateVolume);
            };
            updateVolume();

            processor.onaudioprocess = (e) => {
               sessionPromise.then(session => {
                 if (session) {
                   const inputData = e.inputBuffer.getChannelData(0);
                   const pcmBlob = createBlob(inputData);
                   session.sendRealtimeInput({ audio: pcmBlob });
                 }
               });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
            inputSourceRef.current = source;
            processorRef.current = processor;
          },
          onmessage: async (msg: LiveServerMessage) => {
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              setIsSpeaking(true);
              const ctx = audioContextRef.current;
              
              nextStartTimeRef.current = Math.max(
                nextStartTimeRef.current,
                ctx.currentTime,
              );

              const audioBuffer = await decodeAudioDataManual(
                decode(base64Audio),
                ctx,
                24000,
                1,
              );

              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              
              source.addEventListener('ended', () => {
                 audioSourcesRef.current.delete(source);
                 if (audioSourcesRef.current.size === 0) setIsSpeaking(false);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }

            if (msg.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(source => {
                try { source.stop(); } catch (e) {}
              });
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: (err: any) => { 
            console.error("Live API Error:", err);
            if (err?.message?.includes('expired') || err?.message?.includes('INVALID_ARGUMENT')) {
              setError("انتهت صلاحية مفتاح الـ API. يرجى تحديثه من الإعدادات.");
            } else {
              setError("حدث خطأ في الاتصال. تأكد من صلاحية مفتاح API.");
            }
          },
          onclose: () => {
            setIsActive(false);
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (error: any) {
      console.error("Session Start Error:", error);
      const msg = error.message || "";
      if (msg.includes('expired') || msg.includes('INVALID_ARGUMENT')) {
        setError("انتهت صلاحية مفتاح الـ API. يرجى تحديثه من الإعدادات.");
      } else {
        setError(msg || "فشل في بدء الجلسة. يرجى التحقق من الميكروفون والاتصال.");
      }
      setIsConnecting(false);
      stopSession();
    }
  };

  useEffect(() => {
    // We still try to auto-start, but the manual button will be there if it fails
    startSession();
    return () => stopSession();
  }, [mode]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
      <div className={`w-full max-w-sm ${mode === 'translator' ? 'bg-indigo-950/50 border-indigo-500' : 'bg-slate-900 border-emerald-500'} rounded-3xl p-8 border-2 shadow-2xl flex flex-col items-center gap-6 relative overflow-hidden`}>
         {/* Background Pulse */}
         <div 
           className="absolute inset-0 opacity-10 pointer-events-none transition-all duration-300"
           style={{ 
             background: `radial-gradient(circle at center, ${mode === 'translator' ? '#6366f1' : '#10b981'} 0%, transparent ${Math.min(volume * 2, 100)}%)` 
           }}
         />

         <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 relative z-10 ${isSpeaking ? 'bg-indigo-500 scale-110 shadow-[0_0_40px_rgba(99,102,241,0.6)]' : 'bg-slate-800'}`}>
           {mode === 'translator' ? (
             <Languages className={`w-16 h-16 text-white ${isSpeaking ? 'animate-pulse' : ''}`} />
           ) : (
             <Mic className={`w-16 h-16 text-white ${isSpeaking ? 'animate-pulse' : ''}`} />
           )}
           
           {/* Volume Ring */}
           {!isSpeaking && isActive && (
             <div 
               className="absolute inset-0 rounded-full border-4 border-emerald-500/30 transition-transform duration-75"
               style={{ transform: `scale(${1 + volume / 100})` }}
             />
           )}
         </div>
         
         <div className="space-y-2 relative z-10">
           <h2 className="text-3xl font-bold text-white">
             {mode === 'translator' ? 'المترجم الفوري' : 'المساعد الذكي'}
           </h2>
           <p className={`${mode === 'translator' ? 'text-indigo-400' : 'text-emerald-400'} text-lg font-medium min-h-[3rem] flex items-center justify-center`}>
             {error ? error : isConnecting ? 'جاري الاتصال...' : isSpeaking ? 'أتحدث الآن...' : isActive ? 'أستمع إليك...' : 'جاهز للبدء'}
           </p>
           {mode === 'translator' && !error && (
             <p className="text-slate-400 text-sm">تحدث بالعربية، وسأترجم للإنجليزية فوراً</p>
           )}
         </div>

         <div className="w-full space-y-3 relative z-10">
           {!isActive && !isConnecting && (
             <button 
               onClick={startSession}
               className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
             >
               <Mic size={20} />
               <span>بدء التحدث</span>
             </button>
           )}
           
           {error && (
             <button 
               onClick={startSession}
               className="w-full py-3 bg-white/10 text-white font-bold rounded-xl border border-white/20 hover:bg-white/20 transition-all"
             >
               إعادة المحاولة
             </button>
           )}

           <button 
             onClick={() => { stopSession(); onClose(); }}
             className="w-full py-4 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/50 text-xl font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
           >
             <X className="w-6 h-6" />
             <span>إغلاق</span>
           </button>
         </div>
      </div>
    </div>
  );
};

export default VoiceAssistant;
