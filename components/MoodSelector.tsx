import React from 'react';
import { Mood } from '../types';
import { Coffee, Map, Utensils, BookOpen, Users, User } from 'lucide-react';

interface MoodSelectorProps {
  onSelect: (mood: Mood) => void;
  selectedMood: Mood | null;
  disabled: boolean;
}

const moods = [
  { type: Mood.RELAXED, icon: Coffee, label: "هادئ" },
  { type: Mood.ADVENTUROUS, icon: Map, label: "مغامر" },
  { type: Mood.HUNGRY, icon: Utensils, label: "جائع" },
  { type: Mood.CULTURAL, icon: BookOpen, label: "مثقف" },
  { type: Mood.SOCIAL, icon: Users, label: "اجتماعي" },
  { type: Mood.SOLO, icon: User, label: "مستقل" },
];

const MoodSelector: React.FC<MoodSelectorProps> = ({ onSelect, selectedMood, disabled }) => {
  return (
    <div className="w-full">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {moods.map((item) => {
          const Icon = item.icon;
          const isSelected = selectedMood === item.type;
          return (
            <button
              key={item.label}
              onClick={() => onSelect(item.type)}
              disabled={disabled}
              className={`
                relative flex flex-col items-center justify-center p-4 rounded-xl border transition-all
                ${isSelected 
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' 
                  : 'bg-slate-800/50 border-white/5 text-slate-400 hover:bg-slate-800'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
              `}
            >
              <Icon className={`w-8 h-8 mb-2 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="font-semibold text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MoodSelector;