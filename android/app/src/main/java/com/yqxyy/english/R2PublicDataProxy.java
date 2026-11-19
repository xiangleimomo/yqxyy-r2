package com.yqxyy.english;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * APK-owned read-only R2 proxy. A WebView request for /data/... stays
 * same-origin from the page's perspective but the network connection goes
 * straight to the public Cloudflare R2 object host, never Netlify.
 *
 * No S3 API credentials are included in the APK. Works without R2 CORS
 * because Android returns the stream as a same-origin WebResourceResponse.
 */
final class R2PublicDataProxy {
    private R2PublicDataProxy() {}

    static WebResourceResponse intercept(WebResourceRequest request, String appHost) {
        if (request == null || appHost == null) return null;
        Uri uri = request.getUrl();
        if (!"https".equalsIgnoreCase(uri.getScheme()) ||
            !appHost.equalsIgnoreCase(uri.getHost())) return null;
        String path = uri.getEncodedPath();
        if (path == null || !path.startsWith("/data/")) return null;
        if (!R2PathPolicy.allowed(path)) return failure(400, "Invalid R2 object path");
        String method = request.getMethod();
        if (!"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method))
            return failure(405, "Read only");

        String rangeHeader = request.getRequestHeaders().get("Range");
        boolean cacheableJson = "GET".equalsIgnoreCase(method) &&
            path.endsWith(".json") && (rangeHeader == null || rangeHeader.isEmpty());
        if (cacheableJson) {
            R2MemoryCache.Entry cached = R2MemoryCache.get(path, System.currentTimeMillis());
            if (cached != null) return cachedJson(cached);
        }

        HttpURLConnection connection = null;
        try {
            String base = BuildConfig.R2_DATA_ORIGIN;
            // Host is fixed at build-time and validated by Gradle.
            URL url = new URL(base + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method);
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("Accept-Encoding", "identity");
            for (String header : new String[]{"Range", "If-Range"}) {
                String value = request.getRequestHeaders().get(header);
                if (value != null && value.length() <= 180)
                    connection.setRequestProperty(header, value);
            }
            int status = connection.getResponseCode();
            if (status != 200 && status != 206) {
                connection.disconnect();
                return failure(status == 404 ? 404 : status == 416 ? 416 : 503,
                    status == 404 ? "R2 object not found" : "R2 temporarily unavailable");
            }

            String type = mime(path, connection.getContentType());
            long contentLength = connection.getContentLengthLong();
            if (cacheableJson && "application/json".equals(type) &&
                contentLength > 0 && contentLength <= R2MemoryCache.MAX_ENTRY_BYTES) {
                InputStream source = connection.getInputStream();
                ByteArrayOutputStream output = new ByteArrayOutputStream((int) contentLength);
                byte[] buffer = new byte[8192];
                int amount;
                while ((amount = source.read(buffer)) != -1) {
                    if (output.size() + amount > R2MemoryCache.MAX_ENTRY_BYTES) {
                        // If an origin sends an inaccurate Content-Length, preserve
                        // the complete response as a stream rather than truncating it.
                        InputStream combined = new java.io.SequenceInputStream(
                            new ByteArrayInputStream(output.toByteArray()), source);
                        final HttpURLConnection openConnection = connection;
                        InputStream stream = new FilterInputStream(combined) {
                            @Override public void close() throws IOException {
                                try { super.close(); }
                                finally { openConnection.disconnect(); }
                            }
                        };
                        connection = null;
                        return streamedResponse(type, stream, 200, contentLength, openConnection);
                    }
                    output.write(buffer, 0, amount);
                }
                source.close();
                byte[] body = output.toByteArray();
                connection.disconnect();
                connection = null;
                R2MemoryCache.put(path, body, type, System.currentTimeMillis());
                R2MemoryCache.Entry entry = R2MemoryCache.get(path, System.currentTimeMillis());
                return jsonBody(body, entry != null);
            }

            InputStream stream;
            if ("HEAD".equalsIgnoreCase(method)) {
                stream = new ByteArrayInputStream(new byte[0]);
                connection.disconnect();
                connection = null;
            } else {
                final HttpURLConnection openConnection = connection;
                stream = new FilterInputStream(connection.getInputStream()) {
                    @Override public void close() throws IOException {
                        try { super.close(); }
                        finally { openConnection.disconnect(); }
                    }
                };
            }
            long responseLength = connection == null ? -1 : connection.getContentLengthLong();
            return streamedResponse(type, stream, status, responseLength, connection);
        } catch (Exception e) {
            if (connection != null) connection.disconnect();
            return failure(503, "R2 unavailable");
        }
    }

    private static WebResourceResponse cachedJson(R2MemoryCache.Entry entry) {
        return jsonBody(entry.copyBody(), true);
    }

    private static WebResourceResponse jsonBody(byte[] body, boolean cached) {
        WebResourceResponse response = new WebResourceResponse(
            "application/json", "UTF-8", new ByteArrayInputStream(body));
        response.setStatusCodeAndReasonPhrase(200, "OK");
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Cache-Control", cached ? "private, max-age=60" : "no-store");
        headers.put("Content-Length", Integer.toString(body.length));
        headers.put("X-Content-Type-Options", "nosniff");
        response.setResponseHeaders(headers);
        return response;
    }

    private static WebResourceResponse streamedResponse(
            String type, InputStream stream, int status, long contentLength,
            HttpURLConnection connection) {
        WebResourceResponse response = new WebResourceResponse(
            type, type.startsWith("text/") || "application/json".equals(type) ? "UTF-8" : null, stream);
        response.setStatusCodeAndReasonPhrase(status,
            status == 206 ? "Partial Content" : "OK");
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("X-Content-Type-Options", "nosniff");
        if (contentLength >= 0) headers.put("Content-Length", Long.toString(contentLength));
        if (connection != null) for (String h : new String[]{"Content-Range", "Accept-Ranges",
                "ETag", "Last-Modified"}) {
            String val = connection.getHeaderField(h);
            if (val != null) headers.put(h, val);
        }
        response.setResponseHeaders(headers);
        return response;
    }

    static String mime(String path, String supplied) {
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".vtt")) return "text/vtt";
        if (path.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
        if (path.endsWith(".xml")) return "application/xml";
        if (path.endsWith(".pdf")) return "application/pdf";
        if (path.endsWith(".mp4")) return "video/mp4";
        if (path.endsWith(".mp3")) return "audio/mpeg";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".webp")) return "image/webp";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (supplied != null) {
            String mime = supplied.split(";", 2)[0].trim().toLowerCase(java.util.Locale.ROOT);
            if (!mime.isEmpty() && mime.indexOf('/') > 0) return mime;
        }
        return "application/octet-stream";
    }

    private static WebResourceResponse failure(int status, String message) {
        WebResourceResponse response = new WebResourceResponse("text/plain", "UTF-8",
            new ByteArrayInputStream(message.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        String reason = status == 400 ? "Bad Request" : status == 404 ? "Not Found" :
            status == 405 ? "Method Not Allowed" : status == 416 ? "Range Not Satisfiable" :
            "Service Unavailable";
        response.setStatusCodeAndReasonPhrase(status, reason);
        response.setResponseHeaders(java.util.Collections.singletonMap("Cache-Control", "no-store"));
        return response;
    }
}
