import { SessionProvider } from "next-auth/react";
import { AuthProvider } from '@/context/AuthProvider';
import Navbar from '@/components/Navbar';
import type { AppProps } from 'next/app';
import '@/styles/globals.css';

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <SessionProvider session={session}>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <Component {...pageProps} />
        </div>
      </AuthProvider>
    </SessionProvider>
  );
} 