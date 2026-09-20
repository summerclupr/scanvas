import { Stack, router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useTheme } from '@/components/kit';
import { AppProvider, useApp } from '@/state/app-store';
import { configureNotificationHandler } from '@/notify/schedule';

configureNotificationHandler();

/**
 * Web branding at runtime. The root HTML template (+html.tsx) carries the
 * title and icons for fresh loads and static export; this covers a dev
 * server that was started before the template existed, and any navigation
 * that leaves the document title blank.
 */
function useWebBranding() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = 'Scanvas';
    if (!document.querySelector('link[rel~="icon"]')) {
      for (const [sizes, href] of [
        ['64x64', '/favicon.png'],
        ['192x192', '/favicon-192.png'],
      ]) {
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        link.setAttribute('sizes', sizes);
        link.href = href;
        document.head.appendChild(link);
      }
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = '#3D7BFF';
      document.head.appendChild(meta);
    }
  }, []);
}

/**
 * Gates the app behind onboarding. Rendering nothing until `ready` avoids a
 * flash of the agenda before we know whether a profile exists.
 */
function Gate({ children }: { children: React.ReactNode }) {
  const { ready, profile } = useApp();
  const pathname = usePathname();
  const c = useTheme();

  useEffect(() => {
    if (!ready) return;
    const onboarding = pathname.startsWith('/onboarding');
    if (!profile.completedOnboarding && !onboarding) {
      router.replace('/onboarding');
    } else if (profile.completedOnboarding && onboarding) {
      router.replace('/');
    }
  }, [ready, profile.completedOnboarding, pathname]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return <>{children}</>;
}

export default function RootLayout() {
  useWebBranding();
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="auto" />
        <Gate>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          </Stack>
        </Gate>
      </AppProvider>
    </SafeAreaProvider>
  );
}
