package dev.fastorial.jobs.web;

import dev.fastorial.jobs.service.ApiKeyService;
import dev.fastorial.jobs.web.dto.ApiKeyDto;
import dev.fastorial.jobs.web.dto.ApiKeyRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Key management. Admin token only: API keys cannot manage API keys (see TokenAuthFilter). */
@RestController
@RequestMapping("/api/admin/api-keys")
public class ApiKeyController {

    private final ApiKeyService keys;

    public ApiKeyController(ApiKeyService keys) {
        this.keys = keys;
    }

    @GetMapping
    public List<ApiKeyDto> list() {
        return keys.list().stream().map(ApiKeyDto::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiKeyDto create(@Valid @RequestBody ApiKeyRequest request) {
        var created = keys.create(request.name());
        return ApiKeyDto.from(created.key(), created.plaintext());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@PathVariable long id) {
        keys.revoke(id);
    }
}
