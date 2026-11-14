package com.yqxyy.english;

import java.net.URI;
import java.util.Locale;

/**
 * Conservative ad-network and unwanted-navigation filtering. Never match
 * a hostname substring: video CDN hosts must continue loading normally.
 *
 * This is not a promise to remove in-stream video ads or ads drawn inside
 * another website's cross-origin iframe.
 */
public final class PlayerAdGuard {
    private PlayerAdGuard() { }

    private static final String[] AD_HOSTS = {
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "adservice.google.com",
        "adnxs.com",
        "popads.net",
        "popcash.net",
        "propellerads.com",
        "onclickads.net",
        "exoclick.com",
        "exosrv.com",
        "adsterra.com",
        "hilltopads.net",
        "realsrv.com",
        "trafficjunky.net",
        "adscore.com",
        "clickadu.com",
        "popmyads.com",
        "a-ads.com",
        "ad-maven.com"
    };

    public static boolean isKnownAdHost(String host) {
        if (host == null || host.isEmpty()) return false;
        String normalized = host.toLowerCase(Locale.ROOT);
        for (String adHost : AD_HOSTS) {
            if (normalized.equals(adHost) || normalized.endsWith("." + adHost)) return true;
        }
        return false;
    }

    public static boolean isPlayerPage(String url) {
        if (url == null) return false;
        try {
            String fragment = URI.create(url).getFragment();
            if (fragment == null) return false;
            return fragment.startsWith("/movie/") || fragment.startsWith("/movie-hub/");
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    /** Never pass non-http intent/javaScript URLs to external browsers. */
    public static boolean canOpenExternalScheme(String scheme) {
        return "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme);
    }
}
