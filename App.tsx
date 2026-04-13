import React, { useEffect, useState, useRef, useCallback } from 'react';
import { GeoLocationState, Mood, PlaceRecommendation, BudgetInfo } from './types';
import { fetchLocationContext, fetchRecommendations, generateLocationImage, generateArabicSpeech, fetchCurrencyExchange, analyzeMoodFromImage } from './services/geminiService';
import MoodSelector from './components/MoodSelector';
import RecommendationCard from './components/RecommendationCard';
import VoiceAssistant from './components/VoiceAssistant';
import { MapPin, Loader2, Compass, AlertTriangle, CloudSun, Languages, Coins, Mic, RefreshCw, Pause, Play, Car, Wallet, X, ArrowRight, Clock, CreditCard, CheckCircle2, NavigationOff, Map as MapIcon, Camera, Scan, QrCode, Share } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

const CAPITALS = [
  { name: 'الرياض', lat: 24.7136, lng: 46.6753 },
  { name: 'ينبع', lat: 24.0891, lng: 38.0637 },
  { name: 'دبي', lat: 25.2048, lng: 55.2708 },
  { name: 'باريس', lat: 48.8566, lng: 2.3522 },
  { name: 'لندن', lat: 51.5074, lng: -0.1278 },
  { name: 'طوكيو', lat: 35.6762, lng: 139.6503 }
];

const STORAGE_KEY = 'mosafer_v3_session_cache';

function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const App: React.FC = () => {
  const [cachedData] = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));

  const [location, setLocation] = useState<GeoLocationState>({
    lat: cachedData?.lat || null,
    lng: cachedData?.lng || null,
    error: null,
    loading: !cachedData,
  });

  const [locationContext, setLocationContext] = useState<string | null>(cachedData?.context || null);
  const [locationName, setLocationName] = useState<string | null>(cachedData?.name || null);
  const [temperature, setTemperature] = useState<string | null>(cachedData?.temp || null);
  const [contextLoading, setContextLoading] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  
  const [locationImage, setLocationImage] = useState<string | null>(cachedData?.image || null);
  const [imageLoading, setImageLoading] = useState(false);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioStatus, setAudioStatus] = useState<'playing' | 'paused' | 'stopped'>('stopped');
  
  const [mood, setMood] = useState<Mood | null>(null);
  const [recommendations, setRecommendations] = useState<PlaceRecommendation[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  const [activeAssistant, setActiveAssistant] = useState<'assistant' | 'translator' | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [detectedMood, setDetectedMood] = useState<Mood | null>(null);
  const [showCameraResults, setShowCameraResults] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showBudgetPlanner, setShowBudgetPlanner] = useState(false);
  const [showRideHailing, setShowRideHailing] = useState(false);
  
  const [budget, setBudget] = useState<BudgetInfo | null>(null);
  const [tempBudget, setTempBudget] = useState<BudgetInfo>({ amount: 1000, days: 3, currency: 'SAR' });

  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }));

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }));
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const detectLocation = useCallback(async (manualCoords?: {lat: number, lng: number}) => {
    if (manualCoords) {
      setLocation({ lat: manualCoords.lat, lng: manualCoords.lng, error: null, loading: false });
      return;
    }
    
    if (!navigator.geolocation) {
      setLocation({ lat: 24.0891, lng: 38.0637, error: null, loading: false }); // Default to Yanbu
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, error: null, loading: false }),
      () => setLocation({ lat: 24.0891, lng: 38.0637, error: null, loading: false }),
      { timeout: 10000 }
    );
  }, []);

  useEffect(() => { detectLocation(); }, [detectLocation]);

  const handleAudioToggle = useCallback(async () => {
    if (!audioBase64 && !audioBufferRef.current) return;
    try {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      if (audioStatus === 'playing') {
        audioSourceRef.current?.stop();
        setAudioStatus('paused');
        return;
      }
      if (!audioBufferRef.current && audioBase64) {
        const bytes = decodeBase64(audioBase64);
        const buffer = await ctx.decodeAudioData(bytes.buffer);
        audioBufferRef.current = buffer;
      }
      if (audioBufferRef.current) {
        const source = ctx.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.connect(ctx.destination);
        source.start(0);
        audioSourceRef.current = source;
        setAudioStatus('playing');
        source.onended = () => setAudioStatus('stopped');
      }
    } catch (e) { setAudioStatus('stopped'); }
  }, [audioBase64, audioStatus]);

  useEffect(() => {
    const initLocationContext = async () => {
      if (location.lat && location.lng) {
        setContextLoading(true);
        setGeneralError(null);
        try {
          const response = await fetchLocationContext(location.lat, location.lng);
          if (response.rawText) {
            setLocationContext(response.rawText);
            setLocationName(response.locationName || null);
            setTemperature(response.temperature || null);
            setImageLoading(true);
            generateLocationImage(response.visualPrompt || response.rawText).then(img => {
              setLocationImage(img);
              setImageLoading(false);
            });
            generateArabicSpeech(response.rawText).then(setAudioBase64);
          }
        } catch (err) {
          setGeneralError("يرجى اختيار مدينة يدوياً.");
        } finally { setContextLoading(false); }
      }
    };
    initLocationContext();
  }, [location.lat, location.lng]);

  const handleMoodSelect = async (selectedMood: Mood, fromCamera = false) => {
    if (!location.lat || !location.lng || !locationContext) return;
    setMood(selectedMood);
    setRecLoading(true);
    setShowCameraResults(fromCamera);
    try {
      const response = await fetchRecommendations(location.lat, location.lng, selectedMood, locationContext, budget);
      if (response.recommendations) setRecommendations(response.recommendations);
    } catch (err) { console.error(err); } finally { setRecLoading(false); }
  };

  const handleBudgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBudget(tempBudget);
    setShowBudgetPlanner(false);
    if (mood) handleMoodSelect(mood);
  };

  const handleCameraCapture = async () => {
    const video = document.querySelector('video');
    const canvas = document.createElement('canvas');
    if (video) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
        setCameraLoading(true);
        try {
          const moodResult = await analyzeMoodFromImage(base64Image);
          if (moodResult) setDetectedMood(moodResult);
        } finally { setCameraLoading(false); }
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-50 pb-32">
      {/* الـ VoiceAssistant سيستخدم المفتاح المدمج الآن */}
      {activeAssistant && <VoiceAssistant contextText={locationContext} mode={activeAssistant} onClose={() => setActiveAssistant(null)} />}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-slate-900/80 backdrop-blur-md border-b border-white/5 z-50 p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-6 h-6 text-emerald-500" />
            <select onChange={(e) => {
              const city = CAPITALS.find(c => c.name === e.target.value);
              if (city) detectLocation({ lat: city.lat, lng: city.lng });
            }} className="bg-slate-800/50 border border-white/10 text-white text-xs font-bold rounded-lg px-2 py-1.5 outline-none">
              <option value="">اختر مدينة...</option>
              {CAPITALS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
             <div className="text-[10px] font-bold text-slate-400"><Clock className="inline w-3 h-3 ml-1" /> {currentTime}</div>
             {temperature && <div className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">{temperature}</div>}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto pt-24 px-4 space-y-8">
        {contextLoading && !locationContext ? (
           <div className="bg-slate-900/50 rounded-[2.5rem] border border-white/5 p-20 flex flex-col items-center animate-pulse">
             <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
             <p className="text-slate-400">جاري تحليل الوجهة...</p>
           </div>
        ) : locationContext && (
          <section className="bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden animate-fade-in">
            <div className="relative h-64 bg-slate-800">
              {locationImage && <img src={locationImage} className="w-full h-full object-cover" alt="City" />}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent" />
              <div className="absolute bottom-6 right-8">
                <h2 className="text-3xl font-black text-white">{locationName}</h2>
              </div>
            </div>
            <div className="p-8 space-y-6">
              <button onClick={handleAudioToggle} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 rounded-2xl font-bold">
                {audioStatus === 'playing' ? <Pause /> : <Play />} استمع للوصف
              </button>
              <p className="text-slate-300 leading-relaxed text-lg">{locationContext}</p>
            </div>
          </section>
        )}

        {/* Mood Selector & Recommendations */}
        {locationContext && (
          <div className="space-y-6">
            <MoodSelector onSelect={handleMoodSelect} selectedMood={mood} disabled={recLoading} />
            <div className="grid gap-4">
              {recLoading ? <Loader2 className="mx-auto animate-spin text-emerald-500" /> : recommendations.map((rec, i) => <RecommendationCard key={i} data={rec} />)}
            </div>
          </div>
        )}
      </main>

      {/* Floating UI */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-4 p-3 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl z-40">
         <button onClick={() => setActiveAssistant('assistant')} className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center"><Mic size={20} /></button>
         <button onClick={() => setShowCamera(true)} className="w-12 h-12 rounded-full bg-amber-600 flex items-center justify-center"><Camera size={20} /></button>
         <button onClick={() => setActiveAssistant('translator')} className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center"><Languages size={20} /></button>
      </div>

      {/* QR & Budget Modals (Simplified Logic) */}
      {showQRModal && <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"><div className="bg-slate-900 p-8 rounded-3xl text-center"><QRCodeCanvas value="WIFI:S:Madar;P:123456;;" size={200} /><button onClick={()=>setShowQRModal(false)} className="mt-4 block w-full bg-emerald-600 py-2 rounded-xl">إغلاق</button></div></div>}
    </div>
  );
};

export default App;
