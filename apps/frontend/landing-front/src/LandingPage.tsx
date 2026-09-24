import { useConfig } from './config/ConfigProvider';
import PageFrame from './components/PageFrame';
import Hero from './components/Hero';
import Showcase from './components/Showcase';
import FromYourScript from './components/FromYourScript';
import OnYourPhone from './components/OnYourPhone';
import Assistant from './components/Assistant';
import OpenSource from './components/OpenSource';

function LandingPage() {
  const config = useConfig();
  const appUrl = config.SHELL_FRONT_URL || '#';

  return (
    <PageFrame>
      <Hero appUrl={appUrl} />
      <Showcase />
      <FromYourScript />
      <OnYourPhone />
      <Assistant />
      <OpenSource />
    </PageFrame>
  );
}

export default LandingPage;
