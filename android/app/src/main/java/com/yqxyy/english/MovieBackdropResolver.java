package com.yqxyy.english;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * APK-only implementation of the movie-backdrop lookup.
 *
 * The app bundles its frontend files. Try a native, public-source landscape
 * lookup first; if it has no valid match, let WebView use the yqxxyy website
 * function that the PC frontend already uses (official TMDB then public
 * fallbacks). Never mask that working route with an empty native response.
 *
 * Never return a backdrop unless the numeric TMDB ID and movie/TV type match,
 * and never return an arbitrary image host.
 */
final class MovieBackdropResolver {
    private static final String API_PATH = "/.netlify/functions/movie-backdrop";
    private static final String SEARCH = "https://streamjuju.cyou/api/search";
    private MovieBackdropResolver() {}

    static WebResourceResponse intercept(WebResourceRequest request, String appHost) {
        if (request == null || appHost == null) return null;
        Uri uri = request.getUrl();
        if (!"https".equalsIgnoreCase(uri.getScheme()) ||
                !appHost.equalsIgnoreCase(uri.getHost()) ||
                !API_PATH.equals(uri.getPath())) return null;

        // Never fall through to Netlify, including for invalid parameters.
        if (!"GET".equalsIgnoreCase(request.getMethod()))
            return reply(null);

        String rawId = uri.getQueryParameter("id");
        String mediaType = uri.getQueryParameter("type");
        String title = uri.getQueryParameter("title");
        if (rawId == null || !rawId.matches("[1-9][0-9]{0,9}") ||
                !("movie".equals(mediaType) || "tv".equals(mediaType)) ||
                title == null || title.isEmpty() || title.length() > 160)
            return reply(null);
        try {
            long id = Long.parseLong(rawId);
            String image = searchExactBackdrop(id, mediaType, title);
            if (image != null) return reply(image);
        } catch (Exception ignored) {
            // Local metadata provider may be blocked or missing this backdrop.
            // Do not replace the working website endpoint with {"url":null}.
        }
        // The new yqxxyy production website can resolve the same title via
        // official TMDB credentials or the public TMDB title-page fallback.
        // Returning null tells WebView to request that normal HTTPS endpoint.
        return null;
    }

    private static String searchExactBackdrop(long tmdbId, String type, String title) throws Exception {
        URL url = new URL(SEARCH + "?q=" + java.net.URLEncoder.encode(title, "UTF-8"));
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        try {
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/json");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return null;

            byte[] bytes;
            try (InputStream input = connection.getInputStream();
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[8192];
                int amount;
                while ((amount = input.read(chunk)) != -1) {
                    if (output.size() + amount > 512 * 1024) return null;
                    output.write(chunk, 0, amount);
                }
                bytes = output.toByteArray();
            }
            JSONObject data = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            JSONArray results = data.optJSONArray("results");
            if (results == null) return null;
            for (int i = 0; i < results.length() && i < 100; ++i) {
                JSONObject movie = results.optJSONObject(i);
                if (movie == null || movie.optLong("id", -1) != tmdbId ||
                        !type.equals(movie.optString("media_type", ""))) continue;
                String path = movie.optString("backdrop_path", "");
                if (!path.matches("/[A-Za-z0-9_-]+[.](?:jpg|jpeg|png|webp)"))
                    return null;
                return "https://image.tmdb.org/t/p/w1280" + path;
            }
            return null;
        } finally {
            connection.disconnect();
        }
    }

    private static WebResourceResponse reply(String url) {
        JSONObject result = new JSONObject();
        try {
            result.put("url", url == null ? JSONObject.NULL : url);
            result.put("source", "android-native");
        } catch (org.json.JSONException ignored) {}
        WebResourceResponse response = new WebResourceResponse(
                "application/json", "UTF-8",
                new ByteArrayInputStream(result.toString().getBytes(StandardCharsets.UTF_8)));
        response.setStatusCodeAndReasonPhrase(200, "OK");
        response.setResponseHeaders(Collections.singletonMap("Cache-Control", "no-store"));
        return response;
    }
}
