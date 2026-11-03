package dev.fastorial.jobs.service;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.TreeMap;

/** Normalizes apply URLs and hashes them so duplicate postings can be detected. */
public final class UrlHasher {

    private static final Set<String> TRACKING_PARAMS = Set.of(
            "trackingid", "refid", "trk", "ref", "gclid", "fbclid", "source", "src", "utm_source",
            "utm_medium", "utm_campaign", "utm_term", "utm_content", "midtoken", "midsig", "lipi");

    private UrlHasher() {}

    public static String normalize(String url) {
        try {
            URI uri = URI.create(url.trim());
            String scheme = uri.getScheme() == null ? "https" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (host.startsWith("www.")) {
                host = host.substring(4);
            }
            String path = uri.getPath() == null ? "" : uri.getPath();
            while (path.length() > 1 && path.endsWith("/")) {
                path = path.substring(0, path.length() - 1);
            }
            TreeMap<String, String> query = new TreeMap<>();
            if (uri.getRawQuery() != null) {
                for (String pair : uri.getRawQuery().split("&")) {
                    if (pair.isEmpty()) continue;
                    int eq = pair.indexOf('=');
                    String key = eq < 0 ? pair : pair.substring(0, eq);
                    String lower = key.toLowerCase(Locale.ROOT);
                    if (TRACKING_PARAMS.contains(lower) || lower.startsWith("utm_")) continue;
                    query.put(lower, eq < 0 ? "" : pair.substring(eq + 1));
                }
            }
            StringBuilder sb = new StringBuilder(scheme).append("://").append(host);
            if (uri.getPort() > 0 && uri.getPort() != 80 && uri.getPort() != 443) {
                sb.append(':').append(uri.getPort());
            }
            sb.append(path);
            if (!query.isEmpty()) {
                sb.append('?');
                query.forEach((k, v) -> sb.append(k).append(v.isEmpty() ? "" : "=" + v).append('&'));
                sb.setLength(sb.length() - 1);
            }
            return sb.toString();
        } catch (IllegalArgumentException e) {
            return url.trim().toLowerCase(Locale.ROOT);
        }
    }

    public static String hash(String url) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(normalize(url).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
