import { useEffect } from 'react';
import { getPwaManifestPath, type PwaSurfaceKey } from '../config/pwa';

const MANAGED_MANIFEST_ATTR = 'data-sc-pwa-manifest';
const MANAGED_MANIFEST_OWNER_ATTR = 'data-sc-pwa-manifest-owner';

const isManagedManifestLink = (link: HTMLLinkElement, surfaceKey: PwaSurfaceKey) => {
  const manifestPath = getPwaManifestPath(surfaceKey);

  try {
    return new URL(link.href, window.location.origin).pathname === manifestPath;
  } catch {
    return link.getAttribute('href') === manifestPath;
  }
};

const getExistingManifestLinks = () =>
  Array.from(document.querySelectorAll('link[rel="manifest"]')) as HTMLLinkElement[];

const safelyRemoveManifestLink = (link: HTMLLinkElement | null | undefined) => {
  if (!link || !link.isConnected) {
    return;
  }

  link.remove();
};

export const usePwaManifestLink = (surfaceKey: PwaSurfaceKey | null, enabled: boolean) => {
  useEffect(() => {
    if (typeof document === 'undefined' || !surfaceKey) {
      return;
    }

    const manifestPath = getPwaManifestPath(surfaceKey);
    const ownerToken = `${surfaceKey}:${manifestPath}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const existingLinks = getExistingManifestLinks();
    const managedLink = existingLinks.find((link) => isManagedManifestLink(link, surfaceKey)) || null;

    if (!enabled) {
      existingLinks
        .filter((link) =>
          isManagedManifestLink(link, surfaceKey)
          || link.getAttribute(MANAGED_MANIFEST_ATTR) === 'true'
        )
        .forEach((link) => safelyRemoveManifestLink(link));
      return;
    }

    existingLinks
      .filter((link) => link !== managedLink && link.getAttribute(MANAGED_MANIFEST_ATTR) === 'true')
      .forEach((link) => safelyRemoveManifestLink(link));

    const manifestLink = managedLink || document.createElement('link');

    manifestLink.setAttribute('rel', 'manifest');
    manifestLink.setAttribute('href', manifestPath);
    manifestLink.setAttribute(MANAGED_MANIFEST_ATTR, 'true');
    manifestLink.setAttribute(MANAGED_MANIFEST_OWNER_ATTR, ownerToken);

    if (!managedLink) {
      document.head.appendChild(manifestLink);
    }

    return () => {
      if (manifestLink.getAttribute(MANAGED_MANIFEST_OWNER_ATTR) === ownerToken) {
        safelyRemoveManifestLink(manifestLink);
      }
    };
  }, [enabled, surfaceKey]);
};
