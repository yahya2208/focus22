import { useCallback, useEffect, useRef, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallPromptState {
  canInstall: boolean;
  isInstalled: boolean;
  install: () => Promise<boolean>;
  dismiss: () => void;
}

/**
 * Captures the browser `beforeinstallprompt` event and exposes a custom
 * install flow. Only active when the browser supports it and a deferred
 * prompt is actually available.
 */
export function useInstallPrompt(): InstallPromptState {
  const deferredEvent = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('onbeforeinstallprompt' in window)) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      deferredEvent.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    const onAppInstalled = () => {
      deferredEvent.current = null;
      setCanInstall(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const event = deferredEvent.current;
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') {
      deferredEvent.current = null;
      setCanInstall(false);
      setIsInstalled(true);
      return true;
    }
    return false;
  }, []);

  const dismiss = useCallback(() => {
    deferredEvent.current = null;
    setCanInstall(false);
  }, []);

  return { canInstall, isInstalled, install, dismiss };
}
