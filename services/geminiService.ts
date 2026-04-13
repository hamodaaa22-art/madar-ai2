import { GoogleGenAI, Modality } from "@google/genai";
import { Mood, GeminiResponse, PlaceRecommendation, BudgetInfo } from '../types';

const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const MAIN_MODEL = "gemini-flash-latest"; 
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

/**
 * جلب بيانات الموقع والطقس باستخدام أدوات البحث
 */
export const fetchLocationContext = async (lat: number, lng: number): Promise<GeminiResponse> => {
  if (!apiKey) throw new Error("API Key is missing");

  const prompt = `
    أنا حالياً في الإحداثيات: (Lat: ${lat}, Lng: ${lng}).
    استخدم أدوات البحث والخرائط للحصول على:
    1. اسم الحي والمدينة بدقة (مثال: حي دبي مارينا، دبي).
    2. درجة الحرارة الحالية وحالة الطقس.
    3. وصف سياحي وجغرافي مختصر وجذاب للمنطقة.
    4. صغ وصفاً بصرياً مختصراً جداً باللغة الإنجليزية يصلح ليكون Prompt لمولد صور (مثال: Cinematic shot of Dubai Marina skyline at sunset).
    
    الرد يجب أن يكون بالعربية وبالتنسيق التالي:
    المكان: [الاسم]
    الحرارة: [الدرجة]
    الوصف: [النص العربي]
    بصري: [الوصف الإنجليزي]
  `;

  try {
    const response = await ai.models.generateContent({
      model: MAIN_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "أنت مساعد سفر ذكي. أجب باختصار ودقة وباللغة العربية، والوصف البصري بالإنجليزية.",
      }
    });

    const text = response.text || "";
    const nameMatch = text.match(/المكان:\s*(.+)/i);
    const tempMatch = text.match(/الحرارة:\s*(.+)/i);
    const descMatch = text.match(/الوصف:\s*([\s\S]+?)(?=\nبصري:|$)/i);
    const visualMatch = text.match(/بصري:\s*(.+)/i);

    if (!text) throw new Error("Empty response from AI");

    return {
      rawText: descMatch ? descMatch[1].trim() : text, 
      locationName: nameMatch ? nameMatch[1].trim() : "موقع غير معروف", 
      temperature: tempMatch ? tempMatch[1].trim() : "--",
      visualPrompt: visualMatch ? visualMatch[1].trim() : nameMatch?.[1] || "Famous city landmark",
    };
  } catch (error: any) {
    console.error("Gemini Context Error:", error);
    if (error.message?.includes('429')) throw new Error('429');
    if (error.message?.includes('expired') || error.message?.includes('INVALID_ARGUMENT')) {
      throw new Error('API_KEY_EXPIRED');
    }
    throw error;
  }
};

/**
 * توليد الصور الذكية للوجهات
 */
export const generateLocationImage = async (visualPrompt: string): Promise<string | null> => {
  if (!apiKey) return null;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: `${visualPrompt}, high quality, cinematic travel photography, 4k resolution, realistic lighting.`,
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error) { return null; }
};

/**
 * جلب توصيات الأماكن بناءً على المزاج والميزانية
 */
export const fetchRecommendations = async (
  lat: number, 
  lng: number, 
  mood: Mood, 
  locationContext: string,
  budget?: BudgetInfo | null
): Promise<GeminiResponse> => {
  if (!apiKey) throw new Error("API Key is missing");

  const budgetPrompt = budget 
    ? `الميزانية: ${budget.amount} ${budget.currency} لـ ${budget.days} أيام.`
    : "الميزانية مفتوحة.";

  const prompt = `
    الموقع: ${locationContext}. المزاج: "${mood}". ${budgetPrompt}
    اقترح 3 أماكن قريبة جداً للإحداثيات ${lat}, ${lng}.
    أجب بصيغة JSON:
    [ { "title": "...", "description": "...", "activityType": "...", "reason": "..." } ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: MAIN_MODEL,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    return { recommendations: JSON.parse(response.text || "[]") };
  } catch (error: any) {
    console.error("Recommendations Error:", error);
    if (error.message?.includes('expired') || error.message?.includes('INVALID_ARGUMENT')) {
      throw new Error('API_KEY_EXPIRED');
    }
    throw error;
  }
};

/**
 * تحويل النص إلى كلام (Audio Generation) - يدعم المترجم والمساعد
 */
export const generateArabicSpeech = async (text: string): Promise<string | null> => {
  if (!apiKey) return null;
  try {
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text: text.substring(0, 300) }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) { 
    console.error("TTS Error:", error);
    return null; 
  }
};

export const fetchCurrencyExchange = async (lat: number, lng: number): Promise<PlaceRecommendation[]> => {
  return [{ title: "مكتب صرافة قريب", description: "موقع موثوق لتحويل العملات بالقرب منك.", activityType: "صرافة", reason: "الأقرب جغرافياً" }];
}

/**
 * تحليل الحالة المزاجية من صورة الكاميرا
 */
export const analyzeMoodFromImage = async (base64Image: string): Promise<Mood | null> => {
  if (!apiKey) return null;
  
  const prompt = `
    حلل ملامح الوجه في هذه الصورة وحدد الحالة المزاجية للشخص.
    يجب أن تختار واحدة فقط من الحالات التالية:
    - هادئ ومسترخي
    - مغامر ونشيط
    - جائع وأبحث عن تجربة
    - شغوف بالتاريخ والثقافة
    - اجتماعي
    - مستقل وأريد الهدوء
    أجب فقط باسم الحالة المزاجية المذكورة.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MAIN_MODEL,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image
              }
            }
          ]
        }
      ]
    });

    const detectedText = response.text?.trim() || "";
    const moodValues = Object.values(Mood);
    const matchedMood = moodValues.find(m => detectedText.includes(m));
    
    return (matchedMood as Mood) || null;
  } catch (error: any) {
    console.error("Mood Analysis Error:", error);
    if (error.message?.includes('expired') || error.message?.includes('INVALID_ARGUMENT')) {
      throw new Error('API_KEY_EXPIRED');
    }
    return null;
  }
};