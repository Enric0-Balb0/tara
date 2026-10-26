import { useFonts } from 'expo-font';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { FONT_FILES } from '@/theme/fonts';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);

  // Un attimo all'avvio; se i caratteri non si caricano si usa quello di sistema.
  if (!fontsLoaded && !fontError) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Tabs screenOptions={{ headerTitleAlign: 'center' }}>
        <Tabs.Screen name="index" options={{ title: 'Oggi' }} />
        <Tabs.Screen name="alimenti" options={{ title: 'Alimenti' }} />
        <Tabs.Screen name="progressi" options={{ title: 'Progressi' }} />
        <Tabs.Screen name="profilo" options={{ title: 'Profilo' }} />
      </Tabs>
    </>
  );
}
