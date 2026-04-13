
export interface GeoLocationState {
  lat: number | null;
  lng: number | null;
  error: string | null;
  loading: boolean;
}

export enum Mood {
  RELAXED = 'هادئ ومسترخي',
  ADVENTUROUS = 'مغامر ونشيط',
  HUNGRY = 'جائع وأبحث عن تجربة',
  CULTURAL = 'شغوف بالتاريخ والثقافة',
  SOCIAL = 'اجتماعي',
  SOLO = 'مستقل وأريد الهدوء'
}

export interface BudgetInfo {
  amount: number;
  days: number;
  currency: string;
}

export interface PlaceRecommendation {
  title: string;
  description: string;
  activityType: string;
  reason: string;
}

export interface LocationContextData {
  summary: string;
  weatherVibe: string;
  culturalNote: string;
}

export interface GeminiResponse {
  context?: LocationContextData;
  recommendations?: PlaceRecommendation[];
  rawText?: string;
  groundingLinks?: Array<{ title: string; uri: string }>;
  locationName?: string;
  temperature?: string;
  visualPrompt?: string;
}
