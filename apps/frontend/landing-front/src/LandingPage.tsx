import { useEffect } from 'react';
import { useConfig } from './config/ConfigProvider';
import PageFrame from './components/PageFrame';
import Hero from './components/Hero';
import LeaderboardPreview from './components/LeaderboardPreview';
import Showcase from './components/Showcase';
import FromYourScript from './components/FromYourScript';
import OnYourPhone from './components/OnYourPhone';
import Assistant from './components/Assistant';
import OpenSource from './components/OpenSource';

function LandingPage() {
  const config = useConfig();
  const appUrl = config.SHELL_FRONT_URL || '#';

  // A link from the docs (or a bookmark) to `/about#product` loads this page fresh, and the
  // section does not exist yet when the browser looks for it: scroll to it once it does.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView?.();
  }, []);

  return (
    <PageFrame>
      <Hero appUrl={appUrl} />
      <Showcase />
      <LeaderboardPreview />
      <FromYourScript />
      <OnYourPhone />
      <Assistant />
      <OpenSource />
    </PageFrame>
  );
}

export default LandingPage;
