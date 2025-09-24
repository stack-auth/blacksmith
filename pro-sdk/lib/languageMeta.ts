import {
  Code2,
  Coffee,
  FileCode2,
  Flame,
  Gem,
  Globe,
  Hash,
  Sailboat,
  Sparkles,
  TerminalSquare,
  Wrench
} from 'lucide-react';
import type { ComponentType } from 'react';

export interface LanguageVisual {
  icon: ComponentType<{ className?: string }>;
  accent: string;
}

const registry: Record<string, LanguageVisual> = {
  english: { icon: Globe, accent: '#38bdf8' },
  javascript: { icon: FileCode2, accent: '#facc15' },
  python: { icon: TerminalSquare, accent: '#38bdf8' },
  java: { icon: Coffee, accent: '#f97316' },
  csharp: { icon: Hash, accent: '#a855f7' },
  cpp: { icon: Wrench, accent: '#60a5fa' },
  ruby: { icon: Gem, accent: '#f87171' },
  go: { icon: Sailboat, accent: '#34d399' },
  rust: { icon: Wrench, accent: '#f59e0b' },
  swift: { icon: Flame, accent: '#fb7185' },
  kotlin: { icon: Sparkles, accent: '#818cf8' }
};

const fallback: LanguageVisual = { icon: Code2, accent: '#3b82f6' };

export function getLanguageVisual(languageId: string): LanguageVisual {
  return registry[languageId.toLowerCase()] ?? fallback;
}
