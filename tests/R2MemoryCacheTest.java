package com.yqxyy.english;

import java.util.Arrays;

public final class R2MemoryCacheTest {
    public static void main(String[] args) {
        R2MemoryCache.clearForTests();
        byte[] first = new byte[]{1, 2, 3};
        R2MemoryCache.put("/data/quiz.json", first, "application/json", 1_000L);
        first[0] = 99;
        R2MemoryCache.Entry cached = R2MemoryCache.get("/data/quiz.json", 1_001L);
        check(cached != null, "entry should be cached");
        check(Arrays.equals(cached.copyBody(), new byte[]{1, 2, 3}),
            "cache must own an immutable copy");
        byte[] returned = cached.copyBody();
        returned[0] = 88;
        check(cached.copyBody()[0] == 1, "callers must not mutate cached bytes");
        check(R2MemoryCache.get("/data/quiz.json", 61_000L) == null,
            "entry should expire after 60 seconds");

        R2MemoryCache.clearForTests();
        byte[] oneMb = new byte[R2MemoryCache.MAX_ENTRY_BYTES];
        for (int i = 0; i < 8; i++)
            R2MemoryCache.put("/data/" + i + ".json", oneMb, "application/json", 2_000L);
        check(R2MemoryCache.get("/data/0.json", 2_001L) != null,
            "oldest entry should initially exist");
        R2MemoryCache.get("/data/1.json", 2_001L); // refresh LRU order
        R2MemoryCache.put("/data/new.json", oneMb, "application/json", 2_002L);
        check(R2MemoryCache.get("/data/0.json", 2_003L) == null,
            "least-recently-used entry should be evicted");
        check(R2MemoryCache.get("/data/1.json", 2_003L) != null,
            "recently accessed entry should remain");
        check(R2MemoryCache.get("/data/new.json", 2_003L) != null,
            "new entry should remain");

        R2MemoryCache.put("/data/oversize.json",
            new byte[R2MemoryCache.MAX_ENTRY_BYTES + 1], "application/json", 3_000L);
        check(R2MemoryCache.get("/data/oversize.json", 3_001L) == null,
            "oversized entries must not be cached");

        System.out.println("R2MemoryCacheTest: OK");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
