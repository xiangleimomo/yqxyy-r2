package com.yqxyy.english;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Small, bounded, process-local cache for public R2 JSON objects.
 * Dynamic course indexes expire quickly so newly published lessons appear
 * without requiring an app restart or a manual cache clear.
 */
final class R2MemoryCache {
    static final long TTL_MILLIS = 60_000L;
    static final int MAX_ENTRY_BYTES = 1024 * 1024;
    static final int MAX_TOTAL_BYTES = 8 * 1024 * 1024;

    private static final LinkedHashMap<String, Entry> ENTRIES =
        new LinkedHashMap<>(16, 0.75f, true);
    private static int totalBytes;

    private R2MemoryCache() {}

    static synchronized Entry get(String key, long nowMillis) {
        Entry entry = ENTRIES.get(key);
        if (entry == null) return null;
        if (nowMillis >= entry.expiresAtMillis) {
            remove(key);
            return null;
        }
        return entry;
    }

    static synchronized void put(String key, byte[] body, String mime, long nowMillis) {
        if (key == null || body == null || body.length == 0 ||
            body.length > MAX_ENTRY_BYTES) return;

        remove(key);
        while (totalBytes + body.length > MAX_TOTAL_BYTES && !ENTRIES.isEmpty()) {
            Iterator<Map.Entry<String, Entry>> iterator = ENTRIES.entrySet().iterator();
            Map.Entry<String, Entry> eldest = iterator.next();
            totalBytes -= eldest.getValue().sizeBytes();
            iterator.remove();
        }
        ENTRIES.put(key, new Entry(body, mime, nowMillis + TTL_MILLIS));
        totalBytes += body.length;
    }

    static synchronized void clearForTests() {
        ENTRIES.clear();
        totalBytes = 0;
    }

    private static void remove(String key) {
        Entry removed = ENTRIES.remove(key);
        if (removed != null) totalBytes -= removed.sizeBytes();
    }

    static final class Entry {
        private final byte[] body;
        final String mime;
        final long expiresAtMillis;

        Entry(byte[] body, String mime, long expiresAtMillis) {
            this.body = body.clone();
            this.mime = mime;
            this.expiresAtMillis = expiresAtMillis;
        }

        byte[] copyBody() { return body.clone(); }
        int sizeBytes() { return body.length; }
    }
}
