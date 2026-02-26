import { useState, useEffect } from 'react';
import { Theme, Spinner, Flex, Text } from '@radix-ui/themes';
import { AppProviders } from './contexts';
import { MainLayout } from './components/layout';
import { pluginLoader, pluginManagerService } from './services';
import { useTheme } from './contexts';

pluginLoader.initialize('light');
console.log('ApiQuest Desktop initialized');

function LoadingScreen() {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="4"
      style={{ height: '100vh', background: 'var(--color-background)' }}
    >
      <Spinner size="3" />
      <Text size="2" color="gray">
        Loading plugins...
      </Text>
    </Flex>
  );
}

function AppContent() {
  const { actualTheme } = useTheme();
  const [pluginsLoaded, setPluginsLoaded] = useState(pluginManagerService.arePluginsLoaded());
  
  useEffect(() => {
    if (!pluginsLoaded) {
      const handlePluginsLoaded = () => setPluginsLoaded(true);
      pluginManagerService.on('pluginsLoaded', handlePluginsLoaded);
      return () => {
        pluginManagerService.off('pluginsLoaded', handlePluginsLoaded);
      };
    }
  }, [pluginsLoaded]);
  
  if (!pluginsLoaded) {
    return <LoadingScreen />;
  }
  
  return (
    <Theme
      appearance={actualTheme === 'dark' ? 'dark' : 'light'}
      accentColor="indigo"
      grayColor="olive"
      radius="medium"
      scaling="95%"
    >
      <MainLayout />
    </Theme>
  );
}

export function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}
