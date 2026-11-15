package com.yqxyy.english;

import java.net.URI;

/** Prevent a same-origin /data/ lookup from escaping the R2 public data prefix. */
final class R2PathPolicy {
    private R2PathPolicy() {}

    static boolean allowed(String encodedPath) {
        if (encodedPath == null || !encodedPath.startsWith("/data/") ||
            encodedPath.length() > 2048 || encodedPath.indexOf('?') >= 0 ||
            encodedPath.indexOf('#') >= 0 || encodedPath.indexOf('\\') >= 0) return false;
        try {
            URI uri = URI.create("https://local.invalid" + encodedPath);
            if (uri.getRawQuery() != null || uri.getRawFragment() != null) return false;
            String decoded = uri.getPath();
            if (decoded == null || !decoded.startsWith("/data/") ||
                decoded.indexOf('\\') >= 0) return false;
            String[] parts = decoded.substring(1).split("/", -1);
            for (String part : parts) {
                if (part.isEmpty() || ".".equals(part) || "..".equals(part)) return false;
                for (int i = 0; i < part.length(); i++) {
                    char c = part.charAt(i);
                    if (c < 32 || c == 127) return false;
                }
            }
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }
}
