import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Lang } from '../shared/types';

type LangState = { lang: Lang; setLang: (lang: Lang) => void };

const LangContext = createContext<LangState | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('bg');
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang(): LangState {
  const state = useContext(LangContext);
  if (!state) throw new Error('useLang must be used inside LangProvider');
  return state;
}
