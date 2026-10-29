import { Link, Tabs, useRouter } from 'expo-router';
import { BottomTabBar } from 'expo-router/tabs';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { SearchDock } from '@/components/SearchDock';
import { touch } from '@/theme/layout';
import { textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

function tabIcon(name: IconName) {
  function TabIcon({ focused }: { focused: boolean }) {
    return <Icon name={name} color={focused ? 'text' : 'textSecondary'} />;
  }
  return TabIcon;
}

function ProfileButton() {
  return (
    <Link href="/profilo" asChild>
      <PressableScale accessibilityLabel="Profilo" style={styles.headerButton}>
        <Icon name="profile" color="text" />
      </PressableScale>
    </Link>
  );
}

/**
 * Le quattro tab di docs/design.md; il profilo si apre dall'intestazione di Oggi. La ricerca
 * sta sopra le tab, a un tocco da ogni schermata; lo scanner arriva in F1 (RF-10).
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Tabs
      tabBar={(props) => (
        <View>
          <SearchDock onSearch={() => router.push('/cerca')} />
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: textStyles.section.fontFamily },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: textStyles.minimum.fontFamily },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Oggi', tabBarIcon: tabIcon('today'), headerRight: ProfileButton }}
      />
      <Tabs.Screen name="piano" options={{ title: 'Piano', tabBarIcon: tabIcon('plan') }} />
      <Tabs.Screen name="dispensa" options={{ title: 'Dispensa', tabBarIcon: tabIcon('pantry') }} />
      <Tabs.Screen
        name="andamento"
        options={{ title: 'Andamento', tabBarIcon: tabIcon('trend') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
