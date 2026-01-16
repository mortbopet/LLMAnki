import { toast } from 'sonner';

interface ToastOptions {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

// Wrapper around Sonner's toast to maintain compatibility with existing code
export const addToast = (options: ToastOptions) => {
  const { type, title, message } = options;
  const description = message;
  
  switch (type) {
    case 'success':
      toast.success(title, { description });
      break;
    case 'error':
      toast.error(title, { description });
      break;
    case 'warning':
      toast.warning(title, { description });
      break;
    case 'info':
      toast.info(title, { description });
      break;
    default:
      toast(title, { description });
  }
};

// For backwards compatibility with components using useToastStore hook pattern
// Usage: const addToast = useToastStore(state => state.addToast);
// After: const { addToast } = useToastStore();
export const useToastStore = (): { addToast: typeof addToast } => ({
  addToast
});
