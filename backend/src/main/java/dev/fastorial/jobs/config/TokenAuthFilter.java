package dev.fastorial.jobs.config;

import com.fasterxml.jackson.databind.ObjectMapper;
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
 * Protects {@code /api/admin/**} with {@code X-Admin-Token} and {@code /api/internal/**} with
 * {@code X-Internal-Secret}. An unset (empty) secret rejects every call, so a missing env var
 * can never leave an endpoint open.
 */
@Component
public class TokenAuthFilter extends OncePerRequestFilter {

    public static final String ADMIN_HEADER = "X-Admin-Token";
    public static final String INTERNAL_HEADER = "X-Internal-Secret";

    private final String adminToken;
    private final String internalSecret;
    private final ObjectMapper mapper;

    public TokenAuthFilter(@Value("${app.admin.token:}") String adminToken,
                           @Value("${app.internal.secret:}") String internalSecret,
                           ObjectMapper mapper) {
        this.adminToken = adminToken;
        this.internalSecret = internalSecret;
        this.mapper = mapper;
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
        if (expected.isEmpty() || given == null || !constantTimeEquals(expected, given)) {
            res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            res.setContentType(MediaType.APPLICATION_JSON_VALUE);
            res.setHeader("Cache-Control", "no-store");
            mapper.writeValue(res.getOutputStream(), ApiError.of("UNAUTHORIZED", "Missing or invalid token"));
            return;
        }
        res.setHeader("Cache-Control", "no-store");
        chain.doFilter(req, res);
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
