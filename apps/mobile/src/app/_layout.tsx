import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { CatalogProvider } from '@/data/CatalogProvider';
import { initDatabase } from '@/data/schema';
import { FONT_FILES } from '@/theme/fonts';
import { textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const { scheme, colors } = useTheme();

  // Un attimo all'avvio; se i caratteri non si caricano si usa quello di sistema.
  if (!fontsLoaded && !fontError) return null;

  // Il database si apre e si migra prima della prima schermata; il catalogo si controlla
  // con il server subito dopo, senza bloccare l'app.
  return (
    <SQLiteProvider databaseName="tara.db" onInit={initDatabase}>
      <CatalogProvider>
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
          <Stack.Screen name="cerca" options={{ title: 'Cerca un alimento' }} />
          <Stack.Screen name="alimento/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="design" options={{ title: 'Componenti' }} />
        </Stack>
      </CatalogProvider>
    </SQLiteProvider>
  );
}
