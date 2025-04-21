import { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { AuthProvider } from '@/context/AuthProvider';
import Navbar from '@/components/Navbar';
import '@/styles/globals.css';

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {

  const safeSession = {
    user: pageProps.session?.user || null,
    expires: pageProps.session?.expires || null
  };

  return (
    <SessionProvider session={safeSession}>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <Component {...pageProps} />
        </div>
      </AuthProvider>
    </SessionProvider>
  );
}