import { Tabs, useRouter } from 'expo-router';
import { BottomTabBar } from 'expo-router/tabs';
import { View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { SearchDock } from '@/components/SearchDock';
import { textStyles } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

function tabIcon(name: IconName) {
  function TabIcon({ focused }: { focused: boolean }) {
    return <Icon name={name} color={focused ? 'text' : 'textSecondary'} />;
  }
  return TabIcon;
}

/**
 * Le quattro tab di docs/design.md. Ognuna disegna la sua intestazione (ScreenHeader, titolo
 * grande) al posto di quella nativa; il profilo si apre dall'intestazione di Oggi. La ricerca
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
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: textStyles.minimum.fontFamily },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Oggi',
          tabBarIcon: tabIcon('today'),
          tabBarButtonTestID: 'tab-oggi',
        }}
      />
      <Tabs.Screen
        name="piano"
        options={{ title: 'Piano', tabBarIcon: tabIcon('plan'), tabBarButtonTestID: 'tab-piano' }}
      />
      <Tabs.Screen
        name="dispensa"
        options={{
          title: 'Dispensa',
          tabBarIcon: tabIcon('pantry'),
          tabBarButtonTestID: 'tab-dispensa',
        }}
      />
      <Tabs.Screen
        name="andamento"
        options={{
          title: 'Andamento',
          tabBarIcon: tabIcon('trend'),
          tabBarButtonTestID: 'tab-andamento',
        }}
      />
    </Tabs>
  );
}
