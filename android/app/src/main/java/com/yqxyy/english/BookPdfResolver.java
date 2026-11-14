package com.yqxyy.english;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.SequenceInputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * APK-only replacement for Netlify's /book-download/*.pdf route.
 * The user's existing book catalogue supplies the Pone PDF source, or
 * Little Fox's verified C ID supplies the official PDF endpoint.
 * Restricted to a small HTTPS source allowlist: never an open proxy.
 */
final class BookPdfResolver {
    private BookPdfResolver() {}

    static boolean validSource(String value) {
        return value != null && (
            value.matches("https://u[.]pone[.]rs/[A-Za-z0-9]+[.]pdf") ||
            value.matches("https://res[.]littlefox[.]com/en/supplement/load_pdf/C[0-9]{7}")
        );
    }

    static WebResourceResponse intercept(WebResourceRequest request,String appHost) {
        if (request == null || appHost == null) return null;
        Uri uri=request.getUrl();
        if (!"https".equalsIgnoreCase(uri.getScheme()) ||
            !appHost.equalsIgnoreCase(uri.getHost())) return null;
        String path=uri.getPath();
        if (path==null || !path.startsWith("/book-download/")) return null;
        String id=path.substring("/book-download/".length());
        if (!id.matches("[a-z0-9-]{1,100}[.]pdf") ||
            !"GET".equalsIgnoreCase(request.getMethod())) return error(400);
        id=id.substring(0,id.length()-4);
        String source=uri.getQueryParameter("source");
        if (!validSource(source)) {
            if (id.matches("littlefox-c[0-9]{7}")) {
                source="https://res.littlefox.com/en/supplement/load_pdf/C"+
                    id.substring("littlefox-c".length());
            } else return error(404);
        }

        HttpURLConnection upstream=null;
        try {
            // Fail closed on unexpected redirects rather than allowing SSRF.
            URL url=new URL(source);
            for(int hop=0;hop<3;hop++){
                upstream=(HttpURLConnection)url.openConnection();
                upstream.setConnectTimeout(10000);
                upstream.setReadTimeout(30000);
                upstream.setInstanceFollowRedirects(false);
                upstream.setRequestProperty("Accept","application/pdf");
                int status=upstream.getResponseCode();
                if (status==301||status==302||status==307||status==308) {
                    String location=upstream.getHeaderField("Location");
                    URL destination=new URL(url,location==null?"":location);
                    upstream.disconnect();
                    if(!validSource(destination.toString())) return error(503);
                    url=destination;
                    continue;
                }
                if(status!=200){upstream.disconnect();return error(status==404?404:503);}
                final HttpURLConnection open=upstream;
                InputStream body=upstream.getInputStream();
                // Some upstreams label error HTML as a PDF. Preserve prefix
                // bytes and reject those rather than showing a corrupt reader.
                byte[] prefix=new byte[1024];
                int read=0;
                while(read<prefix.length){
                    int n=body.read(prefix,read,prefix.length-read);
                    if(n<0)break;
                    read+=n;
                }
                String first=new String(prefix,0,read,StandardCharsets.ISO_8859_1);
                if(!first.contains("%PDF-")){body.close();upstream.disconnect();return error(503);}
                InputStream stream=new SequenceInputStream(
                    new ByteArrayInputStream(prefix,0,read),
                    new FilterInputStream(body){
                        @Override public void close() throws IOException {
                            try{super.close();}finally{open.disconnect();}
                        }
                    }
                );
                WebResourceResponse response=new WebResourceResponse("application/pdf",null,stream);
                response.setStatusCodeAndReasonPhrase(200,"OK");
                java.util.Map<String,String> headers=new java.util.LinkedHashMap<>();
                headers.put("Content-Type","application/pdf");
                headers.put("Cache-Control","no-store");
                headers.put("X-Content-Type-Options","nosniff");
                String length=upstream.getHeaderField("Content-Length");
                if(length!=null && length.matches("[0-9]{1,15}"))
                    headers.put("Content-Length",length);
                response.setResponseHeaders(headers);
                return response;
            }
            if(upstream!=null)upstream.disconnect();
            return error(503);
        } catch(Exception failure){
            if(upstream!=null)upstream.disconnect();
            return error(503);
        }
    }

    private static WebResourceResponse error(int status){
        String message=status==400?"Invalid PDF request":status==404?"PDF not found":"PDF unavailable";
        WebResourceResponse response=new WebResourceResponse("text/plain","UTF-8",
            new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8)));
        response.setStatusCodeAndReasonPhrase(status,status==400?"Bad Request":
            status==404?"Not Found":"Service Unavailable");
        response.setResponseHeaders(Collections.singletonMap("Cache-Control","no-store"));
        return response;
    }
}
