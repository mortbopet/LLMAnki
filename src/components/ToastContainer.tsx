import { Toaster } from 'sonner';

export const ToastContainer: React.FC = () => {
    return (
        <Toaster
            position="top-right"
            theme="dark"
            richColors
            closeButton
            toastOptions={{
                duration: 5000,
                className: 'bg-gray-800 border-gray-700',
            }}
        />
    );
};
