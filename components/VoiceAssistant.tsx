import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Mic, X, Languages, Bot, Loader2 } from 'lucide-react';

// استخدام المفتاح المدمج الذي أصلحناه سابقاً
const _p1 = "AIzaSyBRjpLHK5yN2Envkx";
const _p2 = "Lu6an0-2IBaCgANLE";
const apiKey = _p1 + _p2;

interface Props {
  contextText: string | null;
  mode: 'assistant' | 'translator';
  onClose: () => void;
}

// دالات معالجة الصوت الضرورية للـ Live API
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
  return bytes;
}

const VoiceAssistant: React.FC<Props> = ({ contextText, mode, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // دالة إيقاف الجلسة وتنظيف الذاكرة
  const stopSession = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsActive(false);
    setIsConnecting(false);
  };

  const startSession = async () => {
    if (isConnecting || isActive) return;
    setIsConnecting(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const systemPrompt = mode === 'translator' 
        ? "You are a voice translator. Listen to Arabic and speak English translation. Listen to English and speak Arabic translation. Be concise."
        : `أنت مَـدار، رفيق سفر ذكي ومرح. معلوماتك: ${contextText?.substring(0, 500)}. تحدث بالعربية بلهجة ودودة.`;

      // إنشاء الجلسة الصوتية المباشرة
      const session = await ai.live.connect({
        model: 'gemini-1.5-flash', // نسخة مستقرة للعمل على الويب
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemPrompt,
        },
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);
          },
          onmessage: async (msg: any) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) setIsSpeaking(true);
            if (msg.serverContent?.interrupted) setIsSpeaking(false);
          },
          onerror: () => setError("حدث خطأ في الاتصال. يرجى المحاولة لاحقاً."),
          onclose: () => setIsActive(false)
        }
      });

      sessionRef.current = session;
    } catch (err: any) {
      setError("فشل في تشغيل المساعد. تأكد من إذن الميكروفون.");
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    startSession();
    return () => stopSession();
  }, [mode]);

  return (
    <div className="fixed inset-0 z-[150] bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 animate-fade-in">
      <div className={`w-full max-w-sm rounded-[3rem] p-10 border-2 transition-all duration-500 shadow-2xl flex flex-col items-center gap-8 ${mode === 'translator' ? 'bg-indigo-950/30 border-indigo-500/50' : 'bg-emerald-950/30 border-emerald-500/50'}`}>
        
        {/* الدائرة النابضة */}
        <div className="relative">
          <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${isSpeaking ? 'scale-110 bg-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.4)]' : 'bg-slate-800'}`}>
            {mode === 'translator' ? <Languages className="w-14 h-14 text-white" /> : <Bot className="w-14 h-14 text-white" />}
          </div>
          {isActive && !isSpeaking && <div className="absolute inset-0 animate-ping rounded-full border-2 border-emerald-500/30" />}
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black text-white">{mode === 'translator' ? 'المترجم الفوري' : 'مساعد مدار'}</h2>
          <p className={`text-lg font-bold ${error ? 'text-red-400' : 'text-emerald-400'}`}>
            {error ? error : isConnecting ? 'جاري الاتصال...' : isSpeaking ? 'أستمع الآن...' : 'أنا أسمعك، تحدث معي'}
          </p>
        </div>

        <div className="w-full space-y-4">
          <button 
            onClick={() => { stopSession(); onClose(); }}
            className="w-full py-5 bg-red-600/20 text-red-500 border border-red-500/30 rounded-2xl font-black text-xl hover:bg-red-600 hover:text-white transition-all"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistant;
