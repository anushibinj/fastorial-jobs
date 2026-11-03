package dev.fastorial.jobs.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.fastorial.jobs.service.ApiKeyService;
import dev.fastorial.jobs.web.dto.ApiError;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Protects {@code /api/admin/**} with {@code X-Admin-Token} (or, for automations, an {@code X-API-Key}
 * created in the admin UI) and {@code /api/internal/**} with {@code X-Internal-Secret}. An unset (empty)
 * secret rejects every call, so a missing env var can never leave an endpoint open. API keys cannot
 * only reach the job and tag endpoints: managing keys needs the admin token.
 */
@Component
public class TokenAuthFilter extends OncePerRequestFilter {

    public static final String ADMIN_HEADER = "X-Admin-Token";
    public static final String API_KEY_HEADER = "X-API-Key";
    public static final String INTERNAL_HEADER = "X-Internal-Secret";

    private final String adminToken;
    private final String internalSecret;
    private final ObjectMapper mapper;
    private final ApiKeyService apiKeys;

    public TokenAuthFilter(@Value("${app.admin.token:}") String adminToken,
                           @Value("${app.internal.secret:}") String internalSecret,
                           ObjectMapper mapper,
                           ApiKeyService apiKeys) {
        this.adminToken = adminToken;
        this.internalSecret = internalSecret;
        this.mapper = mapper;
        this.apiKeys = apiKeys;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true; // CORS preflight
        String p = request.getRequestURI();
        return !(p.startsWith("/api/admin/") || p.startsWith("/api/internal/"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        boolean admin = req.getRequestURI().startsWith("/api/admin/");
        String expected = admin ? adminToken : internalSecret;
        String given = req.getHeader(admin ? ADMIN_HEADER : INTERNAL_HEADER);
        boolean ok = !expected.isEmpty() && given != null && constantTimeEquals(expected, given);
        if (!ok && admin && apiKeyAllowed(req.getRequestURI())) {
            ok = apiKeys.authenticate(req.getHeader(API_KEY_HEADER));
        }
        if (!ok) {
            res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            res.setContentType(MediaType.APPLICATION_JSON_VALUE);
            res.setHeader("Cache-Control", "no-store");
            mapper.writeValue(res.getOutputStream(), ApiError.of("UNAUTHORIZED", "Missing or invalid token"));
            return;
        }
        res.setHeader("Cache-Control", "no-store");
        chain.doFilter(req, res);
    }

    /**
     * API keys may only reach the job and tag endpoints. An allowlist on the raw URI, with anything that
     * could be normalised into another path ({@code ..}, {@code //}, {@code %}, {@code ;}) refused.
     */
    static boolean apiKeyAllowed(String uri) {
        if (uri.contains("..") || uri.contains("//") || uri.contains("%") || uri.contains(";")) return false;
        return uri.equals("/api/admin/jobs") || uri.startsWith("/api/admin/jobs/")
                || uri.equals("/api/admin/tags") || uri.startsWith("/api/admin/tags/");
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
