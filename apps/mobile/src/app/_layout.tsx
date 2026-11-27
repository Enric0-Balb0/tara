import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { CatalogProvider } from '@/data/CatalogProvider';
import { initDatabase } from '@/data/schema';
import { SessionProvider, useSession } from '@/data/SessionProvider';
import { FONT_FILES } from '@/theme/fonts';
import { textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const { scheme } = useTheme();

  // Un attimo all'avvio; se i caratteri non si caricano si usa quello di sistema.
  if (!fontsLoaded && !fontError) return null;

  // Il database si apre e si migra prima della prima schermata; il catalogo si controlla
  // con il server subito dopo, senza bloccare l'app. Il catalogo sta sopra l'accesso: il
  // download parte mentre si inserisce l'email, così intanto il backend si sveglia.
  return (
    <SQLiteProvider databaseName="tara.db" onInit={initDatabase}>
      <CatalogProvider>
        <SessionProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Screens />
        </SessionProvider>
      </CatalogProvider>
    </SQLiteProvider>
  );
}

/** Tutta l'app è chiusa finché non si accede (RNF-04); da fuori si vede solo l'accesso. */
function Screens() {
  const { colors } = useTheme();
  const { session } = useSession();
  const signedIn = session !== null;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: textStyles.section.fontFamily },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profilo" options={{ title: 'Profilo' }} />
        <Stack.Screen name="pasti" options={{ headerShown: false }} />
        <Stack.Screen name="cerca" options={{ title: 'Cerca un alimento' }} />
        <Stack.Screen name="alimento/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="nuovo-alimento" options={{ headerShown: false }} />
        <Stack.Screen name="ricetta" options={{ headerShown: false }} />
        <Stack.Screen name="pasto/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="design" options={{ title: 'Componenti' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="accesso" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
