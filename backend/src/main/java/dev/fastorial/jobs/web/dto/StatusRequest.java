package dev.fastorial.jobs.web.dto;

import dev.fastorial.jobs.domain.JobStatus;
import jakarta.validation.constraints.NotNull;

public record StatusRequest(@NotNull(message = "Status is required") JobStatus status) {}
