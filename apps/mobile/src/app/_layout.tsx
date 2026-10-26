import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { FONT_FILES } from '@/theme/fonts';
import { textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const { scheme, colors } = useTheme();

  // Un attimo all'avvio; se i caratteri non si caricano si usa quello di sistema.
  if (!fontsLoaded && !fontError) return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: textStyles.section.fontFamily },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profilo" options={{ title: 'Profilo' }} />
        <Stack.Screen name="design" options={{ title: 'Componenti' }} />
      </Stack>
    </>
  );
}
