package com.yqxyy.english;

public final class R2PathPolicyTest {
    private static void expect(String path, boolean valid) {
        if (R2PathPolicy.allowed(path) != valid) {
            throw new AssertionError("R2 path policy disagrees for: " + path);
        }
    }
    public static void main(String[] args) {
        expect("/data/series-list.json", true);
        expect("/data/s01/subtitles/001.vtt", true);
        expect("/data/%E4%B8%89%E5%9B%BD/episodes.json", true);
        expect("/data/movies/part-1/master.m3u8", true);
        expect("/data/", false);
        expect("/data//series.json", false);
        expect("/data/../secret", false);
        expect("/data/%2e%2e/secret", false);
        expect("/data/%2F..%2Fsecret", false);
        expect("/data/file%00.json", false);
        expect("/data/c%5ctoken", false);
        expect("/data/file?key=1", false);
        expect("/not-data/x.json", false);
        System.out.println("PASS: direct R2 path policy protects learning resource prefix.");
    }
}
