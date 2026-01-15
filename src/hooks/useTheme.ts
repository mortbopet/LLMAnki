import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Hook to apply the theme class to the document based on the darkMode setting.
 * This should be called once at the app level.
 */
export function useTheme() {
    const darkMode = useAppStore(state => state.llmConfig.darkMode ?? true);

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    return darkMode;
}
