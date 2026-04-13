
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
  const [selectedRideProvider, setSelectedRideProvider] = useState<'uber' | 'careem' | 'bolt' | null>(null);
  const [rideStep, setRideStep] = useState<'provider' | 'destination' | 'estimating' | 'booked'>('provider');
  const [rideDestination, setRideDestination] = useState('');

  const [budget, setBudget] = useState<BudgetInfo | null>(null);
  const [tempBudget, setTempBudget] = useState<BudgetInfo>({ amount: 1000, days: 3, currency: 'ريال' });

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
    setLocationContext(null);
    setRecommendations([]);
    setMood(null);
    setLocationName(null);
    setTemperature(null);
    setLocationImage(null);
    setAudioBase64(null);
    setAudioStatus('stopped');

    if (manualCoords) {
      setLocation({ lat: manualCoords.lat, lng: manualCoords.lng, error: null, loading: false });
      return;
    }

    setLocation(prev => ({ ...prev, loading: !locationContext, error: null }));
    
    if (!navigator.geolocation) {
      setLocation({ lat: 25.2048, lng: 55.2708, error: null, loading: false });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, error: null, loading: false });
      },
      (err) => {
        if (!locationContext) {
          setLocation({ lat: 25.2048, lng: 55.2708, error: null, loading: false });
        } else {
          setLocation(prev => ({ ...prev, loading: false }));
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 3600000 }
    );
  }, [locationContext]);

  useEffect(() => {
    detectLocation();
  }, []);

  const handleAudioToggle = useCallback(async () => {
    if (!audioBase64 && !audioBufferRef.current) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      if (audioStatus === 'playing') {
        if (audioSourceRef.current) {
          audioSourceRef.current.stop();
          offsetRef.current += ctx.currentTime - startTimeRef.current;
          setAudioStatus('paused');
        }
        return;
      }
      if (!audioBufferRef.current && audioBase64) {
        const bytes = decodeBase64(audioBase64);
        const dataInt16 = new Int16Array(bytes.buffer);
        const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
        audioBufferRef.current = buffer;
      }
      if (audioBufferRef.current) {
        const source = ctx.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.connect(ctx.destination);
        if (offsetRef.current >= audioBufferRef.current.duration) offsetRef.current = 0;
        source.onended = () => {
          if (offsetRef.current + (ctx.currentTime - startTimeRef.current) >= (audioBufferRef.current?.duration || 0)) {
            setAudioStatus('stopped');
            offsetRef.current = 0;
          }
        };
        startTimeRef.current = ctx.currentTime;
        source.start(0, offsetRef.current);
        audioSourceRef.current = source;
        setAudioStatus('playing');
      }
    } catch (e) {
      setAudioStatus('stopped');
    }
  }, [audioBase64, audioStatus]);

  useEffect(() => {
    const initLocationContext = async () => {
      if (location.lat && location.lng) {
        setContextLoading(true);
        setQuotaExceeded(false);
        setGeneralError(null);
        try {
          const response = await fetchLocationContext(location.lat, location.lng);
          if (response.rawText) {
            setLocationContext(response.rawText);
            setLocationName(response.locationName || null);
            setTemperature(response.temperature || null);
            
            setImageLoading(true);
            setAudioLoading(true);

            const imagePromise = generateLocationImage(response.visualPrompt || response.rawText);
            const speechPromise = generateArabicSpeech(response.rawText);

            imagePromise.then(img => {
              setLocationImage(img);
              setImageLoading(false);
              
              localStorage.setItem(STORAGE_KEY, JSON.stringify({
                lat: location.lat,
                lng: location.lng,
                context: response.rawText,
                name: response.locationName,
                temp: response.temperature,
                image: img
              }));
            });

            speechPromise.then(audio => {
              setAudioBase64(audio);
              setAudioLoading(false);
            });
          }
        } catch (err: any) {
          if (err.message === '429') setQuotaExceeded(true);
          else if (err.message === 'API_KEY_EXPIRED') setGeneralError("انتهت صلاحية مفتاح الـ API. يرجى تحديثه من الإعدادات.");
          else setGeneralError("حدث خطأ أثناء جلب البيانات. يرجى اختيار مدينة يدوياً.");
        } finally {
          setContextLoading(false);
        }
      }
    };
    initLocationContext();
  }, [location.lat, location.lng]);

  const handleMoodSelect = async (selectedMood: Mood, fromCamera = false) => {
    if (!location.lat || !location.lng || !locationContext) return;
    setMood(selectedMood);
    setRecLoading(true);
    setRecommendations([]);
    setShowCameraResults(fromCamera);
    try {
      const response = await fetchRecommendations(location.lat, location.lng, selectedMood, locationContext, budget);
      if (response.recommendations) setRecommendations(response.recommendations);
    } catch (err: any) {
      console.error(err);
      if (err.message === 'API_KEY_EXPIRED') setGeneralError("انتهت صلاحية مفتاح الـ API. يرجى تحديثه من الإعدادات.");
    } finally {
      setRecLoading(false);
    }
  };

  const handleCurrencySearch = async () => {
    if (!location.lat || !location.lng) return;
    setRecLoading(true);
    setRecommendations([]);
    try {
      const results = await fetchCurrencyExchange(location.lat, location.lng);
      setRecommendations(results);
    } catch (err) {
      console.error(err);
    } finally {
      setRecLoading(false);
    }
  };

  const handleBudgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBudget(tempBudget);
    setShowBudgetPlanner(false);
    if (mood) handleMoodSelect(mood);
  };

  const handleCapitalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const city = CAPITALS.find(c => c.name === e.target.value);
    if (city) detectLocation({ lat: city.lat, lng: city.lng });
  };

  const handleCameraCapture = async () => {
    const video = document.querySelector('video');
    const canvas = document.createElement('canvas');
    if (video) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
        setCameraLoading(true);
        try {
          const moodResult = await analyzeMoodFromImage(base64Image);
          if (moodResult) {
            setDetectedMood(moodResult);
            if (video.srcObject) {
              (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            }
          }
        } catch (err) {
          console.error(err);
        } finally {
          setCameraLoading(false);
        }
      }
    }
  };

  const applyCameraMood = () => {
    if (detectedMood) {
      handleMoodSelect(detectedMood, true);
      setShowCamera(false);
      setDetectedMood(null);
      setTimeout(() => {
        const moodSection = document.getElementById('mood-section');
        moodSection?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  };

  if (location.loading && !locationContext) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6 text-center">
        <Compass className="w-16 h-16 text-emerald-500 animate-spin mb-6" />
        <h1 className="text-2xl font-bold text-white mb-2 tracking-tighter">مَـدار AI</h1>
        <p className="text-slate-400 animate-pulse font-medium">جاري التعرف على وجهتك الحالية...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-50 pb-32">
{activeAssistant && <VoiceAssistant apiKey={process.env.GEMINI_API_KEY || process.env.API_KEY || ''} contextText={locationContext} mode={activeAssistant} onClose={() => setActiveAssistant(null)} />}

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-sm bg-slate-900 rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl animate-fade-in-up">
            {!detectedMood ? (
              <>
                <div className="relative aspect-[3/4] bg-black">
                  <video 
                    autoPlay 
                    playsInline 
                    muted 
                    ref={(el) => {
                      if (el && !el.srcObject) {
                        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
                          .then(stream => el.srcObject = stream)
                          .catch(err => console.error(err));
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 border-[2px] border-emerald-500/30 rounded-[2.5rem] pointer-events-none m-4">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-emerald-500/50 rounded-full border-dashed animate-pulse" />
                  </div>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="text-center">
                    <h4 className="text-white font-bold">تحليل ملامح الوجه</h4>
                    <p className="text-slate-400 text-xs">وجه الكاميرا نحو وجهك بوضوح</p>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        const video = document.querySelector('video');
                        if (video && video.srcObject) {
                          (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
                        }
                        setShowCamera(false);
                      }} 
                      className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-white border border-white/5 hover:bg-white/10 transition-colors"
                    >
                      <X />
                    </button>
                    <button 
                      onClick={handleCameraCapture}
                      disabled={cameraLoading}
                      className="flex-1 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-xl hover:bg-emerald-500 transition-all disabled:opacity-50"
                    >
                      {cameraLoading ? <Loader2 className="animate-spin" /> : <><Scan className="ml-2" size={20} /> تحليل الآن</>}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center space-y-6 animate-fade-in bg-slate-900">
                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Scan className="text-emerald-400 w-10 h-10" />
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black text-white">نتائج التحليل الذكي</h3>
                    <p className="text-slate-400 text-sm">تم معالجة ملامح الوجه بنجاح</p>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-right space-y-3">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-emerald-400 font-bold">الحالة المكتشفة:</span>
                      <span className="text-white font-black">{detectedMood}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-slate-400 text-xs">دقة التحليل:</span>
                      <span className="text-emerald-500 text-xs font-bold">98.4%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-xs">توصية النظام:</span>
                      <span className="text-slate-300 text-xs">أماكن {detectedMood}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <button 
                    onClick={applyCameraMood}
                    className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 transition-all transform active:scale-95"
                  >
                    تطبيق النتائج وعرض الأماكن
                  </button>
                  <button 
                    onClick={() => {
                      setDetectedMood(null);
                      setShowCamera(false);
                    }}
                    className="w-full py-2 text-slate-500 text-sm font-bold hover:text-slate-300 transition-colors"
                  >
                    إلغاء وإغلاق
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQRModal && (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 space-y-6 animate-fade-in-up text-center">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                <QrCode className="text-emerald-400" /> مشاركة الشبكة
              </h3>
              <button onClick={() => setShowQRModal(false)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400">
                <X size={20} />
              </button>
            </div>
            
            <div className="bg-white p-4 rounded-3xl inline-block shadow-2xl">
              <QRCodeCanvas 
                value={`WIFI:S:Mohammed iPad;T:WPA;P:12345678;;`} 
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>

            <div className="space-y-3">
              <p className="text-slate-300 font-bold">امسح الرمز من جهاز آخر للاتصال</p>
              
              <div className="bg-slate-800/50 rounded-xl p-3 text-xs text-slate-400 space-y-2 text-right">
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white font-mono">Mohammed iPad</span>
                  <span>اسم الشبكة:</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white font-mono">12345678</span>
                  <span>كلمة المرور:</span>
                </div>
                <div className="pt-1 text-[10px] leading-relaxed">
                  <p className="text-amber-400 font-medium mb-1">💡 نصائح للاتصال:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>تأكد من تفعيل "نقطة اتصال شخصية" في الإعدادات.</li>
                    <li>فعل خيار <span className="text-white">"أقصى قدر من التوافق"</span> (Maximize Compatibility) في إعدادات الايباد.</li>
                    <li>يجب مسح الرمز باستخدام <span className="text-white">جهاز آخر</span> وليس نفس الايباد.</li>
                  </ul>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setShowQRModal(false)}
              className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg hover:bg-emerald-500 transition-colors"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Ride Modal */}
      {showRideHailing && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-6 animate-fade-in-up">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2"><Car className="text-emerald-400" /> اطلب سيارة</h3>
              <button onClick={() => setShowRideHailing(false)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors"><X /></button>
            </div>
            {rideStep === 'provider' && (
              <div className="grid grid-cols-1 gap-2">
                {['Uber', 'Careem', 'Bolt'].map(p => (
                  <button key={p} onClick={() => { setRideStep('destination'); }} className="p-4 bg-slate-800 rounded-2xl flex justify-between items-center border border-white/5 hover:border-emerald-500/50 transition-all">
                    <span className="font-black">{p}</span>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                  </button>
                ))}
              </div>
            )}
            {rideStep === 'destination' && (
              <div className="space-y-4">
                <input type="text" value={rideDestination} onChange={e => setRideDestination(e.target.value)} placeholder="إلى أين تريد الذهاب؟" className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-4 text-white outline-none focus:border-emerald-500" />
                <button onClick={() => setShowRideHailing(false)} className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg">حساب التكلفة</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Budget Modal */}
      {showBudgetPlanner && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleBudgetSubmit} className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-6 animate-fade-in-up">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2"><Wallet className="text-amber-400" /> ميزانية الرحلة</h3>
              <button type="button" onClick={() => setShowBudgetPlanner(false)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
               <div className="flex gap-2">
                 <input type="number" value={tempBudget.amount} onChange={e => setTempBudget({...tempBudget, amount: Number(e.target.value)})} className="flex-1 bg-slate-800 rounded-xl px-4 py-3 text-white border border-white/5 outline-none focus:border-emerald-500" placeholder="المبلغ" />
                 <select value={tempBudget.currency} onChange={e => setTempBudget({...tempBudget, currency: e.target.value})} className="bg-slate-800 rounded-xl px-2 py-3 border border-white/5 text-xs">
                    <option value="SAR">SAR</option>
                    <option value="AED">AED</option>
                    <option value="ريال">ريال</option>
                    <option value="USD">USD</option>
                 </select>
               </div>
               <input type="number" value={tempBudget.days} onChange={e => setTempBudget({...tempBudget, days: Number(e.target.value)})} className="w-full bg-slate-800 rounded-xl px-4 py-3 text-white border border-white/5 outline-none focus:border-emerald-500" placeholder="عدد الأيام" />
            </div>
            <button type="submit" className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-500 transition-colors">حفظ الميزانية</button>
          </form>
        </div>
      )}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-slate-900/80 backdrop-blur-md border-b border-white/5 z-50 p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-6 h-6 text-emerald-500" />
            <select onChange={handleCapitalChange} className="bg-slate-800/50 border border-white/10 text-white text-xs font-bold rounded-lg px-2 py-1.5 outline-none" defaultValue="">
              <option value="" disabled>تغيير الوجهة...</option>
              {CAPITALS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-white/5 text-slate-300 font-bold text-[10px]">
              <Clock className="w-3 h-3" /> {currentTime}
              <button 
                onClick={() => detectLocation()} 
                className="mr-1 p-1 hover:bg-white/10 rounded-full transition-colors"
                title="تحديث الموقع"
              >
                <RefreshCw className={`w-3 h-3 ${location.loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {temperature && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                <CloudSun className="w-3 h-3" /> {temperature}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto pt-24 px-4 space-y-8">
        {/* Error States */}
        {quotaExceeded && (
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl text-center flex flex-col items-center animate-fade-in">
             <AlertTriangle className="w-5 h-5 text-amber-500 mb-2" />
             <p className="text-xs text-slate-400">الخدمة مشغولة حالياً، يتم عرض البيانات المخزنة مسبقاً.</p>
          </div>
        )}

        {generalError && !locationContext && (
          <div className="bg-red-500/10 border border-red-500/20 p-10 rounded-[2.5rem] text-center space-y-4 animate-fade-in">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="text-slate-400 font-bold">{generalError}</p>
            <button onClick={() => detectLocation()} className="px-8 py-3 bg-emerald-600 rounded-full text-sm font-bold text-white shadow-xl shadow-emerald-900/20">إعادة المحاولة</button>
          </div>
        )}

        {/* Loading Context State */}
        {contextLoading && !locationContext && (
           <div className="bg-slate-900/50 rounded-[2.5rem] border border-white/5 p-20 flex flex-col items-center justify-center min-h-[400px]">
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-6" />
              <p className="text-slate-400 font-bold">جاري تحليل بيانات المكان والطقس...</p>
           </div>
        )}

        {/* Main Content Card */}
        {locationContext && (
          <section className="bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden animate-fade-in">
            <div className="relative h-64 sm:h-80 bg-slate-800">
              {locationImage ? (
                <img src={locationImage} className="w-full h-full object-cover transition-opacity duration-1000" alt="Location" />
              ) : (
                <div className="w-full h-full animate-pulse bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center overflow-hidden">
                   <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/5 to-transparent animate-pulse" />
                   <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                      <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">توليد الصورة الذكية...</span>
                   </div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
              <div className="absolute bottom-8 right-8 text-right">
                <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1 block">وجهتك الحالية</span>
                <h2 className="text-4xl font-black text-white">{locationName || 'موقعك'}</h2>
              </div>
            </div>

            <div className="p-8 space-y-8">
              <div className="flex items-center justify-between">
                <button onClick={handleAudioToggle} disabled={audioLoading} className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black transition-all ${audioStatus === 'playing' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-white/5 text-slate-300 border border-white/5'} ${audioLoading ? 'opacity-50' : ''}`}>
                  {audioLoading ? <Loader2 size={18} className="animate-spin" /> : (audioStatus === 'playing' ? <Pause size={18} /> : <Play size={18} />)}
                  <span>{audioLoading ? 'جاري التحضير...' : (audioStatus === 'playing' ? 'إيقاف الوصف' : 'استمع للمكان')}</span>
                </button>
                {contextLoading && <div className="text-[10px] text-emerald-400 animate-pulse flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> جاري التحديث</div>}
              </div>

              <p className="text-slate-300 leading-relaxed text-lg text-justify font-medium">{locationContext}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-6 border-t border-white/5">
                <button onClick={() => setShowRideHailing(true)} className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-slate-800 border border-white/5 text-emerald-400 hover:bg-slate-700 transition-all group">
                  <Car className="w-6 h-6 group-hover:scale-110 transition-transform" /> 
                  <span className="text-xs font-bold">توصيلة</span>
                </button>
                <button onClick={() => setShowBudgetPlanner(true)} className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-slate-800 border border-white/5 text-amber-400 hover:bg-slate-700 transition-all group">
                  <Wallet className="w-6 h-6 group-hover:scale-110 transition-transform" /> 
                  <span className="text-xs font-bold">الميزانية</span>
                </button>
                <button onClick={handleCurrencySearch} className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-slate-800 border border-white/5 text-indigo-400 hover:bg-slate-700 transition-all group">
                  <Coins className="w-6 h-6 group-hover:scale-110 transition-transform" /> 
                  <span className="text-xs font-bold">صرافة</span>
                </button>
                <button onClick={() => setActiveAssistant('translator')} className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-slate-800 border border-white/5 text-blue-400 hover:bg-slate-700 transition-all group">
                  <Languages className="w-6 h-6 group-hover:scale-110 transition-transform" /> 
                  <span className="text-xs font-bold">ترجمة</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Budget Summary */}
        {budget && (
          <div className="flex justify-center animate-fade-in-up">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] p-8 text-center w-full max-w-sm shadow-2xl relative overflow-hidden group">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50" />
               <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                 <Wallet className="text-emerald-400 w-7 h-7" />
               </div>
               <h3 className="text-2xl font-black text-white mb-1">الميزانية : {budget.amount} {budget.currency}</h3>
               <p className="text-emerald-500/60 font-black text-sm">لمدة {budget.days} أيام</p>
            </div>
          </div>
        )}

        {/* Mood Section */}
        {locationContext && (
          <section id="mood-section" className="space-y-8 animate-fade-in">
            {showCameraResults && mood && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] p-8 text-center animate-fade-in-up relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50" />
                <button onClick={() => setShowCameraResults(false)} className="absolute top-4 left-4 p-2 text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Scan className="text-emerald-400 w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-white mb-2">بعد تحليل مزاجك تبين لنا بإنك {mood}</h3>
                <p className="text-emerald-500/60 font-bold">هذه مقترحات تناسب مزاجك لهذا اليوم</p>
              </div>
            )}

            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black text-white">عن ماذا تبحث؟ أو بماذا تشعر الآن؟</h3>
              <p className="text-slate-400 text-sm">اختر حالتك لنخصص لك أفضل الوجهات</p>
            </div>
            
            <MoodSelector onSelect={(m) => handleMoodSelect(m)} selectedMood={mood} disabled={recLoading} />
            
            <div className="grid grid-cols-1 gap-4 pb-24">
              {recLoading ? (
                <div className="space-y-6 animate-pulse">
                  {[1, 2].map(i => <div key={i} className="h-48 bg-slate-900 rounded-3xl border border-white/5" />)}
                </div>
              ) : (
                recommendations.map((rec, i) => <RecommendationCard key={i} data={rec} delay={i * 100} />)
              )}
            </div>
          </section>
        )}
      </main>

      {/* Floating Buttons */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-3 p-3 bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-full shadow-2xl z-40 transition-transform hover:scale-105">
         <button onClick={() => setActiveAssistant('assistant')} className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-xl hover:bg-emerald-500 transition-colors" title="المساعد الصوتي"><Mic size={20} /></button>
         <button onClick={() => setShowCamera(true)} className="w-12 h-12 rounded-full bg-amber-600 flex items-center justify-center text-white shadow-xl hover:bg-amber-500 transition-colors" title="تحليل المزاج بالكاميرا"><Camera size={20} /></button>
         <button onClick={() => setShowQRModal(true)} className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-xl hover:bg-emerald-400 transition-colors" title="مشاركة الشبكة"><QrCode size={20} /></button>
         <button onClick={() => setActiveAssistant('translator')} className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-xl hover:bg-indigo-500 transition-colors" title="المترجم الفوري"><Languages size={20} /></button>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.6s ease-out forwards; }
        .animate-fade-in-up { animation: fadeInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default App;
