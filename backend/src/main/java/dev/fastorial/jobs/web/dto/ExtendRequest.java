package dev.fastorial.jobs.web.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** Days to add. Omit for the default expiry period. */
public record ExtendRequest(@Min(value = 1, message = "Days must be at least 1") @Max(value = 365, message = "Days must be at most 365") Integer days) {}
