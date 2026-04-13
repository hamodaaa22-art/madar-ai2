import React from 'react';
import { PlaceRecommendation } from '../types';
import { MapPin, Info, Share2, Check } from 'lucide-react';

interface Props {
  data: PlaceRecommendation;
  delay: number;
}

const RecommendationCard: React.FC<Props> = ({ data, delay }) => {
  const [copied, setCopied] = React.useState(false);

  // Create a Google Maps search URL using the place title
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.title)}`;

  const handleShare = async () => {
    const shareData = {
      title: `اقتراح من مَـدار AI: ${data.title}`,
      text: `انظر لهذا المكان الرائع: ${data.title}\n${data.description}\n\n${data.reason}`,
      url: mapUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback for browsers that don't support share API
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  return (
    <div 
      className="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-lg transform transition-all duration-500 hover:scale-[1.02] animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="bg-indigo-500/20 text-indigo-300 text-xs px-2 py-1 rounded-full border border-indigo-500/30">
          {data.activityType}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg transition-all active:scale-95 text-xs font-bold border border-slate-600"
            aria-label="مشاركة الاقتراح"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? 'تم النسخ' : 'مشاركة'}</span>
          </button>

          <a 
            href={mapUrl}
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-all shadow-lg shadow-emerald-900/20 active:scale-95 text-xs font-bold"
            aria-label="فتح في خرائط جوجل"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>الموقع</span>
          </a>
        </div>
      </div>
      
      <h4 className="text-xl font-bold text-white mb-2">{data.title}</h4>
      <p className="text-slate-300 text-sm mb-4 leading-relaxed">
        {data.description}
      </p>
      
      <div className="flex items-start gap-2 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
        <Info className="w-4 h-4 text-emerald-400 mt-1 flex-shrink-0" />
        <p className="text-xs text-slate-400">
          <span className="text-emerald-400 font-medium">لماذا يناسبك: </span>
          {data.reason}
        </p>
      </div>
    </div>
  );
};

export default RecommendationCard;